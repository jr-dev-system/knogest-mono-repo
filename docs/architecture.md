# KnoGest System Architecture

## Scope

This document describes the maintained Web dashboard and API. The mobile
application is product roadmap and is not an integration client in this
version.

## Runtime flow

```text
Browser
  -> Next.js App Router dashboard
     -> Server Components / Server Actions / server-only queries
        -> generated Kubb client + shared Axios transport
           -> Fastify API
              -> controller -> service -> handler
                 -> Prisma + PostgreSQL
```

The browser never receives API credentials as props or state. Next.js keeps
access and refresh credentials in host-only `HttpOnly` cookies and calls
Fastify only from the server boundary. Fastify is the source of truth for
identity, persisted sessions, Corporation scope, Company selection, and
authorization.

## Contract and generated client

Fastify route schemas generate
[`main-api/artifacts/openapi.json`](../main-api/artifacts/openapi.json), the
public contract. Kubb consumes that document to generate types, Zod schemas,
and client functions under `main-web-app/src/generated`.

Dashboard features adapt generated transport DTOs to application view models;
UI components do not consume transport DTOs directly. A public API change is
complete only after its Fastify schema, OpenAPI artifact, generated client,
dashboard adapter, documentation, and tests agree.

## Trust boundaries

- A trusted host resolves the Corporation during authentication.
- Authenticated claims contain `corporationId`, `companyId` when selected,
  `userId`, `sessionId`, and role. Request input never supplies these scopes.
- Company-scoped operations require a persisted selected Company; Fastify
  rejects absent scope before the domain service runs.
- The dashboard proxy only performs optimistic navigation from cookie presence.
  It is not authorization and does not replace Fastify checks.
- Errors use a stable envelope and safe diagnostics; credentials, personal-data
  ciphertext, tokens, cookies, SQL, and raw Prisma details never leave the
  trusted boundary.

## Domain ownership

The API owns domain consistency for projects, workforce, fleet, commercial
records, RDOs, and production. The dashboard anticipates constraints for UX
but remains non-authoritative. Shared functional rules are documented in this
directory; HTTP shapes belong to OpenAPI and API implementation rules belong
to `main-api/docs/`.

## Verification boundaries

The API checks OpenAPI drift. The dashboard validates the OpenAPI input and
checks that regenerated Kubb output is committed. Both applications maintain
unit/integration coverage; browser workflows additionally run through
Playwright against the isolated PostgreSQL test service.
