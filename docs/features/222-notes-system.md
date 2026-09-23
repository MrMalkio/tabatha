# Feature #222 — Notes System (Free-Standing Notepad + Optional Focus Linkage)

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** InBar quick notes (`src/background/services/notificationService.js:157-169`), Checkpoint notes (`src/components/CheckpointTimeline.jsx`, `focusService.js:1617-1665`), #165 Voice Notes, #211 Audio Input & Voice Control, #154 Notes Panel (never written — this spec supersedes it), desktop companion WS server (`tabatha-desktop` `ws_server.rs`, `:9147`), Mimir serving core (`Caspera/second-brain/mimir/serving`, `127.0.0.1:7717`)
> **Created:** 2026-07-26
> **Source:** User, 2026-07-26
> **Category:** Capture / Knowledge / Cross-Surface

## User Context (Quotes)

> "I want a notepad integration to the Tabatha system — replicate a mix of Google Keep, Obsidian, Evernote, and Apple Notes. Sidebar should have an option that just allows me to take notes. We can of course decide to connect notes to things, but initially the ability to take notes during work is important. It should be available in Sidecar and desktop as well. I also want the notes system to be a direct but NOT dependent integration to our Mimir system (beyond-second-brain system). V1 that is just available in companion and in extension can start now. I want to be able to jot notes down that may or may not be connected to the current focus."
> — User, 2026-07-26

## Status Check (resolved during intake)

Tabatha has **four** note surfaces today and **none of them is a notepad**. Every one is a field on another entity — kill the parent and the note dies with it. There is no standalone note record anywhere in the system.

| Surface | Where | What it actually is | Why it isn't a notepad |
|---|---|---|---|
| **InBar quick note** | `src/content/inbar.js:574-587` (📝 panel), `:1207-1226` (debounced save); handlers `notificationService.js:59-63`, `:157-169` | One string per tab, `chrome.storage.local` key `inbarNotes` → `{ [tabId\|'global']: { text, updatedAt } }` | **One note per tab, overwritten in place.** No list, no title, no tags, no search. Deleted on tab close (`tabService.js:785-788`, text folded into the closed-context archive). |
| **Checkpoint notes (CPN)** | `CheckpointTimeline.jsx:26`; `SAVE_CHECKPOINT_NOTE` at `focusService.js:195-196`, written into `item.checkpoint[]` at `:1617-1665`; cloud `supabase/migrations/032_focus_checkpoints.sql`; sync `syncService.js:463-545` | Append-only progress log **inside a focus item** | Cannot exist without a focus. Prompted, not volunteered. Answers "what have you accomplished", not "what was I thinking". |
| **Pause sticky note** | `src/content/inbar.js:683-702` (overlay), `:764-780` (`savePauseState`); storage key `pausedIntents` | One "where I left off" string per paused tab | Destroyed on resume (`:820-832`) or converted into a parked-tab record (`tabService.js:742-759`). Ephemeral by design. |
| **Break notes** | `src/workshifts/index.jsx:595-630` | **UI stub, not persisted** — carries a `SOON` badge saying the note dies on reload | Not wired to any storage at all. |
| *(adjacent)* Parked tabs / Sugar Box | `tabService.js:746-756`; `blockgateService.js:123-131` | Parked tabs carry a `note` string inherited from the pause note; Sugar Box has **no** note field | Tab-stash records, not notes. |
| *(adjacent)* "Notes-simple" mode | worktree `.claude/worktrees/sidecar-notes-simple`, `sidecar/src/screens/SimpleScreen.tsx` (Plan 040 Epic 5, **unmerged**) | A Notes-*shaped* capture box whose output is an **intent**, not a note | "A Notes app that's secretly an attention OS" — the text becomes a focus. Nothing is stored as a note. |

Confirmed greenfield: **no `notes` table** in `supabase/migrations/` (030–060), **no `notesService`**, **no `NotesPanel`**. Feature #154 "Notes Panel" is referenced by #165 but its file was never written; this spec replaces it.

---

## What It Does

Adds a **free-standing note** — the first Tabatha object that exists on its own, owns no time, and blocks nothing. A Notes panel in the Sidebar (📝) lists them newest-first; typing starts a note, and it saves as you type. Nothing else is required of the user: no title, no focus, no tag, no destination.

The design is deliberately **not** a union of the four reference apps. It takes one idea from each and refuses the rest:

