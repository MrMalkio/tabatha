# TaskRun 2026-07-24/25 — Night Targets & Charter

**Orchestrator:** Kael (Fable 5). **Executors:** Opus 5 / Sonnet 5 / Haiku — best model per job.
**Adversarial review:** Koda (Codex) — mandatory on anything security-sensitive, DB-touching, or CRX-shipping.
**Mandate:** unsupervised. Malkio: "Get targets and plans together and let's have an excellent and productive night."
**Asana umbrella:** `1216867368858873` (Flux Development `1214031898449333`). Track via **Asana MCP** — the `asana-cli` hangs machine-wide this environment.
**Decision framework / auth-freshness / surface-propagation:** inherit `docs/taskrun/2026-07-22-overnight-taskrun-protocol.md` in full.

## Standing rules (apply to Codex agents too)
Named Anasa personas; version-bump every commit + version:sync (ext) / dual-file (sidecar); NO Co-Authored-By; never push protected branches without the reconcile flow; ship via the established pipelines only (Sidecar clean-worktree→wrangler; ext dist-mirror + enterprise CRX per OPERATIONS §2.2b with crx-id verify + staff channel; site `--branch=main`; DB via Mgmt API w/ token from `.env.cortex.local` + verify); proof before "done".

## THE NEW CAPABILITY — real end-to-end testing
Agents MUST use **claude-in-chrome** (real Chrome, logged-in sessions) and **computer-use** to actually EXERCISE the live surfaces, not just unit-test + curl. Gotchas: browsers are tier-"read" under computer-use (screenshot only) → drive with claude-in-chrome; the Tabatha focus-gatekeeper blanks DOM reads → screenshot to see it, and never dismiss Malkio's real focus modals. Prove each flow with a screenshot/artifact. Find gaps → plug them → re-test to prove the fix.

## T0 — Reconcile local ↔ origin (FIRST, blocks clean builds)
Local main-checkout `staging` reads **6.7.48** (stale, never ff'd to protect Vessa's tree); `origin/staging` is **6.7.73** (6156d31). `git status` the main checkout; commit/stash any real uncommitted work (Vessa docs) crediting it; fast-forward local to origin; confirm build green at 6.7.73. Sidecar canonical line = `claude/tabby-sidecar-mobile-46c612` (0.13.9).

## T1 — Carryover fixes (now LIVE-TESTABLE)
- **P1 pairing "expires immediately"**: diff the DEPLOYED `pair-watch` edge fn vs repo (Mgmt API), confirm migration 040 applied, redeploy to match source, then **prove the fix by actually pairing a Sidecar to the browser via claude-in-chrome** (mint code in ext → enter in Sidecar → success). This is the one Malkio hit repeatedly.
- **Org-hours v1 UI** (mig 060 live-dormant): Koda security review of the "any org member" auth widening FIRST; if it passes, ship the TeamActivityPanel hours + Work-Shifts team-stints UI, then live-test as owner.
- **Companion updater manifest**: re-sign so in-app updater sees 0.3.10 (`site/desktop/latest.json` frozen at 0.2.1; needs minisign `.sig`). Test the in-app "Update" flow end to end.
- **Regina device dedup**: run the reviewed reversible script (18 dupes) via Mgmt API/token; verify her Team Activity chips render clean.

## T2 — Full platform review (systematic, surface-by-surface)
Extension (gatekeeper/InPop/InBar/sidebar/home/settings/work-shifts/tasks/logs), Sidecar (focus/queue/clock/checkpoints/backburner/devices/invites/CV), Context View, companion, watch, site (/, /download, /docs, /show), backend (RLS, edge fns, migrations). For each: does it work (live-tested), is it complete, sensible, on-brand, consent-first. New defects → fix + prove; deeper ones → Plan 046 / feature docs. Cross-surface **sync** is a priority focus — reproduce and characterize any drift with real multi-surface sessions.

## T3 — Q7 production promotion (conditional autonomy)
Malkio's standing gate was a manual pre-prod smoke test — agents can now DO that browser smoke test. If the full E2E smoke passes clean AND Koda signs off, promote `staging`→`main` (tag next version) and note it. ANY doubt/failure → hold for Malkio with the evidence. Do not promote on a partial pass.

## PS (Pondecean-Silver) — offline at launch
`192.168.12.161` unreachable at 22:xx. Re-check every ~45min via `heimdall` (at `~/AppData/Roaming/npm/heimdall`); if it wakes, fold in for parallel builds/testing (its `gh` token is invalid — use for compute, not pushes). OD (this machine) carries the run regardless.

## Close
Per-item Asana subtasks + comments (MCP); checkpoint every ~2h; anything Malkio-gated → `docs/taskrun/2026-07-24-questions.md`; morning report → `docs/taskrun/2026-07-24-morning-report.md`. Charter is the source of truth; deviate only with logged reasoning.
