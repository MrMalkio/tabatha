# Tabatha Cortex — Documentation Index

> 🔗 Google Doc: https://docs.google.com/document/d/1UlvVqgMm_64EAqpNEOjDcaZWiWPJQYyFO2P6_0Gz2Io/edit?usp=drivesdk&ouid=104108780460431833741

Cortex is the AI intelligence tier of the Tabatha Attention OS: it watches the telemetry Tabatha already collects, captures screenshots/audio only when context warrants, distills behavior into an Observations Ledger, finds patterns of waste (repeat ≥3–4×), and runs an optimization loop that surfaces — and increasingly executes — fixes. It is a **program, not a feature**: ~15 capability clusters across 5 layers, shipped in phases. Phase 1 targets **v7.0.0**.

Each cluster below has its own independent, expandable feature file so it can be delegated to a separate agent and reassembled ("like a transformer"). Every file cross-links back to the Program Spec.

## Master documents
- **Program Spec** — local: [`00-cortex-program-spec.md`](./00-cortex-program-spec.md) · [Google Doc (source of truth)](https://docs.google.com/document/d/1KC52k_RAebemkFQqk8UHGDuMCEnxuZwYnAc_YgVe9Ww/edit?usp=drivesdk&ouid=104108780460431833741)
- **Source Brain-Dumps** — local: [`SOURCE-braindumps.md`](./SOURCE-braindumps.md) · [Google Doc (source of truth)](https://docs.google.com/document/d/1qcwwhDKsROBnJQSjgsREzG_Bt2UXHfckUEg0Hg3wf1w/edit?usp=drivesdk&ouid=104108780460431833741)
- **Agent Data Map** — [`DATA-MAP.md`](./DATA-MAP.md)
- **Optimization prompts** — [`prompts/`](./prompts/)
- **Drive folder** — [Cortex — AI Optimization Layer](https://drive.google.com/drive/folders/1zB_w6IrP2WWVCSCDHUTPI3wrmmYRutuc)

## Capability clusters

| ID | Title | Phase | File |
|----|-------|-------|------|
| C1 | Adaptive Capture Engine | Phase 1 | [C1-adaptive-capture-engine.md](./features/C1-adaptive-capture-engine.md) |
| C2 | Sensitive-Data Guard | Phase 1 | [C2-sensitive-data-guard.md](./features/C2-sensitive-data-guard.md) |
| C3 | Storage & Retention Fabric | Phase 1 | [C3-storage-retention-fabric.md](./features/C3-storage-retention-fabric.md) |
| C4 | Observations Ledger | Phase 1 | [C4-observations-ledger.md](./features/C4-observations-ledger.md) |
| C5 | Pattern Engine | Phase 1 | [C5-pattern-engine.md](./features/C5-pattern-engine.md) |
| C6 | Optimization Loop | Phase 1 | [C6-optimization-loop.md](./features/C6-optimization-loop.md) |
| C7 | Recommendation & Action Layer | Phase 1 (read-only) / Phase 2 (execution) | [C7-recommendation-action-layer.md](./features/C7-recommendation-action-layer.md) |
| C8 | Agent Orchestration & Routing (Autonomy Ladder) | Phase 1 (cron-in-harness) / Phase 2+ | [C8-agent-orchestration-routing.md](./features/C8-agent-orchestration-routing.md) |
| C9 | Voice & Audio (two-way + 3 hotkeys + dictation) | Phase 3 | [C9-voice-audio.md](./features/C9-voice-audio.md) |
| C10 | Passive Self-Correction | Phase 3 | [C10-passive-self-correction.md](./features/C10-passive-self-correction.md) |
| C11 | Cross-Signal Attention Accounting | Phase 5 | [C11-cross-signal-attention-accounting.md](./features/C11-cross-signal-attention-accounting.md) |
| C12 | Team / Onboarding SOP Mode | Phase 4 | [C12-team-onboarding-sop-mode.md](./features/C12-team-onboarding-sop-mode.md) |
| C13 | Environment & Mobile | Phase 5 | [C13-environment-mobile.md](./features/C13-environment-mobile.md) |
| C14 | Agent Data Map & Governance | Phase 1 | [C14-agent-data-map-governance.md](./features/C14-agent-data-map-governance.md) |
| C15 | Config & Interaction-Density Model | Phase 2 | [C15-config-interaction-density-model.md](./features/C15-config-interaction-density-model.md) |

## Docs sync convention

The **Google Doc is the source of truth** for each master document. The local `.md` file is a synced mirror that carries the Drive link in its header (right under the H1). When editing, prefer updating the Google Doc, then download/replace the local mirror — this avoids double-authoring and lets the same docs drop straight into the Tabatha NotebookLM. Per-feature files are authored/expanded locally by Fable; mirror them to the Drive folder as they mature.