| Product | What Tabatha takes | What Tabatha refuses |
|---|---|---|
| **Google Keep** | Capture speed (a note is one keystroke from anywhere), colored cards, pinning, masonry list | Reminders, collaborators, image-first cards |
| **Obsidian** | Markdown as the *only* body format; `[[wikilinks]]` and backlinks (V3); plain-text portability and full export | A vault of files on disk, plugins, graph view as a primary surface |
| **Evernote** | Tags + genuinely good full-text search; web clipping (Tabatha's version is the context stamp, which is automatic and free) | **Notebooks.** Hierarchy is a second organizing system that competes with tags and with Contexts, which Tabatha already has |
| **Apple Notes** | Zero-friction start (no title, no save button), markdown checklists (`- [ ]`), invisible sync | Rich-text/attachment model, folders |

**The opinion, stated once:** Tabatha's notepad is a **single flat stream of markdown cards**, ordered by recency, organized by tags and pinning only, searched rather than filed — and every card silently remembers what you were doing when you wrote it. It is Keep's ergonomics over Obsidian's data model, with Tabatha's context as the thing that replaces filing. This is Progressive Simplicity (`Tabatha_Concept.md:124-132`) applied to capture: the note *removes* the decision of where to put it.

## Optional Focus Linkage — the crux

Malkio: *"notes down that may or may not be connected to the current focus."* Ownership is the trap here — if a note belongs to a focus, resolving the focus buries the note; if it belongs to nothing, the note loses the thing that made it meaningful. The resolution is **two separate fields**:

| Field | Written by | Mutable | Meaning |
|---|---|---|---|
| `contextStamp` | The system, **always**, at creation | No (immutable provenance) | "This was written while focus X was active, on tab Y, during shift Z." A fact about the past. |
| `linkedFocusId` | The user, **only** on explicit action | Yes (link/unlink freely) | "This note is *about* focus X." A claim about meaning. |

Default on every capture: **standalone, but context-stamped.** The note appears in the Notes panel and nowhere else; the focus does not own it, does not list it, and resolving the focus does not touch it. The card shows a quiet footer — `while: Refactor sync arbitration · 14:22` — with a single **Link** affordance. One click promotes the stamp to `linkedFocusId`, at which point the note also surfaces on the focus (and, in V2, on its timeline). Unlink reverses it; the stamp survives either way.

This is the whole reason a note is not a checkpoint. A checkpoint is a claim about a focus. A note is a thought that happened to occur during one.

## Surfaces

| Surface | Scope | Entry point |
|---|---|---|
| **Sidebar Notes panel** | **V1** — the primary ask | New `{ id:'notes', label:'📝' }` in `src/sidebar/index.jsx:371-377`, plus a `panel === 'notes'` body block after `:810` (same three-edit pattern as every existing panel) |
| **Extension home** | **V1** — full-width list + editor | `src/home/index.jsx` (`activePanel` pattern, `:1918`) |
| **Desktop companion** | **V1** — global-hotkey capture window; the only surface that works with the browser closed | `tabatha-desktop`, new note store + WS message over the existing `:9147` channel |
| **InBar** | **V1 (write-only)** — the 📝 button gains a "save as note" action alongside its existing tab note | `src/content/inbar.js:574-587` |
| **Sidecar (mobile/web)** | **V2** — read + capture, once the `notes` table syncs | `sidecar/src/screens/` (new `NotesScreen`) |

## Capture Ergonomics (V1 acceptance)

| Requirement | Test |
|---|---|
| Zero-decision start | Opening the Notes panel and typing creates a note. No "New note" button press, no title prompt, no save button. |
| Autosave | Body persists on a 400 ms debounce and on panel blur/close; killing the sidebar mid-sentence loses nothing. |
| Context is free | The stamp is written without the user doing anything, and is visible but not intrusive (one muted footer line). |
| Nothing is owned | Resolving, deleting, or archiving the stamped focus leaves the note untouched and still readable. |
| Search finds it | Substring match over title + body + tags returns the note in the same panel, no mode switch. |
| Survives everything | Notes are unaffected by tab close, browser restart, clock-out, and extension reload. |

**Explicitly out of scope for V1:** notebooks/folders, attachments and images, sharing, collaborative editing, rich text, note templates, reminders, encryption-at-rest beyond what `chrome.storage.local` provides, and any Mimir call whatsoever.

## Data Model

```js
{
  id: 'note_1753..._a9f',        // client-generated, stable across sync
  title: '',                      // optional; falls back to first line of body
  body: '',                       // markdown — the only body format
  tags: [],                       // flat, no hierarchy
  color: 'default',               // Keep-style card tint
  pinned: false,
  createdAt: '2026-07-26T18:22:04.113Z',
  updatedAt: '2026-07-26T18:24:41.902Z',   // REQUIRED, see below
  contextStamp: {                 // immutable, written once at creation
    focusId: null,                // active focus at capture time, if any
    focusLabel: null,             // denormalized so the stamp survives focus deletion
    tabUrl: null,
    windowId: null,
    capturedDuringShift: false
  },
  linkedFocusId: null,            // user assertion; null = standalone
  source: 'sidebar',              // 'sidebar' | 'home' | 'inbar' | 'companion' | 'voice' | 'sidecar'
  mimir: { pushedAt: null, atomId: null, chunkId: null }   // V3; null until pushed
}
```

**Storage.** `chrome.storage.local` key `tabathaNotes` (array, newest-first) is the V1 source of truth; the companion keeps its own SQLite table and reconciles over `:9147`. V2 adds `tabatha.notes` in Supabase.

**`updated_at` is non-negotiable from migration one.** `docs/audits/2026-07-24-sync-forensics.md:18` names Root Cause A: `focus_items` has no `updated_at`, the extension re-upserts its whole engine on a timer, and its only adjudicator is gated on **authorship** (`tags._src === 'sidecar'`) rather than recency — "not patchable", deferred to Plan 046. `focus_checkpoints` (migration 032) dodged this by being append-only with `created_at` only; notes are editable and cannot dodge it. Requirements: `updated_at` column set on every write, recency-based (`strict >`) adjudication, per-note upsert on `(profile_id, client_id)` rather than whole-table replacement, and a tombstone row for deletes so a delete cannot be resurrected by a stale push.

## Mimir Integration — "direct but not dependent"

**What Mimir is, as of 2026-07-27.** Duck & Shark's second brain: a live Postgres schema (`mimir`, on the Caspera Supabase project, migration `20260719120000_mimir_foundation_v2.sql`) fronted by a Fastify daemon on **`127.0.0.1:7717`** with six endpoints — `POST /query`, `POST /capture`, `GET /provenance/:chunk_id`, `GET /stats`, `GET /lens/:id`, `POST /feedback` — plus a thin `mimir` CLI client. Content lands as `source → thread → item → chunk`, every row carrying `tags[]`, `domain`, `classification`, `principal_id`.

**Its constraints, which this integration must respect and not paper over:**
- **Not deployed beyond loopback.** Single-user, single-operator, one machine. Promotion to the VPS is gated behind the C0–C3 hardening chain and Koda's standing verdict (53 findings) — *do not promote beyond single-user loopback* (`mimir/docs/quickstarts/generic-http.md`, `mimir/KODA-REVIEW.md`).
- **Auth is not auth.** `x-mimir-agent: <label>` is an audit tag, not a credential. Signed `mct/1` capability tokens arrive with C0–C3 (`design/mimir-identity-policy-model.md` §5).
- **Classification is hard-capped.** `/capture` silently clamps anything above `internal`; `confidential`/`private` are never served to anyone.
- **Retrieval is lexical only.** Every chunk's `embedding` is null; the embeddings decision is open (`design/EMBEDDINGS-DECISION-GUIDE.md` — local-first, API pilot approved).
- **Lens injection is compulsory** on every `/query` and `/capture`; there is no suppress flag.

**The boundary contract (design now, build in V3):**
1. **Notes are complete without Mimir.** No Mimir call is ever on the write path. A note saves to local storage and the UI settles before any push is considered. Daemon down, companion missing, Mimir never installed — identical behaviour.
2. **Opt-in, per-scope, in Settings.** Default **off**. Settings offers: off · push notes tagged `#mimir` · push all notes. Nothing leaves the machine silently.
3. **The companion is the transport, not a dependency.** MV3 service workers should not hold a host permission for `http://127.0.0.1:7717/*`; the companion already runs a local server on `:9147` and is a native process on the same machine. Extension → companion (existing WS) → `POST /capture`. **No companion, no push — and no error the user has to care about.**
4. **Push shape.** `POST /capture` with `{ text: <title + body>, tags: ['tabatha', 'note', ...note.tags], domain: 'tabatha', classification: 'internal', session_id: <focus id or shift id> }`, header `x-mimir-agent: tabatha-companion`. Response `atom_id`/`chunk_id` stored in `note.mimir` so a second save updates rather than duplicates.
5. **Refuse, don't clamp.** A note the user marked private must **not** be pushed at all. Mimir silently downgrades `private` → `internal`; Tabatha must never let a user's privacy intent be resolved by a downstream clamp.
6. **Outbox, mirroring the CLI.** Failed pushes queue locally (the `~/.mimir/outbox.jsonl` pattern) and drain on reconnect. A fleeting thought never dies because a daemon was down.
7. **Pull is a separate, later toggle.** A search box in the Notes panel may `POST /query` and show Mimir results in a visually distinct, read-only section, clearly labelled as coming from the Well, with a provenance link. Never merged into the local note list. Not before capability tokens land.

**Status: deferred-but-designed.** The daemon is loopback-only and un-promoted; V3 ships when Mimir clears C0–C3 or when Malkio accepts loopback-only, same-machine push. The contract above is frozen now so V1 and V2 don't build a shape that has to be undone.

## Phasing

| Phase | Scope |
|---|---|
| **V1** | Extension + companion, local only. Sidebar Notes panel, home panel, InBar "save as note". Markdown body, tags, color, pin, full-text search, context stamp on every capture. No sync, no Mimir. |
| **V2** | `tabatha.notes` migration (with `updated_at` + tombstones), Sidecar `NotesScreen`, promote-to-linked (`linkedFocusId`) surfacing on the focus and its timeline, voice-to-note via #211/#165. |
| **V3** | Mimir bridge per the contract above, `[[wikilinks]]` + backlinks between notes and to focuses/tasks, AI summarization ("what did I note this week"), note → intent promotion (closing the loop with Plan 040 Epic 5). |

## Implementation Notes

- **Recommendation: InBar quick notes stay separate — do not migrate them.** They are a *tab annotation* ("what is this tab for"), addressed by tab id, destroyed with the tab, and already correctly archived into the closed-context record (`tabService.js:762-789`). Folding them into a durable note stream would flood the notepad with per-tab scratch and break the archive path. Instead: the InBar 📝 panel keeps its tab note **and** gains a second action — *"Save as note"* — which creates a real `tabathaNotes` entry stamped with that tab's URL. One-way promotion, no shared storage, no migration.
- Checkpoint notes and pause sticky notes likewise stay where they are; both are lifecycle artifacts of a focus/tab, not free-standing thoughts. A V2 nicety: a checkpoint's overlay can offer "…or save this as a note instead" when the user has nothing to report on progress.
- Markdown rendering must not pull a heavy dependency into the content-script bundle. Render markdown in the Sidebar/home panel only; InBar capture is plaintext-in, markdown-stored.
- Search should be a simple lowercase substring scan over `title + body + tags` in V1 (note volume is small); revisit only when a real corpus exists.
- The companion note store must reconcile by `updatedAt`, not by "companion wins" — the same mistake as Root Cause A, one layer down.
- Sidebar panel registration is three edits (state `:188`, array `:371-377`, body block after `:810`); home uses a different `activePanel` pattern and needs its own wiring.

## Open Questions
1. Should a note's `contextStamp` also capture the *tab title* (useful) or the full URL (potentially sensitive)? Proposal: title always, URL behind the existing privacy-mode setting (#198).
2. Colors: Keep-style fixed palette, or bound to Tabatha's Context/realm colors so a note's tint means something?
3. Does a linked note count toward a focus's checkpoint cadence (i.e. does writing a linked note satisfy a pending checkpoint prompt), or are the two deliberately independent?
4. Where do voice notes' audio blobs live — IndexedDB per #165, or companion-side files? This decides whether V2 or V3 owns audio.
5. Should V1 ship a `#mimir` tag convention even before the bridge exists, so early notes are already routable when V3 lands?

## Related Features
- #154 Notes Panel (referenced by #165; file never written — **superseded by this spec**)
- #165 Voice Notes (Universal Capture) — its "unified Notes Panel" destination is this feature
- #211 Audio Input & Voice Control — voice-to-note tier
- #173 Edit Contribution Notes — a different note kind (edit rationale), stays separate
- #184 Checkpoint Progress Notes — the focus-anchored counterpart
- #198 Privacy Modes — gates URL capture in the context stamp
- Plan 040 Epic 5 "Notes-simple" (Sidecar) — note→intent promotion is the V3 convergence point
