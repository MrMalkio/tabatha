# Feedback Review Agent — Protocol

> Written by Rook, 2026-07-22 (TR-15, `2026-07-22-queue.md`). This is the **protocol/prompt doc only**
> — CeeCee schedules the actual every-6h cron invocation separately. Nothing here executes on its own.

## Purpose

The `feedback-to-asana` Supabase edge function (`supabase/functions/feedback-to-asana/index.ts`) lets
signed-in users file bug reports and feature ideas directly from Tabatha (extension + Tabby Sidecar)
into Asana. Those tasks land raw — nobody has looked at them yet. This agent runs every 6 hours, reads
what's new, throws out test/noise, drafts an inline fix plan for anything small and clear, flags
anything large or ambiguous for a human, and hands qualifying items to the nightly bug-fix TaskRun in
the same structural shape the TaskRun queue assembler already consumes.

---

## 1. Trigger cadence

**Every 6 hours.** CeeCee owns the cron wiring (not in scope for this doc). Each run is a fresh
pass — the agent has no persistent memory between invocations, so dedup (§6) has to work off durable
state in Asana itself, not agent memory.

---

## 2. Read scope

**Project:** Asana project `1214031898449333` ("Flux Development"). Note this GID is **not** hardcoded
anywhere in the codebase — `feedback-to-asana/index.ts` reads it from the `ASANA_PROJECT_GID` Supabase
secret at request time (see the file's header comment: keeping the PAT/GID out of the world-readable
unpacked extension is deliberate). `1214031898449333` is the live value, resolved empirically via
`asana-cli.cmd task search --text "Submitted from Tabatha"` during TR-15's queue-assembly pass — re-verify
it still matches if the secret is ever rotated, rather than assuming it's permanent.

**Title pattern to match**, read directly from `feedback-to-asana/index.ts` lines 139-140:

```ts
const emoji = kind === "bug" ? "🐛" : "💡";
const title = `${emoji} [${kind}] ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`;
```

So the real, exact prefixes are:

- **Bug reports:** `🐛 [bug] ` followed by up to 80 chars of the user's text (ellipsis `…` if truncated).
- **Feature ideas:** `💡 [idea] ` followed by up to 80 chars of the user's text (ellipsis `…` if truncated).

There is no third `kind` — the function's `VALID_KINDS` set is exactly `{"bug", "idea"}`; anything else
is rejected at submission time and never reaches Asana.

**Body (`notes`) format**, also read directly from the function (lines 141-153), in this exact order:

```
<full feedback text, untruncated>

— Submitted from Tabatha —
kind: <bug|idea>
version: <extension/Sidecar version or "unknown">
surface: <ctx.surface or "unknown">
url: <ctx.url or "n/a">
localId: <ctx.localId or "n/a">
machineId: <ctx.machineId or "n/a">
userId: <Supabase auth user id>
submittedAt: <ISO timestamp>
```

The literal line `— Submitted from Tabatha —` is a reliable machine-checkable marker that a task came
from this pipeline (as opposed to a task someone typed by hand into the same project). Use it as a
belt-and-suspenders filter alongside the title-emoji check when searching.

**"New/unactioned" definition:** a task in project `1214031898449333` whose title matches `^🐛 \[bug\]`
or `^💡 \[idea\]`, that does NOT yet carry the dedup marker described in §6. Query via
`asana-cli.cmd task search --project 1214031898449333 --text "Submitted from Tabatha"` (or the
equivalent Asana MCP/API call), then filter client-side on the title regex and dedup marker, since
Asana's search text-match is a body/title fuzzy match, not a project+regex query.

---

## 3. Vetting criteria (real vs. test/noise)

**Known test tasks to filter/archive on night one** (pre-existing noise found during TR-15's
queue-assembly pass, not from a real user session):

- `1216713224519004`
- `1216712694759006`
- `1216712939534243`
- `1216679002855862`

