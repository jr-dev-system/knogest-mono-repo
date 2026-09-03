# Investigation: Machine review step is skipped during creation

## Hand-off Brief

1. **What happened.** The reported behavior is that advancing from the physical-units step creates the machine instead of showing the registration-review step.
2. **Where the case stands.** Active; source tracing shows the shared modal advances from the units step to review and requires an explicitly marked button to submit. The focused machine test passes, so the reported behavior is not reproduced in component-test execution.
3. **What's needed next.** Reproduce the browser flow or inspect the rendered DOM to determine which runtime condition bypasses the expected transition.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-09-03 |
| Status | Active |
| System | Local source inspection; frontend machine-registration flow |
| Evidence sources | User report, frontend source, existing component test, git working tree |

## Problem Statement

"Ao criar uma máquina, no step de revisão ele está concluindo a criação e não me mostrando a revisão."

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| User report | Available | Symptom reported without browser trace or reproduction data. |
| Machine creation wizard | Available | Defines a third step named `Revisão`. |
| Shared modal transition logic | Available | Advances non-final steps and only submits through a marked final button. |
| Component test | Available | Machine test passes in this worktree and expects review before submit. |
| Version control | Partial | The machine wizard is an untracked worktree file, so there is no commit history for it. |
| Runtime/browser reproduction | Missing | Needed to establish whether the report follows the tested component path. |
| Test harness infrastructure | Partial | One unrelated transport suite cannot bind a local port in the sandbox. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | Trace `BaseFormModal` advance versus submit behavior | High | Done | Source rejects direct submit before the final step. |
| 2 | Compare the machine wizard with other multi-step modal users | Medium | In Progress | Existing employee wizard exercises the same review pattern. |
| 3 | Reproduce the browser flow with the reported inputs | High | Open | Confirms the runtime path and whether validation/state affects it. |
| 4 | Inspect recent changes to the wizard and modal | Medium | Open | Establishes when the behavior was introduced. |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| 2026-09-03 | User reports creation happens before the review step is displayed. | User report | Confirmed |
| 2026-09-03 | Source scan finds a three-step wizard whose final step is `Revisão`. | `main-web-app/src/features/machines/components/machine-model-creation-wizard.tsx:617` | Confirmed |
| 2026-09-03 | Test expects the review label after advancing through the units step, before the creation action. | `main-web-app/src/features/machines/components/machines-page.test.tsx:98` | Confirmed |
| 2026-09-03 | Source trace confirms the modal advances non-final steps by incrementing the index and only delegates to `onSubmit` for an explicit final action. | `main-web-app/src/components/modals/BaseFormModal.tsx:213` | Confirmed |
| 2026-09-03 | The machine component test passes (29 test files/138 tests passed); an unrelated transport test cannot bind a sandbox-local port. | `pnpm test -- src/features/machines/components/machines-page.test.tsx` | Confirmed |

## Confirmed Findings

### Finding 1: The machine wizard declares an explicit review step

**Evidence:** `main-web-app/src/features/machines/components/machine-model-creation-wizard.tsx:644`

**Detail:** The configured third wizard step is titled `Revisão` and renders the `ReviewStep` component.

### Finding 2: Existing automated coverage expects review before submission

**Evidence:** `main-web-app/src/features/machines/components/machines-page.test.tsx:98`

**Detail:** The test advances twice, asserts `Revisão do cadastro`, then clicks `Cadastrar catálogo` and only then expects the action call.

### Finding 3: The shared modal cannot submit while the units step is active

**Evidence:** `main-web-app/src/components/modals/BaseFormModal.tsx:238`

**Detail:** On a form submit before the final step, the handler prevents the event and calls `handleNextStep`. That function validates the active step then sets `currentStep` to the next index (`BaseFormModal.tsx:213`). The footer renders `Avançar` as a `type="button"` on non-final steps (`BaseFormModal.tsx:354`); the creation action is rendered only on the last step, as a submit button carrying `data-wizard-submit="true"` (`BaseFormModal.tsx:365`).

### Finding 4: The expected machine path passes component-test execution

**Evidence:** `main-web-app/src/features/machines/components/machines-page.test.tsx:98`; test command on 2026-09-03

**Detail:** The test uses the same modal, advances from physical units, observes the review section, and verifies that the action is not called until `Cadastrar catálogo` is clicked. The test run reports this suite passing; the command exits non-zero solely because an unrelated API transport suite is blocked from listening on `127.0.0.1` by the sandbox.

## Deduced Conclusions

### Deduction 1: The intended component contract does not submit directly from the units step

**Based on:** Findings 1 and 2

**Reasoning:** The configuration supplies three steps, and the test distinguishes navigation to review from clicking the submit control.

**Conclusion:** The current component code has no direct control-flow path from the units-step `Avançar` button to the creation action. If the report reproduces, it requires a condition not represented by this component test or a different deployed build/entry point.

## Hypothesized Paths

### Hypothesis 1: Shared wizard transition treats the units step as final

**Status:** Refuted

**Theory:** `BaseFormModal` may determine its final index or submission branch from stale/incomplete step configuration.

**Supporting indicators:** This was the initial most likely boundary to inspect.

**Would confirm:** A source trace showing that the units step enters the submit branch despite `steps.length === 3`.

**Would refute:** Evidence that the modal transitions to index 2 and another event independently submits the form.

**Resolution:** The source computes the last step from `steps.length` (`BaseFormModal.tsx:104`) and advances non-final steps by incrementing the index (`BaseFormModal.tsx:220`). The machine supplies three steps (`machine-model-creation-wizard.tsx:617`), so physical units at index 1 are not final.

### Hypothesis 2: The report is reaching a runtime path that differs from the tested machine wizard

**Status:** Open

**Theory:** The user may be using a stale deployment, a different creation entry point, or an interaction/state path absent from the component test.

**Supporting indicators:** Findings 1–4 establish the desired flow is configured and passes locally, while the reported runtime behavior contradicts it.

**Would confirm:** Browser reproduction tied to the running build, or deployment/version evidence that does not contain the current untracked wizard.

**Would refute:** A reproduction against this exact worktree that calls the action on the units-step advance.

**Resolution:** Pending runtime evidence.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Browser reproduction details | Cannot establish exact UI path or timing | Reproduce using the same machine data and capture the visible button/step state. |
| Running build/version | Cannot distinguish a stale deployment from a source defect | Record the served commit/build and compare it with this worktree. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | No source origin found in the current machine wizard or shared modal. |
| Trigger | User clicks `Avançar` after entering physical units. |
| Condition | Unconfirmed at runtime; the source would instead advance to `currentStep === 2`. |
| Related files | `machine-model-creation-wizard.tsx`, `machines-page.test.tsx`, shared `BaseFormModal`. |

## Conclusion

**Confidence:** Medium

The current frontend source does not contain a direct path that can create a machine when the units-step `Avançar` control is used. The three-step configuration, explicit `type="button"`, event guard, focused passing component test, and explicit final submit control agree on that behavior. The remaining uncertainty is runtime-specific: a stale/different build or an untested interaction path.

## Recommended Next Steps

### Fix direction

Out of scope for this investigation. A correction should be chosen only after the runtime path is identified.

### Diagnostic

Reproduce against the exact served build while recording the visible step heading and network request. Compare that build with the local source, then add a regression test only for the confirmed divergent path.

## Reproduction Plan

1. Open **Nova máquina**.
2. Complete the model/operator step and advance.
3. Add a physical unit and advance.
4. Observe whether the review section appears before any creation action is sent.

## Side Findings

- The worktree already contains machine-flow changes; no source files were modified by this investigation.
