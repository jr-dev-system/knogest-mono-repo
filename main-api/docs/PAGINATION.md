# Cursor Pagination

Every endpoint that powers a table or can return an unbounded collection uses
the shared opaque cursor contract. The only exception is an immutable system
catalog with an explicitly documented hard maximum of 100 records.

## Request and response

```http
GET /api/v1/employees?limit=25&cursor=<opaque-cursor>&search=ana&sortBy=name&sortDirection=asc
```

- `limit` is an optional integer from 1 to 100, defaulting per module.
- `cursor` is an unpadded Base64URL value with a maximum of 2048 characters.
- `search`, filters, `sortBy`, and `sortDirection` are strict module DTO input.
- Changing any filter or ordering restarts pagination; changing only `limit`
  does not invalidate a cursor.

The standard success envelope contains `data` and `pageInfo`:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "data": [],
    "pageInfo": { "hasNextPage": false, "nextCursor": null }
  }
}
```

`nextCursor` is opaque to clients. Clients keep previously loaded pages for
backward navigation; the API does not return a `prevCursor` or total count by
default.

## Cursor integrity

The shared cursor stores version, resource, scope hash, query hash, ordering,
and the last boundary. Hashes use canonical JSON and SHA-256. The server
recomputes scope and query hashes from trusted context and validated input, then
rejects malformed, mismatched, stale-resource, or unsupported-ordering cursors
with `400 VALIDATION_ERROR`.

The scope includes every authenticated Corporation/Company value and validated
parent route parameter used by the handler. Cursor data never supplies scope.

## Deterministic traversal

Handlers fetch `limit + 1` records, return at most `limit`, and use the extra
record for `hasNextPage`. Ordering ends with unique `id` as a tie-breaker. A
mutable sort can move records between pages under concurrent writes, so list
tests cover duplicate sort values and relevant insert/delete/update behavior.

## Implementation checklist

1. Define a strict query DTO and an explicit ordering allowlist.
2. Build the trusted scope from `authContext` and parent params.
3. Call `parseBoundCursor` before querying and `buildCursorPage` after fetching.
4. Document the route in OpenAPI and add `400` error coverage.
5. Add handler and integration tests for scope/query mismatch and page
   boundaries.
