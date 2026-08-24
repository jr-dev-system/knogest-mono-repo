# Investigation: Seed not applied

## Hand-off Brief

1. **What happened.** `pnpm db:seed` starts correctly but stops on Prisma error P2002 while seeding global measurement units, so the development fixtures are never reached.
2. **Where the case stands.** Root-cause mechanism is confirmed: the seed matches units by deterministic `id`, while a migration previously created some of the same unique `code` values using random IDs.
3. **What's needed next.** Change the reference-data reconciliation to identify global units by `code` (with a safe treatment for referenced legacy IDs), then add a migration-state regression test.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-08-24 |
| Status | Concluded |
| System | Local macOS workspace; `main-api` uses Prisma 7.8.0 and PostgreSQL 16 in Docker Compose |
| Evidence sources | User report, seed entry point, package scripts, Prisma configuration, local environment configuration |

## Problem Statement

"Veja pq o meu seed não está sendo aplicado". This is the initial claim and remains unverified.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| User report and captured console output | Available | `pnpm db:seed` exits 1 with P2002 on `measurementUnit.upsert`. |
| `main-api/package.json` | Available | Defines explicit `db:seed` and `db:fixtures` scripts. |
| `main-api/prisma/seed.ts` | Available | Implements the development and reference seed flow. |
| Seed execution output | Available | Exact failing statement and database constraint are captured. |
| Migrations | Available | Earlier migration establishes deterministic IDs; later migration creates conflicting unit codes with generated IDs. |
| Live database state | Partial | Docker socket access is unavailable in this environment; the observed P2002 independently proves a conflicting row in the user's target database. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | - | - | - | - |
| 1 | Inspect Prisma configuration and its CLI seed registration | High | Done | `prisma.config.ts` registers the same `tsx prisma/seed.ts` command. |
| 2 | Locate the exact conflicting seed/migration identities | High | Done | Deterministic-ID `upsert` conflicts with code-only migration inserts. |
| 3 | Determine safe legacy-ID treatment for dependent records | High | Open | Updating primary IDs may violate foreign keys; code-based reconciliation should preserve existing IDs. |
| 4 | Add regression coverage for a database after all migrations | High | Open | Existing tests reset table contents and miss the generated-ID migration state. |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| 2026-08-24 | Investigation opened from user report. | User input | Confirmed |
| 2026-08-24 | Explicit application seed script identified. | `main-api/package.json:20` | Confirmed |
| 2026-08-24 | Seed command starts and fails with P2002 for global measurement-unit `code`. | Captured console output | Confirmed |

## Confirmed Findings

### Finding 1: The application exposes a seed command outside the Prisma CLI

**Evidence:** `main-api/package.json:20`

**Detail:** The documented project command is `pnpm db:seed`, which directly runs `tsx prisma/seed.ts`.

### Finding 2: The configured command is the correct entry point and reaches the seed code

**Evidence:** Captured console output; `main-api/prisma.config.ts:9-12`

**Detail:** The command starts `tsx prisma/seed.ts`. Prisma configuration also registers that same command, so neither the Node engine warning nor command selection prevents execution.

### Finding 3: Reference-data upserts select only deterministic IDs

**Evidence:** `main-api/prisma/seeds/reference-data.ts:5-42`

**Detail:** Every global measurement unit is matched by `where: { id: unit[0] }` and created with the same `id` and a unique `code`.

### Finding 4: A committed migration creates several of the same global codes with generated IDs

**Evidence:** `main-api/prisma/migrations/20260810120000_earthwork_production_wizard/migration.sql:43-59`

**Detail:** The migration inserts `M3_BANK`, `M3_LOOSE`, `M3_COMPACTED`, `M3_PLACED`, `M`, `KM`, and `T_KM` with `gen_random_uuid()` when their global code is absent.

### Finding 5: The database enforces global code uniqueness

**Evidence:** `main-api/prisma/migrations/20260714170000_flexible_supplier_offers/migration.sql:36`; captured console output (`measurement_units_global_code_key`)

**Detail:** Global measurement-unit `code` values must be unique. The seed fails because its ID lookup misses an existing generated-ID row, then its create attempt duplicates the code.

## Deduced Conclusions

### Deduction 1: Invocation method is a probable diagnostic boundary

**Based on:** Findings 1 and 2.

**Reasoning:** A direct package script is distinct from Prisma's `prisma db seed` command. If the latter is invoked without an equivalent seed registration, Prisma may not execute `prisma/seed.ts`.

**Conclusion:** The reported command is correct and is not the cause.

### Deduction 2: The failure was introduced by incompatible identity strategies

**Based on:** Findings 3, 4, and 5.

**Reasoning:** For a code such as `M3_BANK`, the migration creates a row with a generated ID. The seed then looks for a fixed ID, finds none, and tries to insert the same globally unique code. PostgreSQL rejects that create with P2002.

**Conclusion:** The seed cannot be applied to a database that has the later migration's generated-ID reference rows.

## Hypothesized Paths

### Hypothesis 1: The seed was invoked through a command not wired to the project's seed entry point

**Status:** Refuted

**Theory:** The user may be using `prisma db seed`, while the repository exposes `pnpm db:seed` as its seed command.

**Supporting indicators:** `main-api/package.json:20` directly invokes `prisma/seed.ts`; no Prisma CLI registration has yet been verified.

