# KnoGest API

Fastify 5 API for KnoGest, written in TypeScript with Prisma, PostgreSQL, Zod,
JWT, Swagger, and Vitest. It is the authoritative runtime for identity,
persisted sessions, Corporation/Company scope, authorization, and domain
consistency.

Start with [the project documentation index](../docs/index.md). Before changing
code, read `AGENTS.md` and the documents in `docs/` that apply to the module.

## Prerequisites

- Node `22.22.3`
- pnpm `10.33.0`
- Docker and Docker Compose for local PostgreSQL

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The development fixture uses `piloto.localhost`. Open the dashboard at
`http://piloto.localhost:3000` so host-based Corporation resolution agrees
with the seeded domain.

The local seed is development-only. Its administrator credentials are
documented in the fixture source and must never be copied into deployment
configuration or production examples.

## API contract

Swagger UI is available at `/docs`. The committed
[`artifacts/openapi.json`](./artifacts/openapi.json) is the canonical public
contract: it defines every path, request, response, authentication requirement,
and error shape. Do not maintain a parallel exhaustive route list in this file.

The API is grouped into Auth, Commercial, Fleet, Workforce, Projects, Project
daily reports, Project productions, and Earthwork catalogs. Dashboard clients
are generated from the OpenAPI artifact in `../main-web-app/src/generated`.

## Architecture

```text
controller -> validation -> service -> handler -> Prisma -> response
```

Controllers own Fastify routes and OpenAPI schemas; services hold domain rules;
handlers own persistence and trusted scope filters. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and
[`docs/TENANCY.md`](./docs/TENANCY.md) for the full boundary rules.

## Common commands

```bash
pnpm dev             # watch-mode API
pnpm build           # compile src/ to dist/
pnpm start           # run the compiled API
pnpm typecheck       # TypeScript validation
pnpm lint            # ESLint and architecture checks
pnpm format:check    # Prettier validation
pnpm test            # unit tests
pnpm test:integration
pnpm check:openapi   # verify artifact matches Fastify schemas
pnpm generate:openapi
pnpm check:personal-data-gate
```

For a public route change, update the route schema and relevant API/domain
documentation, run `pnpm generate:openapi`, then validate the dashboard in
`../main-web-app` with `pnpm validate:api` and `pnpm check:api`.

## Isolated integration database

Integration tests use only a PostgreSQL database whose name ends in `_test`.
The test command terminates active test connections, recreates that isolated
database, and applies committed migrations with `prisma migrate deploy`; it
does not run `prisma db push`.

```bash
docker compose -f docker-compose.dev.yml up -d --wait postgres_test
pnpm test:integration
```

Set `TEST_DATABASE_URL` only when another isolated PostgreSQL 16 instance is
required.

## Administrative CLI

Administrative passwords are accepted through stdin, not shell arguments.

```bash
printf '%s\n' "$ADMIN_PASSWORD" | pnpm admin -- provision \
  --corporation-name "Pilot Corporation" \
  --domain piloto.localhost \
  --admin-email master@example.com \
  --company "Company One" \
  --password-stdin

pnpm admin -- company:add --corporation-id <uuid> --name "Company Two"
pnpm admin -- password:reset --corporation <uuid> --user <uuid>
```

The CLI reports only safe identifiers and timestamps. Never log or commit
passwords, hashes, tokens, cookies, CPF/CNPJ values, or complete input streams.
