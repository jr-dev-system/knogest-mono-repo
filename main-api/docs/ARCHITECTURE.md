# API Architecture

KnoGest uses a strict layered flow:

```text
controller -> validation -> service -> handler -> Prisma -> response
```

`buildApp` owns Fastify setup, OpenAPI, safe error formatting, request IDs,
rate limits, Prisma, and authentication plugins. Versioned routes are mounted
under `/api/v1`; route schemas generate the committed OpenAPI artifact.

## Controller

Controllers register Fastify routes, OpenAPI schemas, request-size and
rate-limit settings, pre-handlers, and HTTP responses. They may read validated
request input and `request.authContext`, construct an operation scope, and call
a service.

Controllers do not access Prisma or contain persistence queries. For format
validation they use DTO schemas and validation pre-handlers; exceptional command
parsing must still return the canonical error envelope.

## Service

Services coordinate use cases and enforce domain rules that span multiple
records or operations. They receive a `HandlerContext` and trusted
Corporation/Company scope, call handlers, and raise normalized `AppError`
instances. They do not build Fastify responses or query Prisma models directly.

## Handler

Handlers are the module persistence boundary. They use `HandlerContext.prisma`,
apply Corporation/Company filters in every tenant-aware query and mutation, and
translate known persistence failures into safe application errors. Transactional
handlers use the context transaction helper rather than leaking database work
to controllers or services.

## DTO and response boundaries

DTOs contain Zod schemas and inferred input types only. The controller owns the
HTTP envelope through `jsonResponse`; handlers return data or throw normalized
errors. Generated OpenAPI schemas must describe the same envelope and route
behavior as the controller.

## Cross-cutting rules

- `auth.plugin` validates the JWT against the persisted session and attaches
  `authContext` to the request.
- `requireCompanyScope` blocks company-scoped operations without a selected
  Company before domain code executes.
- `jsonResponse` is the sole canonical response-envelope formatter.
- `docs/ERRORS.md`, `docs/TENANCY.md`, `docs/PAGINATION.md`, and the route
  schema are required reading when their respective concerns change.
