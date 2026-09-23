# Recovered Sidecar documentation — 23cc706

Recovered on 2026-09-23 from commit
`23cc706d7ad701ea84eb0ae7a6f03c26d82d6fa8` on
`claude/tabby-sidecar-mobile-46c612`.

These 22 files existed on the Sidecar branch but were absent at their original
paths in the reconciliation branch. Their original repository-relative paths
are preserved below this directory. This archive protects their content without
overwriting the canonical feature catalog, plan registry, shared operations
runbook, or progress log.

This is historical source material, not approval to implement the plans or a
current deployment runbook. Original dates, identifiers, status claims, and links
are retained. Relative links inside recovered files may assume their original
repository locations; use the original-path column when locating those targets.
Any past deployment assertions still require fresh verification.

## Crosswalk and collision handling

Use `sidecar-23cc706:<original path>` as an unambiguous identifier for these
documents. Existing plan and feature numbers have not been reassigned.
Canonical promotion should preserve both topics, obtain a unique registry entry,
and update references together. This archive itself does not reserve any number.

| Original repository path | Preserved copy | Reconciliation note |
|---|---|---|
| `docs/CWS-LISTING-KIT.md` | [Recovered document](docs/CWS-LISTING-KIT.md) | Historical store-listing kit; original draft-state and automation claims are not current deployment authority. |
| `docs/features/216-peer-view.md` | [Recovered document](docs/features/216-peer-view.md) | Conflicts with canonical feature 216, Session Manager / Tablerone Parity. |
| `docs/features/217-dispatch-ptt-mode.md` | [Recovered document](docs/features/217-dispatch-ptt-mode.md) | Conflicts with canonical feature 217, Intent Tab Grouping Suite. |
| `docs/features/218-preset-checkpoints.md` | [Recovered document](docs/features/218-preset-checkpoints.md) | Conflicts with canonical feature 218, Agent Browsing Detection. |
| `docs/features/219-tabatha-calls-intake.md` | [Recovered document](docs/features/219-tabatha-calls-intake.md) | Conflicts with canonical feature 219, Agent vs Human History. |
| `docs/features/220-task-sync-provider-abstraction.md` | [Recovered document](docs/features/220-task-sync-provider-abstraction.md) | Conflicts with canonical feature 220, Session Aggregation / Auto Updates. |
| `docs/features/221-shared-focus-org-context.md` | [Recovered document](docs/features/221-shared-focus-org-context.md) | Conflicts with canonical feature 221, Clock Backdate and Recovery. |
| `docs/features/222-extension-device-management.md` | [Recovered document](docs/features/222-extension-device-management.md) | Conflicts with canonical feature 222, Notes System. |
| `docs/features/223-first-login-sync-org-onboarding.md` | [Recovered document](docs/features/223-first-login-sync-org-onboarding.md) | No same-number canonical feature file found; retained here pending registry reconciliation. |
| `docs/features/224-thought-lanes.md` | [Recovered document](docs/features/224-thought-lanes.md) | No same-number canonical feature file found; retained here pending registry reconciliation. |
| `docs/superpowers/specs/2026-07-20-fix-wave-3-spec.md` | [Recovered document](docs/superpowers/specs/2026-07-20-fix-wave-3-spec.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md` | [Recovered document](docs/superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md) | Sidecar Plan 042, Conversational Tabatha; conflicts with Cortex Phase 3 Plan 042. |
| `docs/superpowers/specs/2026-07-20-plan-043-peer-view-design.md` | [Recovered document](docs/superpowers/specs/2026-07-20-plan-043-peer-view-design.md) | Sidecar Plan 043, Peer View; conflicts with Cortex Phase 4 Plan 043. |
| `docs/superpowers/specs/2026-07-20-plan-044-scheduling-calendar-preset-checkpoints-design.md` | [Recovered document](docs/superpowers/specs/2026-07-20-plan-044-scheduling-calendar-preset-checkpoints-design.md) | Sidecar Plan 044, Scheduling / Calendar / Checkpoints; conflicts with Cortex Phase 5 Plan 044. |
| `docs/superpowers/specs/2026-07-20-plan-045-growth-integrations-governance-design.md` | [Recovered document](docs/superpowers/specs/2026-07-20-plan-045-growth-integrations-governance-design.md) | Sidecar Plan 045, Growth / Integrations / Governance; conflicts with Agent Control Layer Plan 045. |
| `docs/superpowers/specs/2026-07-21-plan-046-uiux-overhaul-spec.md` | [Recovered document](docs/superpowers/specs/2026-07-21-plan-046-uiux-overhaul-spec.md) | UI/UX Overhaul Plan 046; matches an existing registry topic but remains archived until links/provenance are reconciled. |
| `docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md` | [Recovered document](docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/superpowers/specs/2026-07-22-overnight-taskrun-protocol.md` | [Recovered document](docs/superpowers/specs/2026-07-22-overnight-taskrun-protocol.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/superpowers/specs/2026-07-22-workspace-smtp-findings.md` | [Recovered document](docs/superpowers/specs/2026-07-22-workspace-smtp-findings.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/superpowers/specs/2026-07-24-lanes-concept.md` | [Recovered document](docs/superpowers/specs/2026-07-24-lanes-concept.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/taskrun/2026-07-23-questions.md` | [Recovered document](docs/taskrun/2026-07-23-questions.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |
| `docs/taskrun/2026-07-23-taskrun2-report.md` | [Recovered document](docs/taskrun/2026-07-23-taskrun2-report.md) | Historical supporting document; preserve provenance and validate current claims before reuse. |

## Related reconciliation

The restored Sidecar application source is 0.13.14 from the same commit. It is
separate from these historical specs. The live production bundle was hash-matched
to the original Sidecar worktree on 2026-09-23; see
[the system map correction](../../system-map/SYSTEM-MAP.md).

The uncommitted automated survey was preserved separately in that system map
because its daily observations extend beyond the source commit. Shared files
such as `docs/features.md`, `docs/progress.md`, and `docs/OPERATIONS.md`
were not overwritten by this recovery.
