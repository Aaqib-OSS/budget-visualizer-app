# Drop axios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `axios` (~48 KB minified, ~15 KB gzip, in the shared entry chunk) by moving `httpClient` onto `fetch` and the CSV upload onto a small `XMLHttpRequest` helper, without changing any call site's shape or any user-visible behavior.

**Architecture:** One app-owned error type, `HttpError`, replaces `AxiosError` everywhere an error is inspected (message extraction, retry policy, logging, the observability 403 check). `httpClient` keeps its exact public shape (`get`/`post`/`patch` resolving to `{ data }`), so the 33 call sites and the many tests that mock `@api/httpClient` don't change. The one thing `fetch` can't do, upload progress, gets its own XHR helper, `putWithProgress`.

**Tech Stack:** SolidJS, TanStack Query v5, Vitest (jsdom, `TZ=America/New_York`), Playwright, Bun.

**Spec:** None separate. The decisions were made in conversation and are recorded in Global Constraints below.

## Global Constraints

- Call sites keep compiling unchanged: `httpClient.get<T>(url, { params, signal })`, `httpClient.post<T>(url, body, { signal })` and `httpClient.patch<T>(url, body)` resolve to `{ data: T }`. No `put`/`delete` (none are used).
- Error messages match axios's wording, because tests and fallbacks surface them: `Request failed with status code ${status}`, and `Network Error` when there is no response.
- Cancellation stays a non-error everywhere: an aborted request is never retried, never logged, and never routed to the 401 handler.
- The 401 rules in `httpClient.ts` carry over exactly: skip `POST …/login`, skip absolute URLs, and fire the handler at most once per session (`handlingUnauthorized`, re-armed only by `rearmUnauthorizedHandler`).
- The Bearer token goes only to relative URLs, never to absolute ones (S3).
- `await baseUrlReady` before every request, and keep the DEV-mode `initBaseApiUrl()` resolution.
- No new runtime dependencies. No CSP change: `connect-src` already covers `fetch` and XHR to the same hosts.
- CLAUDE.md rules apply: `noUncheckedIndexedAccess`, one concern per file in `src/api/` and `src/utils/`, `void` for fire-and-forget, `devConsole` for logs (never log a token or a login response).
- Mutations stay at `retry: false`. `shouldRetryQuery` keeps its policy: retry transport failures and 5xx, capped at `MAX_QUERY_RETRIES`; never 4xx, aborts, or errors thrown by our own code.

## Review Focus

1. **Non-JSON error body** (API Gateway's HTML/text 502, S3's XML 403). Expected: an `HttpError` with that status and `data` as the raw string, and `extractApiErrorMessage` falls back to `Request failed with status code 502`, never a JSON parse error. Test in Task 3.
2. **Empty 2xx body** (a `204` or empty `PATCH` response). Expected: resolves `{ data: undefined }` and does not throw. Test in Task 3.
3. **Query cancelled mid-flight** (navigating away aborts the `signal`). Expected: the fetch `AbortError` propagates unchanged; `shouldRetryQuery` returns `false`; `logRequestError` logs nothing. Tests in Task 3.
4. **Special characters in params** (memo names like `A&B, C`). Expected: encoded so the server gets the original value back; `undefined`/`null` dropped. Test in Task 1.
5. **Expired presigned URL** (S3 answers `403` to the CSV `PUT`). Expected: `putWithProgress` rejects with `HttpError` status 403, and the import page shows its error state with progress reset to 0. Test in Task 2.

---

### Task 1: Error type, abort check, query-string builder

**Files:**

- Create: `src/api/HttpError.ts`, `src/api/isAbortError.ts`, `src/api/buildQueryString.ts`
- Test: `tests/unit/HttpError.test.ts`, `tests/unit/buildQueryString.test.ts`

**Interfaces:**

- Produces:
  - `class HttpError extends Error` with `name = 'HttpError'`, readonly `method: string`, `url: string`, `status: number | undefined` (undefined = no response), `data: unknown`. Constructor: `new HttpError(init: { method: string; url: string; status?: number; data?: unknown })`. The message comes from the status (see Global Constraints).
  - `isAbortError(error: unknown): boolean`: `true` for any `Error` or `DOMException` whose `name === 'AbortError'`.
  - `buildQueryString(params: object | undefined): string`: `''` when there's nothing to send, otherwise `'?'` plus `URLSearchParams` output. Skips `undefined` and `null`; stringifies numbers and booleans. Typed `object`, not `Record<string, …>`, because interfaces like `TransactionQueryParams` aren't assignable to index signatures.

