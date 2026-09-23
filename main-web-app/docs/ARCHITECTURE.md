# Dashboard Architecture

```text
route (`src/app`) -> feature -> Server Action/query -> view-model adapter -> generated Kubb client -> Fastify
```

- React Server Components are the default; Client Components own only interactive state.
- Generated clients and credential cookies remain server-only.
- Fastify owns identity, persisted Sessions, tenant scope, and authorization.
- The Next.js BFF normalizes the original host and forwards it only server-to-server.
- `proxy.ts` provides optimistic navigation based on cookie presence and is never authorization.
- Components consume safe application view models rather than generated transport DTOs.
- `src/features/<domain>` owns domain-specific actions, server queries,
  adapters, schemas, and components. `src/components` contains reusable UI,
  layout, and form primitives; it does not own feature persistence rules.
- `src/app` composes route-level data, layout, and navigation. It should not
  become a second feature layer.

The canonical API contract is `../main-api/artifacts/openapi.json`; generated output lives under `src/generated`.

## Verification

`pnpm validate:api` validates Kubb input against the committed API contract.
`pnpm check:api` regenerates in an isolated tool home and fails when committed
generated output differs. Contract changes also require their API schema,
feature adapter, tests, and `API_CLIENTS.md` to change together.
