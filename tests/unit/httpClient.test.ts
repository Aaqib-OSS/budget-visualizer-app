import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@api/HttpError'

// Mock constants before httpClient is imported so the module-level
// initBaseApiUrl() resolves immediately with a known value.
vi.mock('@constants', () => ({
  getBaseApiUrl: () => 'http://test-api',
  initBaseApiUrl: () => Promise.resolve('http://test-api'),
}))

// Silence devConsole calls during tests.
vi.mock('@utils/devConsole', () => ({
  devConsole: vi.fn(),
}))

// Dynamic import so the mocks above are in place first.
const { httpClient, setUnauthorizedHandler, rearmUnauthorizedHandler } = await import('@api/httpClient')

const fetchMock = vi.fn<typeof fetch>()

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** The URL and init of the nth `fetch` call. */
function call(n = 0): { url: string; init: RequestInit; headers: Headers } {
  const [url, init = {}] = fetchMock.mock.calls[n]!
  return { url: String(url), init, headers: new Headers(init.headers) }
}

describe('httpClient', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => json({}))
    vi.stubGlobal('fetch', fetchMock)
    // The guard is module state that only a new session clears.
    rearmUnauthorizedHandler()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    setUnauthorizedHandler(() => {})
  })

  describe('requests', () => {
    it('attaches Authorization header when token exists in localStorage', async () => {
      localStorage.setItem('token', 'test-jwt-token')
      await httpClient.get('/test')
      expect(call().headers.get('Authorization')).toBe('Bearer test-jwt-token')
    })

    it('does not attach Authorization header for cross-origin (absolute) URLs', async () => {
      localStorage.setItem('token', 'test-jwt-token')
      await httpClient.get('https://historical-counties.example.com/index.json')
      expect(call().url).toBe('https://historical-counties.example.com/index.json')
      expect(call().headers.has('Authorization')).toBe(false)
    })

    it('does not attach Authorization header when no token', async () => {
      await httpClient.get('/test')
      expect(call().headers.has('Authorization')).toBe(false)
    })

    it('prefixes the resolved base URL', async () => {
      await httpClient.get('/test')
      expect(call().url).toBe('http://test-api/test')
    })

    it('serializes params and drops undefined', async () => {
      await httpClient.get('/t', { params: { a: 1, b: undefined } })
      expect(call().url).toBe('http://test-api/t?a=1')
    })

    it('sends Content-Type application/json with a JSON body', async () => {
      await httpClient.post('/t', { a: 1 })
      expect(call().init.method).toBe('POST')
      expect(call().headers.get('Content-Type')).toBe('application/json')
      expect(call().init.body).toBe('{"a":1}')
    })

    it('sends no Content-Type without a body', async () => {
      await httpClient.get('/t')
      expect(call().headers.has('Content-Type')).toBe(false)
      expect(call().init.body).toBeUndefined()
    })

    it('passes the abort signal through', async () => {
      const controller = new AbortController()
      await httpClient.get('/t', { signal: controller.signal })
      expect(call().init.signal).toBe(controller.signal)
    })
  })

  describe('responses', () => {
    it('parses a JSON body into data', async () => {
      fetchMock.mockResolvedValueOnce(json([{ id: 1 }]))
      await expect(httpClient.get('/t')).resolves.toEqual({ data: [{ id: 1 }] })
    })

    it('returns undefined data for an empty 2xx body', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      await expect(httpClient.patch('/t', { a: 1 })).resolves.toEqual({ data: undefined })
    })

    it('rejects a non-2xx with HttpError carrying the parsed body', async () => {
      fetchMock.mockResolvedValueOnce(json({ message: 'duplicate' }, 409))
      const error = await httpClient.post('/t', {}).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: 409, method: 'POST', url: '/t', data: { message: 'duplicate' } })
    })

    it('keeps a non-JSON error body as text', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('<html>bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
      )
      const error = await httpClient.get('/t').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: 502, data: '<html>bad gateway</html>' })
    })

    it('keeps a JSON-labelled body that does not parse as raw text', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{"truncated":', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
      await expect(httpClient.get('/t')).resolves.toEqual({ data: '{"truncated":' })
    })

    it('still routes a 401 with a malformed JSON body to the unauthorized handler', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockResolvedValueOnce(
        new Response('not json', { status: 401, headers: { 'Content-Type': 'application/json' } }),
      )
      const error = await httpClient.get('/t').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: 401, data: 'not json' })
      expect(handler).toHaveBeenCalledOnce()
    })

    it('turns a body that fails mid-read into a status-less HttpError', async () => {
      const response = json({ ok: true })
      vi.spyOn(response, 'text').mockRejectedValueOnce(new TypeError('network error'))
      fetchMock.mockResolvedValueOnce(response)
      const error = await httpClient.get('/t').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: undefined, message: 'Network Error' })
    })

    it('keeps the status when an error body fails mid-read', async () => {
      const response = json({}, 503)
      vi.spyOn(response, 'text').mockRejectedValueOnce(new TypeError('network error'))
      fetchMock.mockResolvedValueOnce(response)
      await expect(httpClient.get('/t')).rejects.toMatchObject({ status: 503 })
    })

    it('still routes a 401 whose body fails mid-read to the unauthorized handler', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      const response = json({}, 401)
      vi.spyOn(response, 'text').mockRejectedValueOnce(new TypeError('network error'))
      fetchMock.mockResolvedValueOnce(response)
      await expect(httpClient.get('/t')).rejects.toMatchObject({ status: 401 })
      expect(handler).toHaveBeenCalledOnce()
    })

    it('rethrows an abort during the body read unchanged', async () => {
      const abort = new DOMException('x', 'AbortError')
      const response = json({ ok: true })
      vi.spyOn(response, 'text').mockRejectedValueOnce(abort)
      fetchMock.mockResolvedValueOnce(response)
      await expect(httpClient.get('/t')).rejects.toBe(abort)
    })

    it('rejects a transport failure with a status-less HttpError', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const error = await httpClient.get('/t').catch((e: unknown) => e)
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: undefined, message: 'Network Error' })
    })

    it('rethrows an abort unchanged and skips the 401 handler', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      const abort = new DOMException('x', 'AbortError')
      fetchMock.mockRejectedValueOnce(abort)
      await expect(httpClient.get('/t')).rejects.toBe(abort)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('401 handling', () => {
    const unauthorized = async () => json({}, 401)

    it('calls onUnauthorized handler on 401 response', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockImplementation(unauthorized)
      await httpClient.get('/protected').catch(() => {})
      expect(handler).toHaveBeenCalledOnce()
    })

    it('does not call onUnauthorized for POST /login 401 (handled by login mutation)', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockImplementation(unauthorized)
      await httpClient.post('/login', { email: 'a@b.co', password: 'x' }).catch(() => {})
      expect(handler).not.toHaveBeenCalled()
    })

    it('does not call onUnauthorized for cross-origin 401 (e.g. S3)', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockImplementation(unauthorized)
      await httpClient.get('https://historical-counties.example.com/index.json').catch(() => {})
      expect(handler).not.toHaveBeenCalled()
    })

    it('does not call handler for non-401 errors', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockImplementation(async () => json({}, 500))
      await httpClient.get('/fail').catch(() => {})
      expect(handler).not.toHaveBeenCalled()
    })

    // Each 401 settles in its own task, as parallel requests do in a browser. The
    // old microtask re-arm ran between them, so this called the handler 3 times.
    it('collapses 401s that settle in separate tasks into one handler call', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      let delay = 0
      fetchMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, (delay += 5)))
        return json({}, 401)
      })
      await Promise.allSettled([httpClient.get('/a'), httpClient.get('/b'), httpClient.get('/c')])
      expect(handler).toHaveBeenCalledOnce()
    })

    it('stays disarmed until a new session re-arms it', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      fetchMock.mockImplementation(unauthorized)

      await httpClient.get('/first').catch(() => {})
      expect(handler).toHaveBeenCalledOnce()

      // A later 401 in the same (already ended) session is not a new logout.
      await new Promise((resolve) => setTimeout(resolve, 0))
      await httpClient.get('/late').catch(() => {})
      expect(handler).toHaveBeenCalledOnce()

      // Signing in again (persistSession) re-arms it.
      rearmUnauthorizedHandler()
      await httpClient.get('/second').catch(() => {})
      expect(handler).toHaveBeenCalledTimes(2)
    })
  })
})