**Would confirm:** Prisma configuration lacks a configured seed command and the user's invocation is `prisma db seed`.

**Would refute:** Prisma configuration registers this entry point, or the user ran `pnpm db:seed` successfully.

**Resolution:** `main-api/prisma.config.ts:9-12` registers `tsx prisma/seed.ts`, and captured output shows `pnpm db:seed` directly launches it.

### Hypothesis 2: The Node engine warning causes the seed failure

**Status:** Refuted

**Theory:** Node 22.23.1 is rejected because the project pins Node 22.22.3.

**Supporting indicators:** The console emits an `Unsupported engine` warning.

**Would confirm:** Execution terminates before the seed script starts because of engine enforcement.

**Would refute:** The seed script starts and the terminal error names an unrelated database constraint.

**Resolution:** The output shows `tsx prisma/seed.ts` executing and a later Prisma P2002 error. Node 22.23.1 is a warning only for this run.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Exact invocation and console output | Identifies whether the command executes, skips, or fails. | Capture the command and its complete output. |
| Live conflicting rows and their references | Determines whether a repair needs to preserve generated IDs. | Query global measurement units by the seven conflicting codes and inspect foreign-key references. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | `main-api/prisma/seeds/reference-data.ts:38-42`, `measurementUnit.upsert` |
| Trigger | `pnpm db:seed` → `main-api/prisma/seed.ts:8` → `seedReferenceData` |
| Condition | Existing global code has a generated ID from `20260810120000_earthwork_production_wizard` migration. |
| Related files | `main-api/prisma/seed.ts`, `main-api/prisma/seeds/reference-data.ts`, two measurement-unit migrations, integration seed tests |

## Conclusion

**Confidence:** High

The seed is applied until it reaches reference data, then deterministically fails. The `Unsupported engine` message is not the cause. A schema migration inserts several global measurement units keyed by generated IDs, but the seed reconciles all units by fixed IDs; on the first overlapping code, the create branch violates `measurement_units_global_code_key` and stops the whole seed.

## Recommended Next Steps

### Fix direction

Reconcile global measurement units by their unique global `code`, preserving the existing ID for migration-created rows. Do not change an existing primary key without first checking its references. Add an integration test that runs the seed against a database produced by the complete migration chain.

### Diagnostic

Before implementing, inspect existing generated-ID units and dependent records. Then run the seed twice after migrations to prove idempotency.

## Reproduction Plan

1. Apply the committed migrations to an empty PostgreSQL database.
2. Run `pnpm db:seed`.
3. Assert all global codes exist once, then run the command a second time.
4. Verify that development fixtures are created.

## Side Findings

- No user modifications were present when the investigation began.

## Follow-up: 2026-08-24

### New Evidence

- Captured `pnpm db:seed` output shows the script executes, then exits 1 with Prisma P2002 for `measurement_units_global_code_key` at `main-api/prisma/seeds/reference-data.ts:38`.
- `main-api/prisma.config.ts:9-12` registers the same seed command.
- `main-api/prisma/migrations/20260810120000_earthwork_production_wizard/migration.sql:43-59` inserts seven overlapping codes with generated UUIDs.

### Additional Findings

- Existing integration tests reset `measurement_units` and recreate only the first six deterministic IDs (`main-api/tests/integration/reset-integration-data.ts:26-65`), so they do not simulate the post-migration generated-ID rows.
- The existing idempotency assertion exercises `seedReferenceData` twice only after that test reset (`main-api/tests/integration/commercial/commercial-registries.test.ts:250-251`).

### Updated Hypotheses

- Hypothesis 1 (wrong invocation): Refuted.
- Hypothesis 2 (Node warning): Refuted.

### Backlog Changes

- Closed command/configuration and code/migration identity tracing.
- Retained only safe handling of existing IDs and regression coverage as implementation work.

### Updated Conclusion

The database migration and seed use incompatible identities for the same globally unique values. This is a confirmed deterministic root cause with high confidence.

## Follow-up: 2026-08-24 #2

### New Evidence

- The fix locates an existing global measurement unit by `code` and preserves its current ID before updating its canonical name (`main-api/prisma/seeds/reference-data.ts:38-59`).
- The regression test recreates the seven migration-created codes using distinct IDs and runs the reference seed twice (`main-api/tests/integration/seeds/development-fixtures.test.ts:162-215`).

### Additional Findings

- The isolated PostgreSQL test database applied all 32 committed migrations and the complete integration suite passed: 13 files and 83 tests.
- `main-api/README.md` was reviewed: it already promises deterministic local fixtures, which remains accurate; no documentation update was required.

### Backlog Changes

- Safe handling of existing generated IDs: Done.
- Regression coverage for migration-created global codes: Done.

### Updated Conclusion

The fix is verified against the complete migration chain. The existing IDs for migration-created units remain intact, while the reference seed becomes repeatable and proceeds to the development fixtures.

### Verification Record

- `pnpm typecheck`: passed.
- `pnpm lint`: passed with one pre-existing warning in `scripts/validate-personal-data-gate.ts`.
- `pnpm test:integration`: passed after applying all 32 migrations (13 files, 83 tests).
- `DATABASE_URL=postgres://test:testpass@localhost:5433/knogest_test pnpm db:seed`: passed and returned `success: true`; this database is the isolated test database, not the local `app` database.