All four carry the `— Submitted from Tabatha —` marker but are test feedback, not real reports. On the
agent's **first run**, check whether these four GIDs are still open/unactioned in the project; if so,
mark each with the dedup marker (§6) and a comment noting they were identified as pre-existing test
noise by TR-15, then move on. Do not build fix plans for them.

**General noise-detection rule** (for tasks beyond the four known GIDs, including future test
submissions), applied in order — a task is test/noise if **any** of the following hold:

1. The body's first line (the raw `text` field) is empty, whitespace-only, or under ~5 characters after
   trimming — a placeholder/accidental submit.
2. The body's first line matches (case-insensitive) a low-signal pattern: `^test$`, `^testing`,
   `^asdf`, `^123`, `^\.+$`, or is a single repeated character.
3. The `userId` field in the notes matches a known internal/test account (Malkio, Rook, or other fleet
   agents submitting deliberately to validate the pipeline) **and** the body content itself reads as a
   pipeline check rather than a real complaint (e.g. contains "test feedback", "verifying pipeline",
   "e2e check"). Do not treat every internal-account submission as noise by default — Malkio files real
   bugs too; only skip it when the content itself is self-described as a test.
4. The task GID matches one of the four known-test GIDs above.

If none of these hold, treat it as real and proceed to triage (§4).

**When uncertain:** default to treating it as real and routing it to the propose-only lane (§4) rather
than silently discarding it. Silent discard of a genuine report is worse than one extra human-review
item.

---

## 4. Triage output — inline fix plan vs. propose-only

For every real (non-noise) item, decide which lane it belongs in:

**Inline fix plan** (small/clear) — write a full hand-off item per §5 when **all** of the following hold:
- The report describes a single, reproducible symptom (not "sometimes it feels slow" or multi-issue
  dumps).
- A likely root-cause file or component can be identified from the `surface` context field plus a grep
  of the codebase (e.g. `surface: sidebar` + a complaint about a specific button narrows to
  `src/sidebar/`).
- The fix is estimable at Size S or M under the same sizing convention as the nightly queue (see
  `2026-07-22-queue.md`'s Size field: S = one/two files, mechanical; M = a few files or a real feature
  slice; do not self-assign L — anything that size is propose-only by definition).
- The fix does not require a product/UX judgment call (e.g. "should this be a modal or inline banner")
  that only a human should make.

**Propose-only, flag for human** when **any** of the following hold:
- The report is ambiguous, vague, or describes a symptom without enough detail to locate a cause (e.g.
  "the app feels broken").
- The fix would require a product decision (new feature direction, UX tradeoff, pricing/plan gating,
  anything touching auth/security posture beyond a one-line guard).
- The estimated size is L or larger, or spans more than ~3 files across more than one surface
  (extension + Sidecar + Watch, etc.).
- The report implies a data-integrity or security concern (matches the "security-adjacent" framing
  used for TR-01/TR-04 in the nightly queue) — always route these to human flag even if the technical
  fix looks small, since sequencing/blast-radius judgment matters more than code size here.

For propose-only items: write a short paragraph (what was reported, why it's ambiguous or big, and a
best-guess direction if one exists) and post it as an Asana comment on the task, then leave the task's
custom "Stage" field (or add a comment tag `[needs-human]` if no Stage field is configured for this
project) so it surfaces in Malkio's morning review — do NOT invent a queue entry for it. This mirrors
the nightly queue's own "Excluded — needs Malkio's input" section pattern (see the bottom of
`2026-07-22-queue.md`): propose, don't presume.

---

## 5. Hand-off contract into the nightly bug-fix TaskRun

For every item that qualifies for an inline fix plan, emit a Markdown block in **exactly** the structure
used by `docs/taskrun/2026-07-22-queue.md`'s per-item entries, so tomorrow's queue-assembler (Rook or
whoever plays that role) can paste it in with no reformatting. Each item must have:

