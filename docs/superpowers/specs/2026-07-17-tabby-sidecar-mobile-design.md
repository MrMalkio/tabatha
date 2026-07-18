# Implementation Plan 039: Tabby Sidecar — Mobile Web Companion (v0.0.1)

**Current version:** 6.5.0 (extension) · **Sidecar version on completion:** Tabby Sidecar v0.0.1
**Date:** 2026-07-17
**Owner:** Claude (Opus 4.8), worktree `claude/tabby-sidecar-mobile-46c612`
**Deploy target:** `https://tabatha.pondocean.co/sidecar`

---

## 1. Goal

Ship **Tabby Sidecar v0.0.1** — a mobile-first web app that reproduces the current
extension **sidebar** experience for a phone, synced to the user's Tabatha account.
It is an *input-first* surface: see the whole queue, create intents, run the clock,
manage focus — from the phone, away from the computer.

Built in **React Native (Expo + React Native Web)** so the later jump to a real
native iOS/Android app is incremental, not a rewrite.

Reachable at **`tabatha.pondocean.co/sidecar`**, login-gated to the user's account.

## 2. Inherent Sidecar semantics (product rules)

- **Off-device by default.** Any intent/focus created from the Sidecar is stamped
  `offDevice: true` and attributed to a **phone install** (`machine_id` = a stable
  per-device id, `classification: 'mobile'`). Rationale: the user is *not at the
  computer*, so idle/desktop-activity signals must never pause or drift these.
- **Mobile context is intrinsic.** The Sidecar registers itself as a distinct
  `browser_profiles` row (`browser: 'sidecar'`, `classification: 'mobile'`) so
  concurrency/attribution logic already in the extension treats it as its own device.
- **Read the whole queue.** Unlike the cramped extension sidebar (top-5 slices), the
  Sidecar shows the full queue, backburner, tasks, clock, and recent history.

## 3. Architecture

```
┌─────────────────────────────┐     Supabase JS (user JWT)      ┌──────────────────────┐
│  Tabby Sidecar (Expo RN-Web) │ ───── auth: Google + magic link ─▶│  Supabase `tabatha`  │
│  tabatha.pondocean.co/sidecar│ ◀──── read: focus_items,         │  (mtdgoahskcibjbhfvofx)│
│                              │        clock_sessions,           │                      │
│  Screens (tabs):             │        tasks_registry,           │  RLS: owner FOR ALL  │
│   • Focus (active + queue)   │        browser_profiles          │                      │
│   • Tasks                    │ ───── write: focus_items,        │  NEW (this plan):    │
│   • Clock / Shifts           │        clock_sessions,           │   push_subscriptions │
│   • Stash (parked/history)   │        intent_history            │   + send-push edge fn│
│   • Settings                 │                                   │   + pg_cron trigger  │
└─────────────────────────────┘                                   └──────────────────────┘
        │  service worker + Web Push (VAPID)  ▲
        └─────────────────────────────────────┘  push modals (timer expiry, checkpoint)
```

**Deploy shape.** `tabatha.pondocean.co` is already a live Cloudflare **Pages** site
(the marketing/download site). The Sidecar ships as a **Cloudflare Worker** on a
**route** `tabatha.pondocean.co/sidecar*`, which takes precedence over Pages for that
path only — the existing site is untouched. The Worker serves the Expo static web
export (built with `baseUrl: /sidecar`) from its own assets.

**Data layer.** A thin `lib/data/*` module wraps `@supabase/supabase-js`, schema
`tabatha`, mirroring the extension's row shapes (`focus_items` keyed by
`profile_id + client_id`, `tags = { realm, client, project, task }`). No chrome APIs.

**Auth.** Reuse the existing Supabase project's Google OAuth + magic-link. On web
there is no `chrome.identity` — use standard `signInWithOAuth` (redirect back to
`/sidecar`) and `signInWithOtp` (magic link → `/sidecar`).

## 4. Scope — v0.0.1

**In:**
1. Expo RN-Web app, tabbed, mobile-first, dark theme matching Tabatha tokens.
2. Auth: Google OAuth + magic link, session persistence, sign-out.
3. Focus screen: active focus card (timer, stage, elapsed), full queue (priority,
   switch, resolve), backburner, recent history — all read from `focus_items`.
4. Create intent (off-device) → inserts `focus_items` row + `intent_history`.
   Actions: start/switch/pause/resume/resolve/extend/priority/stage.
5. Tasks screen: list + create + complete/reopen (`tasks_registry`).
6. Clock screen: clock in/out, break, live elapsed; shift history (`clock_sessions`).
7. Stash screen: parked tabs + history (read-only on mobile).
8. Settings screen (in-app) for the Sidecar: notification toggle, default realm,
   default timer, device label — persisted to the profile `settings.sidecar` slice
   so desktop can read/manage it too.