- [ ] **Step 1: Write the failing tests**
  - `HttpError`: `new HttpError({ method: 'GET', url: '/x', status: 409, data: { message: 'dup' } })` has `message === 'Request failed with status code 409'`, `status === 409`, `data` deep-equal to the input, `instanceof Error`, `name === 'HttpError'`. With no `status`: `message === 'Network Error'`, `status === undefined`.
  - `isAbortError`: `true` for `new DOMException('x', 'AbortError')`; `true` for an `Error` with `name = 'AbortError'`; `false` for `new HttpError({ method: 'GET', url: '/x' })`, `new Error('x')`, `'AbortError'` and `undefined`.
  - `buildQueryString`: `undefined` → `''`; `{}` → `''`; `{ a: undefined, b: null }` → `''`; `{ count: true, limit: 50 }` → `'?count=true&limit=50'`; `{ memoName: 'A&B, C' }` → `'?memoName=A%26B%2C+C'`.

- [ ] **Step 2: Run them and confirm they fail**
      Run: `bun run test tests/unit/HttpError.test.ts tests/unit/buildQueryString.test.ts`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three files** to the interfaces above.

- [ ] **Step 4: Run them and confirm they pass**
      Same command. Expected: PASS.

- [ ] **Step 5: Commit**
      `git commit -m "feat(api): add HttpError, isAbortError and buildQueryString"`

---

### Task 2: `putWithProgress` and the CSV upload

**Files:**

- Create: `src/api/putWithProgress.ts`
- Modify: `src/api/hooks/transactions/useCreateCsvImport.ts` (the `axios.put` call and the `onUploadProgress` callback)
- Test: `tests/unit/putWithProgress.test.ts` (new); `tests/unit/useCreateCsvImport.test.ts` (mock target changes)

**Interfaces:**

- Consumes: `HttpError` (Task 1).
- Produces: `putWithProgress(url: string, body: Blob, options?: { headers?: Record<string, string>; signal?: AbortSignal; onProgress?: (fraction: number) => void }): Promise<void>`.
  - Calls `onProgress(loaded / total)` from `xhr.upload.onprogress` when `lengthComputable`, capped at 1.
  - Resolves on 2xx. On other statuses, rejects with `HttpError({ method: 'PUT', url, status, data: xhr.responseText })`.
  - `onerror`/`ontimeout` reject with `HttpError({ method: 'PUT', url })` (no status).
  - An already-aborted `signal` rejects with `new DOMException('Aborted', 'AbortError')` without opening the XHR. An abort during the upload calls `xhr.abort()` and rejects the same way. Remove the abort listener once settled.
  - No auth header and no base URL: the URL is a presigned absolute S3 URL.

- [ ] **Step 1: Write the failing helper tests**
      Use a `FakeXhr` class installed with `vi.stubGlobal('XMLHttpRequest', FakeXhr)`. It records `open(method, url)`, `setRequestHeader`, `send(body)` and `abort()`, and exposes `upload.onprogress`, `onload`, `onerror`, `status` and `responseText` so tests can drive them.
  - `sends a PUT with the body and headers`: `open` called with `('PUT', url)`; `Content-Type` header set; `send` receives the same `Blob`.
  - `reports progress as a fraction`: firing progress `{ lengthComputable: true, loaded: 25, total: 100 }` and then `{ …, loaded: 100 }` calls `onProgress` with `0.25` and then `1`. A `lengthComputable: false` event doesn't call it.
  - `resolves on 2xx`: `status = 200`, then `onload` → resolves `undefined`.
  - `rejects a non-2xx with HttpError` (Review Focus 5): `status = 403`, `responseText = '<Error>…</Error>'` → rejects `HttpError` with `status === 403` and `data === '<Error>…</Error>'`.
  - `rejects a network failure without a status`: `onerror` → `HttpError` with `status === undefined`, `message === 'Network Error'`.
  - `aborts in flight`: `controller.abort()` after `send` → `xhr.abort` called once; rejects with `isAbortError(e) === true`.
  - `rejects immediately when already aborted`: aborted signal → rejects with an abort error; `open` never called.

