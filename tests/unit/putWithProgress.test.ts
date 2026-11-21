import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@api/HttpError'
import { isAbortError } from '@api/isAbortError'
import { putWithProgress } from '@api/putWithProgress'

/**
 * Just enough of XMLHttpRequest for the helper: records what it was asked to
 * send and lets each test fire the events a real upload would.
 */
class FakeXhr {
  static last: FakeXhr | undefined
  static opened = 0

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown
  status = 0
  responseText = ''
  aborted = 0
  upload: { onprogress: ((e: Partial<ProgressEvent>) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    FakeXhr.opened++
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.aborted++
  }
  respond(status: number, responseText = '') {
    this.status = status
    this.responseText = responseText
    this.onload?.()
  }
}

const URL_ = 'https://transactions-bucket.s3.us-east-1.amazonaws.com/u/1.csv?X-Amz-Signature=abc'
const file = new Blob(['date,amount\n'], { type: 'text/csv' })
const xhr = () => FakeXhr.last!

describe('putWithProgress', () => {
  beforeEach(() => {
    FakeXhr.last = undefined
    FakeXhr.opened = 0
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a PUT with the body and headers', () => {
    void putWithProgress(URL_, file, { headers: { 'Content-Type': 'text/csv' } })
    expect(xhr().method).toBe('PUT')
    expect(xhr().url).toBe(URL_)
    expect(xhr().headers).toEqual({ 'Content-Type': 'text/csv' })
    expect(xhr().body).toBe(file)
  })

  it('reports progress as a fraction', () => {
    const onProgress = vi.fn()
    void putWithProgress(URL_, file, { onProgress })
    xhr().upload.onprogress!({ lengthComputable: true, loaded: 25, total: 100 })
    xhr().upload.onprogress!({ lengthComputable: false, loaded: 50, total: 0 })
    xhr().upload.onprogress!({ lengthComputable: true, loaded: 100, total: 100 })
    expect(onProgress.mock.calls).toEqual([[0.25], [1]])
  })

  it('resolves on 2xx', async () => {
    const done = putWithProgress(URL_, file)
    xhr().respond(200)
    await expect(done).resolves.toBeUndefined()
  })

  it('rejects a non-2xx with HttpError', async () => {
    const done = putWithProgress(URL_, file)
    xhr().respond(403, '<Error>AccessDenied</Error>')
    const error = await done.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ method: 'PUT', status: 403, data: '<Error>AccessDenied</Error>' })
  })

  it('rejects a network failure without a status', async () => {
    const done = putWithProgress(URL_, file)
    xhr().onerror!()
    const error = await done.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: undefined, message: 'Network Error' })
  })

  it('rejects a timeout without a status', async () => {
    const done = putWithProgress(URL_, file)
    xhr().ontimeout!()
    await expect(done).rejects.toMatchObject({ status: undefined, message: 'Network Error' })
  })

  it('aborts in flight', async () => {
    const controller = new AbortController()
    const done = putWithProgress(URL_, file, { signal: controller.signal })
    controller.abort()
    const error = await done.catch((e: unknown) => e)
    expect(xhr().aborted).toBe(1)
    expect(isAbortError(error)).toBe(true)
  })

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await putWithProgress(URL_, file, { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(error)).toBe(true)
    expect(FakeXhr.opened).toBe(0)
  })

  it('stops listening for abort once settled', async () => {
    const controller = new AbortController()
    const done = putWithProgress(URL_, file, { signal: controller.signal })
    xhr().respond(204)
    await done
    controller.abort()
    expect(xhr().aborted).toBe(0)
  })
})
