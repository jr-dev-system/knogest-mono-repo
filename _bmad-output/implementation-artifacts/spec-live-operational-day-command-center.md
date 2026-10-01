---
title: 'Live operational day command center'
type: 'feature'
created: '2026-09-30'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '38da3cb51f9e8f66b44729faf29a19fe622499f5'
context:
  - '{project-root}/docs/project-daily-reports.md'
  - '{project-root}/main-web-app/docs/API_CLIENTS.md'
  - '{project-root}/main-api/docs/ERRORS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The operational day opened from the project calendar exposes shift actions but not the live state needed to understand the work: elapsed/extra time, general breaks, all productions, or current employee and machine states.

**Approach:** Turn the existing shift panel into a live, responsive command center backed by audited status transitions, while preserving the current RDO opening, production, aptitude, metering, and closing rules.

## Boundaries & Constraints

**Always:** Use `America/Sao_Paulo`; refresh server state every 30 seconds while ticking the display clock locally; persist current state plus actor/timestamp events; initialize present employees and fit machines as working, absentees as stopped, and checklist-unfit machines as unfit; derive projected regular/overtime from the configured activity window minus live breaks; auto-end an open break at the submitted close time; include live breaks in every present employee's final calculation; preserve the six-break total limit; show all shift productions and all snapshotted resources; update Fastify schemas, OpenAPI, generated Kubb clients, tests, and canonical docs together.

**Never:** Change the calendar grid; add polling every second; make employee `unfit` affect attendance, frequency, hours, or closing; add a live command that marks a machine `unfit`; change the existing checklist-unfit machine or meter rule; create maintenance work orders or implement fueling; allow live changes after finalization; hand-edit generated clients.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Running shift | Open RDO with no active break | Show start time, live worked timer, productions and resource states | Loading failures preserve the panel and offer retry |
| Overtime | Worked time exceeds planned net duration | Show `Nh regulares + Mh extra` distinctly | Never present projection as official time |
| General break | User pauses/resumes the open shift | Freeze worked timer, show break duration, persist both transitions | Reject duplicate/incompatible transitions |
| Close while paused | Final close supplies `endedAt` | End the break at `endedAt`, merge it with manual breaks, and finalize atomically | Reject time before the latest event or more than six merged breaks |
| Resource state | Eligible employee/machine receives an allowed state | Persist current state and append an audited event | Reject foreign/out-of-report resource; machine `unfit` is not accepted live |
| Legacy open RDO | Migrated row has no event history | Use backfilled snapshot and continue auditing new transitions | Do not fabricate historical events |

</frozen-after-approval>

## Code Map

- `main-api/prisma/schema.prisma` -- add nullable shift/employee/machine snapshots and append-only scoped status events; migration backfills existing operational rows only.
- `main-api/src/modules/daily-reports/{daily-reports.dto.ts,daily-reports.controller.ts,daily-reports.service.ts,handlers/daily-reports.handler.ts}` -- validate discriminated commands, expose strict public schemas, enforce transitions/CAS, derive live breaks, and map the expanded operational detail.
- `main-web-app/src/features/projects/{operational-day.types.ts,operational-day.actions.ts,components/project-operational-day.tsx}` -- generated-client boundary, live timer, pause/resume, production loading, resource lists, and status controls.
- `main-api/tests/integration/projects/project-daily-reports.test.ts` and `main-web-app/src/features/projects/components/project-operational-day.test.tsx` -- cross-layer behavior and UI regression coverage.
- `docs/project-daily-reports.md`, `main-web-app/docs/API_CLIENTS.md`, `main-api/docs/ERRORS.md` -- canonical behavior, transport, and error semantics.

## Tasks & Acceptance

**Execution:**
- [ ] Add migration/schema snapshots and audited events with scoped indexes and nullable legacy compatibility.
- [ ] Add `POST /projects/:projectId/operational-shifts/:reportId/status-events`, initialize states on start, return live snapshots from operational-day reads, and merge/close live breaks during finalization.
- [ ] Regenerate OpenAPI/Kubb and add the thin Server Action that mutates then reloads the day.
- [ ] Replace the current progress-heavy shift card with the live summary, production list, machine list, employee list, responsive states, and accessible feedback.
- [ ] Update canonical docs and add DTO, integration, and component tests.

**Acceptance Criteria:**
- Given a running shift, when time advances or a general break starts, then the visible timer updates locally, excludes the break, and distinguishes projected overtime.
- Given any production or snapshotted resource in the selected shift, when the Central loads, then every item is visible with Portuguese labels and its current state.
- Given an allowed state change, when it succeeds, then the current snapshot, actor, timestamp, UI and subsequent refresh agree.
- Given a finalized or foreign-scoped report/resource, when a status command is attempted, then the canonical safe error is returned without mutation.
- Given an open break at finalization, when close succeeds, then its final interval is audited and applied once to all present employee calculations.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Preserve the incumbent Operate visual language: a strong live shift header, explicit icon-and-text status chips, tabular timer numerals, compact full-width production rows, and dense machine/employee rows that stack cleanly on phones. Status is never communicated by color alone. Absent employees remain read-only stopped because changing their live label cannot override attendance.

## Verification

**Commands:**
- `pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm generate:openapi && pnpm check:openapi` in `main-api`.
- `pnpm generate:api && pnpm validate:api && pnpm check:api && pnpm typecheck && pnpm lint && pnpm test` in `main-web-app`.
- Inspect desktop and mobile Central states once, fix findings in one batch, and confirm once.
