# budget-visualizer-app

A SolidJS client which hits my resourceQuerier.

<p>
  <img src="docs/logos/solidjs.svg" alt="SolidJS" title="SolidJS" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/typescript.svg" alt="TypeScript" title="TypeScript" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/vite.svg" alt="Vite" title="Vite" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/bun.svg" alt="Bun" title="Bun" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/tailwindcss.svg" alt="Tailwind CSS" title="Tailwind CSS" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/tanstack-query.svg" alt="TanStack Query" title="TanStack Query" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/d3.svg" alt="D3" title="D3" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/vitest.svg" alt="Vitest" title="Vitest" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/playwright.svg" alt="Playwright" title="Playwright" height="44" />
  &nbsp;&nbsp;
  <img src="docs/logos/storybook.svg" alt="Storybook" title="Storybook" height="44" />
</p>

## Architecture

The app is the SolidJS client in a small serverless stack: it talks to **resourceQuerier** (a Node Lambda behind API Gateway) for every read and write, while CSV statements are ingested asynchronously by **transactions-bucket-to-db** (a Python Lambda triggered by S3) into a shared PostgreSQL database.

### CSV ingestion pipeline

Uploading a statement issues a presigned S3 `PUT`; the `ObjectCreated` event triggers the ingestion Lambda, which parses, dedupes, and upserts rows into PostgreSQL.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/ingestion-pipeline-dark.png" />
  <img alt="CSV ingestion pipeline" src="docs/diagrams/ingestion-pipeline.png" />
</picture>

### Making a query (read path)

Reads are user-scoped: API Gateway authorizes the JWT, then resourceQuerier assembles a `WHERE user_id = $1` query before returning JSON — cached client-side by TanStack Query.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/query-sequence-dark.png" />
  <img alt="Query sequence" src="docs/diagrams/query-sequence.png" />
</picture>

## Usage

This project uses **[Bun](https://bun.sh)** to install dependencies, run the dev server, and build locally.

```bash
bun install
cp .env.example .env   # then fill in VITE_APIGATEWAY_URL
git config core.hooksPath .githooks   # optional, see Git hooks below
```

## Environment

Vite loads `.env` for both the client (`import.meta.env`) and `vite.config.ts` (`loadEnv`). See [`.env.example`](.env.example).

| Variable                  | Used by                              | Purpose                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_APIGATEWAY_URL`     | `src/constants.ts`, `vite.config.ts` | API Gateway stage URL (no `/api/v1`). Production calls `${VITE_APIGATEWAY_URL}/api/v1` and the build's CSP allowlists this origin in `connect-src`. Unset means a relative `/api/v1`. The dev server proxies `/api/v1` to it, with a built-in fallback URL when unset. |
| `VITE_PROXY_LOCAL_LAMBDA` | `vite.config.ts` (dev only)          | `1` proxies `/api/v1` to a local resourceQuerier on `http://127.0.0.1:3000` (`sam local start-api`). If it isn't reachable, the app falls back to the gateway via `/api/gateway`.                                                                                      |

## Available Scripts

In the project directory, you can run:

### `bun run dev`

Runs the app in development mode.<br>
Open [http://localhost:5173](http://localhost:5173) in the browser (see `vite.config.ts` if the port differs).

### `bun run build`

Type-checks and builds the app for production into the `dist` folder.<br>
Solid is bundled in production mode with hashed filenames.

### `bun run preview`

Serves the production build locally (useful for checking the built app before deploy).

### Checks

| Script                            | What it runs                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `bun run lint` / `lint:fix`       | ESLint over `src`, `tests`, and root configs                                 |
| `bun run format` / `format:check` | Prettier write / check                                                       |
| `bun run typecheck`               | `tsc -b`: the app, node configs, `.storybook/`, unit tests, and e2e projects |
| `bun run prepush`                 | `lint` + `format:check` + `typecheck`, the same gates CI runs                |

### Storybook

```bash
bun run storybook        # dev server on http://localhost:6006
bun run build-storybook  # static build (CI builds it too)
```

Stories mock the API with MSW (`msw-storybook-addon`).

## Testing

Unit and component tests use **Vitest** + **jsdom** + **@solidjs/testing-library**:

```bash
bun run test           # single run
bun run test:watch     # watch mode
bun run test:coverage  # with coverage
```

Use `bun run test`, not `bun test` (that is Bun's own runner). The scripts pin `TZ=America/New_York` so date bugs that are invisible in UTC fail locally and in CI.

End-to-end tests live under **`tests/e2e/`** and use **Playwright** against a production preview (`vite preview` on port 4173). Unit and component tests live under **`tests/unit/`**. The first Playwright run needs browsers installed once:

```bash
bunx playwright install chromium
bun run test:e2e
```

E2E tests stub `/api/v1/*` in the browser and seed `localStorage` so authenticated routes load without a real API. Run everything:

```bash
bun run test:all
```

## Git hooks

Tracked hooks live in `.githooks/`; enable them once per clone with `git config core.hooksPath .githooks`.

- `pre-commit` runs `bun run test`.
- `pre-push` runs `bun run prepush`.

## CI

`.github/workflows/ci.yml` runs **Lint & Format**, **Typecheck**, **Unit Tests**, and **E2E Tests**, which are required to merge into `main`, plus a Storybook build and a **SonarQube** scan on SonarCloud. The SonarCloud quality gate is advisory: the scan skips itself when `SONAR_TOKEN` is unavailable (fork and Dependabot PRs). See `CLAUDE.md` for why the job names must not change.

## Deployment

Produce a deployable bundle with `bun run build` (output in `dist/`). Learn more in the Vite [static deploy guide](https://vite.dev/guide/static-deploy.html).
