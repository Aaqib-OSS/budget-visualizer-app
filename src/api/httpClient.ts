import { getBaseApiUrl, initBaseApiUrl } from '@constants'
import { devConsole } from '@utils/devConsole'
import { SESSION_TOKEN_KEY } from '@api/sessionStorageKeys'
import { buildQueryString } from '@api/buildQueryString'
import { HttpError } from '@api/HttpError'
import { isAbortError } from '@api/isAbortError'

// Callback-based handler so main.ts can wire in auth store + router
// without creating circular imports (auth store → httpClient).
let onUnauthorized: (() => void) | null = null

/**
 * Set once the handler has run for this session, and cleared only when a new
 * session starts (`rearmUnauthorizedHandler`, called from `persistSession`).
 *
 * Parallel requests that all fail with 401 settle in separate tasks, so a guard
 * re-armed on a microtask or timer would let each of them through — running
 * `logout()`, `queryClient.clear()` and the redirect once per request. Keying
 * the guard to the session lifecycle collapses them however far apart they
 * land: after the first 401 there is no session left for a later one to end.
 */
let handlingUnauthorized = false

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

/** Let the next 401 run the unauthorized handler again. Call when a session is established. */
export function rearmUnauthorizedHandler(): void {
  handlingUnauthorized = false
}

/**
 * `true` when the URL is absolute (starts with `http://` or `https://`). Same-
 * origin API calls go through `httpClient` as relative paths, so an absolute
 * URL effectively means a foreign origin (e.g. an S3 bucket). Used to skip
 * behaviors that only make sense for our own API: attaching the session Bearer
 * token, and routing 401s through the global unauthorized handler.
 */
function isAbsoluteUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url)
}

export type RequestOptions = {
  /** Query params. `undefined` and `null` values are left out. */
  params?: object
  signal?: AbortSignal
}

export type HttpResponse<T> = { data: T }

let baseURL = getBaseApiUrl()

// In DEV mode, resolve the base URL (checking if local server is running)
// before the first real request goes out.
const baseUrlReady: Promise<void> = initBaseApiUrl().then((resolvedUrl) => {
  baseURL = resolvedUrl
})

/** The JSON body when the response says it is JSON, its raw text otherwise, `undefined` when empty. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  return response.headers.get('Content-Type')?.includes('json') ? JSON.parse(text) : text
}

/**
 * A 401 from our own API means the session is gone. A failed login is a 401
 * too, but the login mutation reports that one itself.
 */
function handleUnauthorized(method: string, url: string): void {
  const isLoginAttempt = method === 'POST' && (url === '/login' || url.endsWith('/login'))
  if (isLoginAttempt || isAbsoluteUrl(url) || !onUnauthorized || handlingUnauthorized) return
  handlingUnauthorized = true
  onUnauthorized()
}

async function request<T>(
  method: string,
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<HttpResponse<T>> {
  // Ensure the base URL has been resolved before any request fires
  await baseUrlReady

  const headers = new Headers()
  // Only attach our session token to same-origin API calls. Absolute URLs go
  // somewhere else (e.g. an S3 bucket) and shouldn't receive the Bearer token.
  if (!isAbsoluteUrl(url)) {
    const token = localStorage.getItem(SESSION_TOKEN_KEY)
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  const fullUrl = `${isAbsoluteUrl(url) ? '' : baseURL}${url}${buildQueryString(options.params)}`
  devConsole('log', '[httpClient] Request URL:', url)
  devConsole('log', '[httpClient] Query Params:', options.params)

  let response: Response
  try {
    response = await fetch(fullUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    devConsole('error', '[httpClient] Network error for', url, 'with params:', options.params)
    throw new HttpError({ method, url })
  }

  const data = await readBody(response)
  if (!response.ok) {
    devConsole('error', '[httpClient] Error request URL:', url, 'with params:', options.params)
    if (response.status === 401) handleUnauthorized(method, url)
    throw new HttpError({ method, url, status: response.status, data })
  }

  devConsole('log', '[httpClient] Response from:', url, 'with params:', options.params)
  return { data: data as T }
}

/**
 * Response bodies default to `any`, as axios's did. Fetchers that don't name a
 * type (`httpClient.get('/days')`) relied on that; `unknown` would make each of
 * them fail to compile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = any

/**
 * The app's API client: `fetch` against the API base URL, with the session's
 * Bearer token. Resolves `{ data }`; rejects with `HttpError`, or with the
 * `AbortError` itself when `signal` fires.
 */
export const httpClient = {
  get: <T = Untyped>(url: string, options?: RequestOptions) => request<T>('GET', url, undefined, options),
  post: <T = Untyped>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', url, body, options),
  patch: <T = Untyped>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', url, body, options),
}
