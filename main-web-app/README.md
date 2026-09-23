# Knogest Dashboard

Next.js 16 App Router dashboard with React 19, TypeScript, Tailwind CSS,
Server Actions, a server-only API adapter, and OpenAPI-generated Kubb clients.
It is the Web client for the Fastify API; Fastify remains the authority for
identity, sessions, Corporation/Company scope, and authorization.

Begin with [the project documentation index](../docs/index.md). Route
composition lives in `src/app`, domain behavior lives in `src/features`, and
reusable UI, layout, and route shells live in `src/components`.

## Local configuration

```env
API_BASE_URL="http://localhost:3333"
APP_HOST="piloto.localhost:3000"
AUTH_COOKIE_MODE="local"
```

Run `pnpm dev` and open `http://piloto.localhost:3000`. Fastify is the sole Session authority; Next.js stores server-confidential credential material only in host-only `HttpOnly` cookies.

## API contract

`../main-api/artifacts/openapi.json` is the canonical public contract. Run
`pnpm generate:api` after an intentional contract change; generated files under
`src/generated` are never edited manually. See
[`docs/API_CLIENTS.md`](./docs/API_CLIENTS.md) for the server-only transport,
session renewal, and Server Action boundary.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:api
pnpm check:api
pnpm build
pnpm test:e2e
```

`pnpm validate:api` validates the contract input and `pnpm check:api` verifies
that regeneration would not change committed generated output. Browser tests
start the isolated API/database test environment defined by the API project.
