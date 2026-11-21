/**
 * A failed request, from `httpClient` or `putWithProgress`. The one error shape
 * that `extractApiErrorMessage`, `shouldRetryQuery` and the query-client logger
 * inspect.
 *
 * `status` is `undefined` when no response arrived at all (DNS failure, reset,
 * timeout, CORS). `data` is the parsed JSON body when the response was JSON,
 * otherwise its raw text (an API Gateway HTML page, an S3 XML error).
 *
 * The message is `Request failed with status code N`, or `Network Error` with no
 * response, so fallbacks that surface it read the same everywhere.
 */
export class HttpError extends Error {
  override readonly name = 'HttpError'
  readonly method: string
  readonly url: string
  readonly status: number | undefined
  readonly data: unknown

  constructor(init: { method: string; url: string; status?: number; data?: unknown }) {
    super(init.status === undefined ? 'Network Error' : `Request failed with status code ${init.status}`)
    this.method = init.method
    this.url = init.url
    this.status = init.status
    this.data = init.data
  }
}
