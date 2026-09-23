# KnoGest Documentation

This index is the entry point for the currently maintained Web dashboard,
Fastify API, and the Expo mobile development-build configuration. `_bmad-output/`
contains historical planning artifacts and is outside this operational
documentation set.

## System map

- [System architecture](./architecture.md) — boundaries and data flow between
  the dashboard, API, database, and generated contract.
- [Product direction](../PRODUCT.md) — delivered scope versus roadmap.
- [Original discovery notes](../app.md) — product context, not runtime truth.

## Shared domain rules

- [Work fronts and earthwork quantities](./project-work-fronts.md)
- [Project team shifts](./project-team-shifts.md)
- [Machines and machine models](./fleet-machines.md)
- [Daily work reports (RDO)](./project-daily-reports.md)
- [Earthwork production](./project-productions.md)

## API

- [API onboarding and operations](../main-api/README.MD)
- [API architecture](../main-api/docs/ARCHITECTURE.md)
- [Corporation and Company scope](../main-api/docs/TENANCY.md)
- [Validation](../main-api/docs/VALIDATION.md)
- [Cursor pagination](../main-api/docs/PAGINATION.md)
- [Errors and observability](../main-api/docs/ERRORS.md)
- [Module pattern](../main-api/docs/MODULE_PATTERN.md)
- [Canonical OpenAPI contract](../main-api/artifacts/openapi.json)

## Dashboard

- [Dashboard onboarding](../main-web-app/README.md)
- [Dashboard architecture](../main-web-app/docs/ARCHITECTURE.md)
- [Generated API clients and Server Actions](../main-web-app/docs/API_CLIENTS.md)
- [Authentication](../main-web-app/docs/AUTH.md)
- [Security](../main-web-app/docs/SECURITY.md)
- [Components](../main-web-app/docs/COMPONENTS.md)
- [Form validation](../main-web-app/docs/FORM_VALIDATION.md)
- [Hooks](../main-web-app/docs/HOOKS.md)
- [Styling](../main-web-app/docs/STYLING.md)

## Mobile

- [Expo development build and styling base](../app/README.md)

## Change checklist

1. Start with the domain document affected by the change.
2. Update Fastify route schemas and regenerate OpenAPI for public contract
   changes.
3. Regenerate and validate Kubb clients before changing dashboard adapters.
4. Update the canonical document and tests in the same change.
5. Follow the closest `AGENTS.md` for implementation and verification commands.
