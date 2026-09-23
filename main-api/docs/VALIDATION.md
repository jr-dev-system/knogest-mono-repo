# Validation

Zod validates public request format; services enforce domain rules and handlers
enforce persistence constraints. Route OpenAPI schemas must describe the same
accepted input and response behavior.

## Placement

- **DTO:** strict schemas and inferred types for body, params, and query.
- **Controller:** `validateBody`, `validateParams`, or `validateQuery` where
  the route uses standard parsing; controlled command parsing uses `safeParse`
  and the same response envelope.
- **Service:** business rules and state transitions.
- **Handler and Prisma schema:** scoped persistence, constraints, and
  transactional invariants.

Normalize input in the DTO where possible: trim textual identifiers, constrain
decimal formats, coerce bounded numeric query fields, and reject unknown keys
with strict object schemas.

## Canonical validation error

Invalid body, params, and query input return HTTP `400` through
`jsonResponse.error`:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation error",
  "details": {
    "fieldName": ["reason"]
  },
  "requestId": "00000000-0000-4000-8000-000000000000"
}
```

Controllers may use a more specific safe message for a command, but the error
code, `details`, and `requestId` envelope remain stable. Never expose raw Zod,
Prisma, SQL, credential, token, cookie, or ciphertext details.

## Pagination input

Potentially unbounded lists follow `PAGINATION.md`. Their DTOs strictly allow
only documented filters, `limit`, `cursor`, and supported ordering values;
handlers independently validate decoded cursor scope and query binding.