- [ ] **Step 2: Run and confirm they fail**
      `bun run test tests/unit/putWithProgress.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `putWithProgress`** to the interface above.

- [ ] **Step 4: Run and confirm they pass.**

- [ ] **Step 5: Switch the hook and its test**
      In `useCreateCsvImport.ts`, replace `axios.put(...)` with `putWithProgress(uploadUrl, file, { headers: { 'Content-Type': contentType }, signal, onProgress: setProgress })` and drop the axios import. In `useCreateCsvImport.test.ts`, replace `vi.mock('axios', …)` with `vi.mock('@api/putWithProgress', () => ({ putWithProgress }))`, and have `reportProgress(fraction)` call the captured `options.onProgress`. Delete the `falls back to axios progress when the total is unknown` case; the helper's progress test covers that now. Every other case keeps its assertions.

- [ ] **Step 6: Run both test files and the import page test**
      `bun run test tests/unit/putWithProgress.test.ts tests/unit/useCreateCsvImport.test.ts tests/unit/DataImportPage.test.tsx`. Expected: PASS.

- [ ] **Step 7: Commit**
      `git commit -m "feat(api): upload CSVs with an XHR helper instead of axios.put"`

---

### Task 3: `httpClient` on `fetch`, and error consumers on `HttpError`

These two halves land together: a consumer checking for `HttpError` while the client still throws `AxiosError` would misreport every failure.

**Files:**

- Modify: `src/api/httpClient.ts` (rewrite; keep the 401 and absolute-URL comments, which still apply), `src/api/extractApiErrorMessage.ts`, `src/api/shouldRetryQuery.ts`, `src/api/queryClient.ts`, `src/components/observability/infrastructure/InfrastructureTab.tsx:11`
- Test (port from `AxiosError` to `HttpError`): `tests/unit/httpClient.test.ts`, `extractApiErrorMessage.test.ts`, `shouldRetryQuery.test.ts`, `queryClientErrorLogging.test.ts`, `ObservabilityInfrastructureTab.test.tsx`, `ApiErrorAlert.test.tsx`, `apiErrorAlertCallSites.test.tsx`, `createTransactionsTableCategoryAssignment.test.ts`, `useBudgetCategoriesPage.test.tsx`, `createMemosTableMutations.test.tsx`, `useMemoSummaryTable.test.tsx`

**Interfaces:**

- Consumes: `HttpError`, `isAbortError`, `buildQueryString` (Task 1).
- Produces: `httpClient: { get<T = unknown>(url: string, options?: RequestOptions): Promise<HttpResponse<T>>; post<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>; patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> }`, where `RequestOptions = { params?: object; signal?: AbortSignal }` and `HttpResponse<T> = { data: T; status: number }`. `setUnauthorizedHandler` and `rearmUnauthorizedHandler` keep their signatures.
- Request rules:
  - Final URL = `baseURL + url + buildQueryString(params)`, where `baseURL` is a module `let`, initialized from `getBaseApiUrl()` and replaced when `initBaseApiUrl()` resolves. Absolute URLs skip `baseURL` and the token.
  - Send `Content-Type: application/json` and a `JSON.stringify` body only when `body !== undefined`.
- Response rules:
  - Read `response.text()`. Empty → `data` is `undefined`. If `content-type` includes `json`, `JSON.parse` it; otherwise `data` is the raw string.
  - Non-2xx → throw `HttpError({ method, url, status, data })`, after the 401 check.
  - A `fetch` rejection that `isAbortError` → rethrow unchanged. Any other rejection → throw `HttpError({ method, url })`.

- [ ] **Step 1: Port `tests/unit/httpClient.test.ts` to a stubbed `fetch`**
      Use `vi.stubGlobal('fetch', vi.fn<typeof fetch>())`, returning `new Response(body, { status, headers })`. Keep every existing case name and assertion, reading headers and URL from `fetch.mock.calls[0]`. The `defaults` cases become: `sends Content-Type application/json with a body`, `sends no Content-Type without a body`, and `prefixes the resolved base URL` (`fetch` called with `'http://test-api/test'`). Add:
  - `serializes params and drops undefined`: `get('/t', { params: { a: 1, b: undefined } })` → URL ends `'/t?a=1'`.
  - `parses a JSON body into data`.
  - `returns undefined data for an empty 2xx body` (Review Focus 2): `new Response(null, { status: 204 })` → `{ data: undefined, status: 204 }`.
  - `keeps a non-JSON error body as text` (Review Focus 1): a `502` with `text/html` body `'<html>bad gateway</html>'` rejects `HttpError` with `status === 502` and `data === '<html>bad gateway</html>'`.
  - `rejects a transport failure with a status-less HttpError`: `fetch` rejects `new TypeError('Failed to fetch')` → `HttpError`, `status === undefined`.
  - `rethrows an abort unchanged and skips the 401 handler`: `fetch` rejects `new DOMException('x', 'AbortError')` → same object rethrown; handler not called.

- [ ] **Step 2: Port the consumer tests**
      Replace each `AxiosError` factory (`axiosError`, `axiosErrorWithStatus`, `httpError`, `transportError`, inline `new AxiosError(...)`) with `new HttpError({ method: 'GET', url: '/x', status, data })`. Replace `CanceledError` with `new DOMException('x', 'AbortError')`. Assertions stay the same. In `queryClientErrorLogging.test.ts`, the `it.each` silent cases are a 401 `HttpError` and an `AbortError` (Review Focus 3); in `shouldRetryQuery.test.ts`, add `never retries an AbortError` (Review Focus 3).

- [ ] **Step 3: Run the ported tests and confirm they fail**
      `bun run test tests/unit/httpClient.test.ts tests/unit/shouldRetryQuery.test.ts tests/unit/extractApiErrorMessage.test.ts tests/unit/queryClientErrorLogging.test.ts`. Expected: FAIL (the client still uses axios; consumers check `axios.isAxiosError`).

- [ ] **Step 4: Rewrite `httpClient.ts`** to the interface and rules above.

- [ ] **Step 5: Switch the consumers**
      `extractApiErrorMessage`: `error instanceof HttpError` and `data` is an object with a non-empty string `message`. `shouldRetryQuery`: `isAbortError` → `false`; an `HttpError` with no status → `true`; `status >= 500` → `true`; anything else → `false`. `queryClient.logRequestError`: skip an `HttpError` with status 401, and skip `isAbortError`. `InfrastructureTab.isForbidden`: `error instanceof HttpError && error.status === 403`.

- [ ] **Step 6: Run the full unit suite**
      `bun run test`. Expected: all pass, including the call-site tests that mock `@api/httpClient` with `{ data }`, unchanged.

- [ ] **Step 7: Commit**
      `git commit -m "refactor(api): run httpClient on fetch and inspect HttpError instead of AxiosError"`

---

### Task 4: Remove the dependency and verify

**Files:**

- Modify: `package.json`, `bun.lock`, `CLAUDE.md:132` (the API-errors bullet: replace "AxiosError" with "HttpError")

- [ ] **Step 1: Confirm nothing imports axios**
      `grep -rn "axios" src tests`. Expected: no matches.

- [ ] **Step 2: Remove it**
      `bun remove axios`.

- [ ] **Step 3: Update `CLAUDE.md:132`**
      The bullet should read: a 4xx then reads "HttpError" / "Request failed with status code 409" and drops the server's `message`.

- [ ] **Step 4: Run the full gate**
      `bun run prepush && bun run test && bun run test:e2e`. Expected: the only lint warning is the existing one in `useSplitBudgetCategoryDrawer.ts`, and all unit and E2E tests pass.

- [ ] **Step 5: Measure the result**
      Run `bunx vite build --manifest` and the per-route manifest script used in PR #139 to compare against `main`. Expected: the entry chunk drops by about 15 KB gzip. Record before/after in the PR body.

- [ ] **Step 6: Commit, push and open the PR**
      `git commit -m "chore: drop axios"`, then push and open a PR against `main`. Use `gh auth switch -u kylemichaelreaves` first if `gh` is on the work account.
