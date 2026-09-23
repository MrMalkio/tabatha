# Feedback Review — 2026-07-23

> Produced by the feedback-review agent (Aegis persona) per
> `docs/taskrun/feedback-review-agent.md`. Append-only, one section per run.
> The nightly bug-fix queue assembler pulls qualifying `### TR-XX` blocks from
> here (same as it reads `docs/audits/*-SYNTHESIS.md`) and resolves final
> numbering/Tier — the `TR-20` below is a provisional label (next free after
> TR-19 in `2026-07-22-queue.md`), not a committed queue slot.

## Run — 2026-07-23 (~18:3x UTC pass)

**Scanned:** Asana project `1214031898449333` ("Flux Development"), titles matching
`🐛 [bug] ` / `💡 [idea] ` + body marker `— Submitted from Tabatha —`.

**Disposition:**
- `1216832543077901` — 🐛 [bug], real user report → **inline fix, TR-20 below (Size S)**.
- `1216713224519004`, `1216712694759006`, `1216712939534243` — known test GIDs, already
  carried the `[feedback-review:actioned]` marker from a prior run → skipped (no re-triage).
- `1216679002855862` — known test GID (`[QA TEST — ignore]` Rook probe), already completed;
  marked actioned this run for durable dedup, no fix queued.

---

### TR-20. Show pause/resume events in the Sidecar checkpoint Timeline
> Self-estimate: Tier 2, user-visible bug — a recorded-but-hidden data gap, no security/data-integrity angle.

> **✅ DONE — 2026-07-23 nightly TaskRun (Tovi persona).** Fixed on canonical Sidecar branch
> `claude/tabby-sidecar-mobile-46c612`, commit `218279c`, **Sidecar 0.13.8**.
> - `FocusScreen.tsx`: `SYSTEM_KINDS` now includes `start`/`pause`/`resume`; `systemEntryLabel()`
>   labels them ▶ Started / ▶ Resumed / ⏸ Paused. `resolve`/`snooze` left out per the plan.
> - `FocusTimeline.tsx` (landscape parity): added the ⏸ pause node (start/resume already rendered).
> - **Proof:** `tsc --noEmit` clean on both changed files (only the pre-existing unrelated
>   `app-tabs.web.tsx` route-type error remains); 40/40 timeline+timer node tests green;
>   `expo export -p web` healthy 2.4 MB bundle; built bundle grep shows `Paused`×5 / `Resumed`×3
>   (absent before this change in the phone reading view).
> - **Deploy:** committed + build-verified, **NOT deployed to prod** — the new rows can't be
>   visually smoke-checked headless (Sidecar sign-in is a Malkio-only credential gate), so per the
>   consent-first / proof-before-done bar (same call as TR-14b last night) the prod redeploy is a
>   morning approval: a 5-second visual check that ▶/⏸ rows interleave correctly, then one
>   `wrangler deploy` (`OPERATIONS.md` §2.1).

- **Source:** Feedback review agent, 2026-07-23. Asana task `1216832543077901`, filed `2026-07-23T18:26:11.703Z`.
- **What:** User (surface `sidecar_android_web`, version `0.13.7`) reports that pauses/resumes —
  "everything that happens" — should appear in the timeline log "when you leave a checkpoint or
  you're reading your past checkpoints and notes." Verified: pause/resume events **are** recorded
  in `focus_events` (`sidecar/src/data/focus.ts:235,252` emit `kind:'pause'`; `:216,246` emit
  `start`; resume via `start`), and the model already types them (`sidecar/src/data/events.ts:19-27`).
  They are simply **filtered out of the reading view**: the phone `CheckpointPanel`'s "Timeline"
  interleaves only `SYSTEM_KINDS = {'extend','backburner','unbackburner'}`
  (`sidecar/src/screens/FocusScreen.tsx:357`), so `pause`/`resume`/`start` never render. The
  landscape Context View (`FocusTimeline.tsx:108-109`) already renders `resume` as "▶ Resumed"
  but likewise omits `pause` — same gap, secondary surface.
- **Fix:** In `FocusScreen.tsx`, add `'pause'`, `'resume'`, and `'start'` to `SYSTEM_KINDS`, and
  extend `systemEntryLabel()` (`:359-365`) with cases: `pause → {icon:'⏸', text:'Paused'}`,
  `resume → {icon:'▶', text:'Resumed'}`, `start → {icon:'▶', text:'Started'}` — mirroring the
  existing extend/backburner treatment and the "▶ Resumed"/"Started" labels already in
  `FocusTimeline.tsx:117-118`. (These entries are already read-only/undeletable via the
  `styles.cpRowSystem` branch, so no delete-affordance work is needed.) Optionally, for parity,
  add a `pause` node to `FocusTimeline.tsx`'s node builder (icon ⏸) so the landscape Context View
  matches — same one-file mechanical change on the second surface. Leave `resolve`/`snooze` out
  (resolve ends the focus; snooze is deferral, not activity on this focus) unless Malkio asks for
  literal "everything" — that's the only judgment call and it's a small one.
- **Files:** `sidecar/src/screens/FocusScreen.tsx` (`SYSTEM_KINDS` const `:357`, `systemEntryLabel` `:359-365`); optional parity: `sidecar/src/components/FocusTimeline.tsx` (`Node.kind` union `:39`, node builder `:108-121`).
- **Size:** S.
- **Surfaces touched:** Tabby Sidecar (phone checkpoint panel; optional landscape Context View).
- **Verification gate:** With an active focus that has ≥1 pause and ≥1 resume in `focus_events`,
  open 📋 Checkpoint on the phone view → the "Timeline" list shows "⏸ Paused" and "▶ Resumed"
  rows interleaved chronologically with checkpoint notes; entries are non-deletable (system rows).
- **Dependencies:** None. No migration (events already stored). No data-model change.
- **Owner suggestion:** Any agent; light prior context helps (Sidecar timeline conventions live in `FocusTimeline.tsx` + `events.ts`). Related: `docs/features/184-checkpoint-progress-notes.md` (checkpoint notes model) — context, not a duplicate.
