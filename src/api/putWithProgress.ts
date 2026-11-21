import { HttpError } from '@api/HttpError'

/**
 * `PUT` a file and report upload progress, for the presigned S3 URL behind CSV
 * import. `fetch` has no upload-progress events, hence `XMLHttpRequest`.
 *
 * Sends no auth header and uses no base URL: the URL is absolute and already
 * signed. Resolves on 2xx; rejects with `HttpError` otherwise (S3's XML error
 * body as `data`), with a status-less `HttpError` on a network failure or
 * timeout, and with an `AbortError` when `signal` fires.
 */
export function putWithProgress(
  url: string,
  body: Blob,
  options: {
    headers?: Record<string, string>
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
  } = {},
): Promise<void> {
  const { headers = {}, signal, onProgress } = options

  return new Promise<void>((resolve, reject) => {
    const abortError = () => new DOMException('Aborted', 'AbortError')
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const xhr = new XMLHttpRequest()
    const onAbort = () => {
      xhr.abort()
      reject(abortError())
    }
    const settle = (fn: () => void) => {
      signal?.removeEventListener('abort', onAbort)
      fn()
    }

    xhr.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total))
    }
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new HttpError({ method: 'PUT', url, status: xhr.status, data: xhr.responseText }))
      })
    xhr.onerror = () => settle(() => reject(new HttpError({ method: 'PUT', url })))
    xhr.ontimeout = xhr.onerror

    signal?.addEventListener('abort', onAbort, { once: true })
    xhr.send(body)
  })
}
