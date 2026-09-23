# Corporation and Company Scope

KnoGest is multi-tenant through Corporation ownership and Company operational
scope. It does not use a generic `Tenant` model or accept a free-form tenancy
identifier from clients.

## Trusted context

After authentication, `request.authContext` contains trusted identifiers for
`userId`, `corporationId`, `sessionId`, `role`, and optionally `companyId`.
The claims are checked against the persisted Session on every authenticated
request.

`companyId` is absent until the user chooses a workspace. Company-scoped
routes use `requireCompanyScope`, which returns `403 COMPANY_CONTEXT_REQUIRED`
before a controller calls its service.

## Layer responsibilities

- **Controller:** reads only authenticated context, creates the explicit
  operation scope, and never derives Corporation or Company from client input.
- **Service:** passes the trusted scope through domain operations and rejects
  impossible scope transitions.
- **Handler:** filters reads, writes, updates, deletes, and relation traversals
  by the required `corporationId` and, when operational data is involved,
  `companyId`.

## Client input

Bodies, query strings, route params, and arbitrary headers must never select a
Corporation or Company. `x-expected-company-id` is a guarded concurrency check
for the project command, not a replacement for authenticated scope: it must
equal the Company persisted in the current Session.

## Exceptions

An exception is allowed only when it is explicit in code and documentation:

- trusted-host Corporation resolution during login;
- system/reference data explicitly modeled as global;
- administrative provisioning that receives its Corporation context through a
  controlled CLI command.

New exceptions require a test demonstrating that another Corporation or
Company cannot access or mutate scoped data.
