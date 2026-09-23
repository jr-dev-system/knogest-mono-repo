# Authentication

Fastify is the only identity and Session authority. Next.js acts as a same-origin BFF and never creates an independent Session.

## Login flow

```text
Client form -> Server Action -> generated Kubb client -> Fastify login -> persisted Session
            <- safe result     <- server-confidential credentials
```

- Corporation scope comes from the normalized incoming host, forwarded
  server-to-server as `X-Forwarded-Host`. Company scope comes only from the
  persisted Fastify Session after workspace selection.
- The public credential input is only `{ email, password }`.
- The Server Action converts the API credential result into host-only `HttpOnly` cookies.
- Client Components, URLs, DOM, Web Storage, and Server Action results never contain access or refresh values.
- `proxy.ts` checks cookie presence only for navigation. Server pages and
  actions inspect the persisted Fastify Session; the API rejects a missing
  Company scope before company-scoped domain work starts.

## Cookies

Production uses `__Host-knogest-access` and `__Host-knogest-refresh` with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain`. Local HTTP uses explicit `AUTH_COOKIE_MODE=local`, relaxing only the names and `Secure` flag.

## Configuration

```env
API_BASE_URL="http://localhost:3333"
APP_HOST="piloto.localhost:3000"
AUTH_COOKIE_MODE="local"
```
