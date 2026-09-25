# Investigation: Project machine modal triggers address validation

## Hand-off Brief

1. **What happened.** A user reports that submitting “Adicionar máquina e operador” on a Project page displays required Project-address errors, although the operation should only reconcile machine allocations.
2. **Where the case stands.** Active; the exact browser-visible error is a confirmed stronghold, while the submit and validation paths still need tracing.
3. **What's needed next.** Trace the modal submit handler through the shared Project form and the machine-mobilization action to identify which validation schema is invoked.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-09-24 |
| Status | Active |
| System | Local repository; web application and API source available |
| Evidence sources | User-reported rendered error, web and API source, automated tests, version control |

## Problem Statement

“no modal de adcionar máquina a obra dentro da página da obra ao enviar a requisição está retornando isso **Há erros nesta etapa do formulário.** … address / postal code … mas isso não tem nada a ver. o que aconteceu?”

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| User-visible validation error | Available | Stronghold: it names fields under `address`. |
| Web submit and validation code | Available | To trace. |
| API mobilization endpoint | Available | To compare expected command contract. |
| Browser network payload/logs | Missing | Would distinguish local form validation from an HTTP response. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | Trace machine-modal submit caller | High | In Progress | Determine whether the Project form schema is submitted. |
| 2 | Compare client action payload and API DTO | High | Open | Determine whether the address reaches the endpoint. |
| 3 | Inspect regression coverage and recent changes | Medium | Open | Identify a missing test or recent source of regression. |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| User report | Machine modal submission shows address validation errors | User-provided error text | Confirmed |

## Confirmed Findings

### Finding 1: The displayed errors are Project-address field errors

**Evidence:** User-provided error text; `main-web-app/src/features/projects/projects-schema.ts` contains the exact CEP validation message.

**Detail:** The reported labels are all descendants of the Project `address` object, not machine-allocation fields.

## Deduced Conclusions

## Hypothesized Paths

### Hypothesis 1: The modal invokes the shared Project form validation

**Status:** Open

**Theory:** The machine modal is wired to a submit path that validates the full Project command, including the required address, before issuing its dedicated machine-mobilization request.

**Supporting indicators:** The exact CEP message exists in the web Project schema.

**Would confirm:** The modal's save handler calls a form-level submit/validation function with the full Project schema.

**Would refute:** The modal calls only `saveProjectMachineMobilizationAction` and the API returns an equivalent address validation envelope.

**Resolution:** Pending source trace.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Browser request/response | Confirms whether any HTTP request is sent | Inspect Network when reproducing. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | Pending trace |
| Trigger | Submitting machine-mobilization modal |
| Condition | Pending trace |
| Related files | `projects-schema.ts`, `project-detail.tsx`, `projects.actions.ts` |

## Conclusion

**Confidence:** Low

Investigation in progress.

## Recommended Next Steps

### Fix direction

Pending diagnosis.

### Diagnostic

Trace the client submit handler and API contract.

## Reproduction Plan

Open a Project with an incomplete address, add a machine in the modal, and observe whether Network shows the mobilization request.

## Side Findings

- None yet.