```
### TR-XX. <short title>
- **Source:** Feedback review agent, <date>. Asana task <gid>, filed <submittedAt>.
- **What:** <what the user reported, in their words or close to it, plus the surface/version context
  from the notes block>.
- **Fix:** <concrete fix description a builder can execute without re-investigating>.
- **Files:** <specific file paths>.
- **Size:** S | M.
- **Surfaces touched:** <extension / Sidecar / Watch / Companion / Settings / etc.>.
- **Verification gate:** <a concrete, checkable pass/fail condition>.
- **Dependencies:** <none, or named other TR items / branches it must sequence with>.
- **Owner suggestion:** <any agent, or a specific persona if the fix needs prior context>.
```

Field-by-field sourcing:
- `<gid>` and `submittedAt` come straight off the Asana task and its notes block (§2).
- `Source` always cites "Feedback review agent" (not "SYNTHESIS" or a Malkio ask) so the nightly
  assembler can tell provenance apart from the audit-derived items.
- `What` should fold in the `surface` and `version` fields from the notes block — that context is
  exactly what narrows down which code owns the bug.
- `Files`/`Fix` require the agent to actually locate the relevant code (grep/read), not just restate the
  user's words — an item without a located file is not "small/clear" and belongs in propose-only instead
  (§4).

The agent should **append** these blocks to a running file, e.g.
`docs/taskrun/feedback-review-<date>.md`, one per run (do not overwrite prior runs' output — the nightly
assembler reads across recent files same as it reads `docs/audits/*-SYNTHESIS.md` today). The nightly
queue assembler is responsible for pulling items from this file into its own numbered queue and
resolving Tier placement — the review agent does not need to guess a Tier number itself, but a rough
self-estimate ("looks Tier 2, user-visible bug" vs "looks Tier 1, security-adjacent") is a useful
courtesy note directly under the `### TR-XX.` heading title.

---

## 6. Dedup — avoiding re-triage of already-actioned items

Since each run is stateless in agent memory, dedup must be anchored to something durable in Asana
itself. Use **both** of the following, in order:

1. **Comment marker (primary).** After triaging a task (either lane in §4), post an Asana comment on
   that task starting with the literal token `[feedback-review:actioned]` followed by the date and a
   one-line summary of what was decided (e.g. `[feedback-review:actioned] 2026-07-22 — queued as TR-22,
   inline fix, size S` or `[feedback-review:actioned] 2026-07-22 — propose-only, flagged for human`).
   On every run, before triaging a task, check its comment/story history for this token; if present,
   skip it entirely — it was already handled by a previous run.
2. **Stage/field change (secondary, if available).** If the project has a Stage or custom-field
   workflow (consistent with the asana-plugin skill's progress-funnel conventions), move the task to a
   "Reviewed" or equivalent stage as part of triage. This gives a fast filter (query by stage) without
   needing to open every task's comment history, and is a second signal if the comment marker is ever
   missed due to an API error mid-run.

If a task is re-opened or re-submitted with new content after being marked actioned (unlikely given
these are one-shot user submissions, but possible if a user edits/resubmits), the marker's date lets a
human tell an old triage decision from a stale one — the agent does not need to handle this case
automatically; treat any task carrying the marker as done, full stop, for automation purposes.

---

## Summary checklist for each 6h run

1. Search project `1214031898449333` for tasks whose title matches `🐛 [bug] ` or `💡 [idea] ` and whose
   body contains `— Submitted from Tabatha —`.
2. Drop any already carrying the `[feedback-review:actioned]` comment marker.
3. On first run only: locate and mark the 4 known test GIDs (`1216713224519004`, `1216712694759006`,
   `1216712939534243`, `1216679002855862`) as actioned/noise.
4. For each remaining task: apply the noise rules (§3); if noise, mark actioned and move on.
5. For each real task: decide inline-fix vs. propose-only (§4).
6. Inline-fix items → append a hand-off block (§5) to `docs/taskrun/feedback-review-<date>.md`.
7. Propose-only items → post a human-readable comment + stage/tag flag on the Asana task itself.
8. Mark every task processed this run with the `[feedback-review:actioned]` comment (§6).