9. Web Push: request permission, register service worker + subscription, store in
   new `push_subscriptions` table.
10. Push delivery: Supabase Edge Function + `pg_cron` that scans active focus_items
    for timer-expiry / checkpoint-staleness and sends Web Push (VAPID) — the "same
    modals" parity, first cut.
11. Deploy to `tabatha.pondocean.co/sidecar` via Cloudflare Worker route.

**Out (fast-follow / v0.0.2):**
- **Instant** live round-trip into a *running* desktop extension (needs an extension
  realtime subscription). v0.0.1 is account-synced: appears on the extension's next
  pull/sign-in. (User-chosen.)
- Native iOS/Android store builds (the RN foundation makes this incremental later).
- Tab/group control (a phone can't drive desktop Chrome tabs).
- Full desktop-Settings surfacing of every Sidecar setting (v0.0.1 stores them in the
  shared profile slice; desktop UI to edit them can follow).

## 5. Data contracts (existing tables, owner-RLS `FOR ALL`)

| Table | Sidecar use | Key |
|---|---|---|
| `profiles` | identity, `settings.sidecar` slice | `auth_user_id = auth.uid()` |
| `focus_items` | read queue/focus; write new intents | `(profile_id, client_id)` |
| `intent_history` | append intent events | insert-only |
| `clock_sessions` | read shifts; write clock in/out/break | `(profile_id, client_id)` |
| `tasks_registry` | read/write tasks | `(profile_id, task_id)` |
| `browser_profiles` | register the phone as a mobile install | `(profile_id, local_id)` |

**New table (migration 022):** `tabatha.push_subscriptions`
`(id, profile_id FK, endpoint UNIQUE, p256dh, auth, ua, created_at, last_ok_at)`,
RLS owner `FOR ALL`. Service role used by the edge function to fan out.

## 6. Round-trip note (verified during build)

The extension **pushes** `focus_items` to Supabase and **pulls** on
sign-in/bootstrap (`dataRehydrate`/`bootstrapPull`) — not continuously. A
Sidecar-created intent therefore lands in the account immediately and surfaces in the
extension on its next pull. If the pull path does **not** ingest `focus_items`
(to be confirmed while building), that ingest becomes the first v0.0.2 task — this
does not block v0.0.1, matching the user's "account-synced now, instant later."

## 7. Build sequence

1. Scaffold Expo (default template, RN-Web). ✅ = installs cleanly + `expo export -p web`.
2. Theme + design tokens ported from `src/styles` → RN `theme.ts`.
3. Supabase client + `useAuth` (web OAuth + magic link) + auth-gate screen.
4. Data hooks: `useFocus`, `useQueue`, `useTasks`, `useClock`, device registration.
5. Screens: Focus, Tasks, Clock, Stash, Settings.
6. Intent creation (off-device) end-to-end; verify a row appears in Supabase.
7. Web Push: SW + subscription capture + `push_subscriptions` migration.
8. Edge function `send-focus-push` + `pg_cron`; VAPID keys as secrets.
9. Build web export (`baseUrl:/sidecar`) → Cloudflare Worker + route.
10. Verify live: load `/sidecar`, sign in, create an intent, confirm sync + push.
11. Slack the user the link + login instructions.

## 8. Risks / constraints

- **Production Supabase.** Migration 022 + edge fn go to the live Tabatha project via
  `supabase link --project-ref mtdgoahskcibjbhfvofx` + `db push`. Additive only
  (new table, new fn, new cron) — no changes to existing tables/RLS. Koda available
  to review the migration before push.
- **Existing live domain.** The `/sidecar*` Worker route must not shadow the root
  Pages site. Route is path-scoped; verified post-deploy that `/` still serves Pages.
- **VAPID / Web Push on iOS.** iOS Safari requires the site be added to the Home
  Screen (installed PWA) for push. Documented in the Slack handoff; Android/desktop
  Chrome work without install.
- **OAuth redirect allow-list.** `tabatha.pondocean.co/sidecar` must be added to the
  Supabase Auth redirect allow-list (done via CLI/dashboard during deploy).

## Parallelability Review

- **Zones touched:** new top-level `sidecar/` app (isolated); one additive Supabase
  migration (022) + one new edge function; new Cloudflare Worker + route. No edits to
  `src/` extension code, no shared-file edits → no conflict with active worktrees.
- **Shared files modified:** `.headbox/plan-registry.md` (append), this spec doc,
  `Tabatha_Changelog.md` (append). Append-only; negligible conflict risk.
- **Parallel-safe:** Yes. Fully isolated from the extension build. Max branch
  lifetime: single session; no >1-week split needed.
