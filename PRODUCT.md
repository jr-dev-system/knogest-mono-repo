# Product

## Documentation status

This document describes the product direction for the current web and API
delivery. It is not a statement that every planned role, workflow, or client
application is already implemented. The operational source of truth is the
documentation map in `docs/index.md`; the public API source of truth is
`main-api/artifacts/openapi.json`.

## Users

KnoGest is for companies that manage earthmoving construction projects and need a web application for operational control, project visibility, and administrative setup.

The delivered web/API slice authenticates the `MASTER_ADMIN` role. It supports
company/workspace selection and administration of employees, projects,
suppliers, machines, catalog data, RDOs, and earthwork production. Project
manager and operational roles remain product direction, not current runtime
authorization.

The first product focus is the web application. Users may still access parts of it from tablets or phones in field conditions, so the interface needs strong legibility, clear hierarchy, and controls that remain usable under bright outdoor light.

## Product Purpose

KnoGest is a multi-tenant SaaS for managing earthmoving operations. It gives each corporation a controlled environment where users belong to one corporation, can work across one or more companies inside that corporation, and can access the projects they are responsible for.

The current product supports login with company/workspace selection, a company
admin panel, and project operations. Before a project starts, its approved
quantities must be explicit and at least one valid work front must exist.
Activating the project never starts a work front automatically.

Success means users can understand the state of a project quickly, keep core
operational records organized, and make decisions without fighting generic ERP
complexity.

## Brand Personality

Reliable, robust, direct.

The product should feel like a serious operations tool for real construction work: practical, grounded, and confident. It should avoid decorative cleverness and instead earn trust through clarity, density, readable data, and predictable workflows.

## Anti-references

KnoGest must not look like a generic ERP with lifeless tables, vague gray panels, and administrative sprawl.

It must not look like a dark crypto dashboard, trading terminal, or speculative finance interface. Dark surfaces can be used only if they serve a concrete task and preserve outdoor readability; they are not the default brand mood.

It must not rely on fragile, low-contrast UI, tiny labels, decorative gradients, or visuals that fail in bright field conditions.

## Design Principles

1. Put field clarity first. Data, controls, and status indicators must remain legible on desktop, tablet, and phone, including outdoor use under strong light.
2. Make operational hierarchy obvious. The app should always help users understand corporation, company, project, equipment, supplier, and labor context without confusion.
3. Prefer confident density over ERP clutter. Dashboards and admin screens may be information-rich, but every table, filter, card, and chart must have a clear job.
4. Use familiar product patterns. Workspace selection, admin navigation, forms, filters, tables, tabs, and project dashboards should behave predictably.
5. Show project truth quickly. The project dashboard should surface progress, production, equipment, labor, suppliers, and alerts in a way that supports decisions, not decoration.
6. Preserve the planning baseline. Project quantities are approved reference values; service fronts allocate portions of them, never silently replace them, cannot consume more than the available balance, and prevent later revisions from dropping below allocated work.
7. Separate project activation from field execution. Resources join the project pool first, are then assigned exclusively to a work front, and only a separately confirmed action starts that front. Every assignment change preserves an auditable effective-period history.

## Accessibility & Inclusion

Target WCAG AA. Body text and controls must use strong contrast, with extra care for muted text, placeholder text, chart labels, and status colors.

The interface must support responsive layouts for desktop, tablet, and mobile use. Touch targets should be comfortable on mobile and tablet. Motion should be restrained, communicate state, and respect reduced-motion preferences.
