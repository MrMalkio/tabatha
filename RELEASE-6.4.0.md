# Tabatha v6.4.0 — Release Notes

**Release date:** 2026-06-30
**Type:** First team deployment (unpacked extension + desktop companion; no Chrome Web Store)
**Status:** Production (`main`), shipped to the Duck & Shark team

---

## What Tabatha is

Tabatha is an **Attention & Context Operating System** for the browser + desktop. It
turns tabs, time, and focus into structured data: every browsing session is bound to a
**Context** ("what am I doing?") and an **Intent** ("why?"). It tracks where time and
attention actually go — clock in/out, focus sessions, app usage — and syncs it to a
shared workspace so the team's capacity and follow-through become legible, and so AI
agents can read real context about what people are working on.

Two pieces install per machine:
- **Chrome extension** — the Gatekeeper (good-friction new-tab), time tracking, intent/
  context capture, the sidebar command center, and cloud sync.
- **Desktop companion** (Tauri tray app) — machine-wide app/attention tracking, clock
  state, and (new in 6.4.0) one-click install + silent auto-update.

---

## What's new in 6.4.0

### Sync & management visibility
- **Org attribution fix (the big one).** Redeeming an invite now sets the member's
  `default_org_id` / `default_team_id`, so every synced row (clock, desktop, intents,
  focus) is attributed to the organization. Before this, team data synced *un-grouped*
  and a management view came back empty. This is *the* fix that makes team visibility work.
- **Owner read views** — three service-role views (`v_owner_clock_daily`,
  `v_owner_desktop_daily`, `v_owner_intent_recent`) give the owner aggregated team
  time/context without exposing cross-member data to ordinary users.
- **"Last synced remotely" indicator** in the sidebar — a live chip showing sync health
  (synced / stale / error / offline).

### Data durability
- **Pinned extension ID.** The manifest now carries a stable `key`, so the unpacked
  extension keeps the same identity across reloads/updates and `chrome.storage` survives.
- **Cloud rehydrate on sign-in.** Signing in on a fresh or new-ID install restores your
  history (clock, intents, focus) from the cloud — your data follows your account, not
  the install.

### New features
- **Intent start-time editing (backdating).** Forgot to start tracking? Set an intent's
  start time — including in the past — and the elapsed time is credited retroactively,
  with validation so it can't backdate before clock-in or double-count another focus.
- **In-app feedback → Asana.** A lightweight feedback control posts issues/ideas straight
  into an Asana project (brokered through a secure edge function — no secrets in the
  extension), so feedback becomes actionable tasks.

### Desktop companion (no Web Store)
- **Creates the install folder.** The companion bundles the extension and lays it down at
  `%APPDATA%\Tabatha Desktop\extension\`, so there's one stable folder to load from.
- **Dummy-proof guided install.** Detects whether the extension is installed / was-here-
  now-broken / connected, and walks the user through Load-unpacked (copy path → open
  `chrome://extensions` → paste → done), auto-advancing when the extension connects.
- **Silent auto-update.** Pulls new extension files from Supabase Storage, verifies them
  (SHA-256 + a guard that the extension *key* is unchanged), atomically swaps only the
  code (never touching the local data), and signals the extension to reload itself — no
  manual refresh, no Web Store.

---

## How it works (end to end)

1. **Install** the desktop companion (`.msi`). It creates the extension folder and guides
   you to load the unpacked extension into Chrome.
2. **Sign in** (Google or magic-link) and **redeem your invite** — this joins you to the
   org so your data is attributed correctly.
3. **Work normally.** The Gatekeeper asks "what are you down for?" on intentional new
   tabs; time and context accrue automatically; clock in/out tracks work vs. break.
4. **Sync** runs every ~5 minutes and on changes, pushing to Supabase (project `Flux`).
   The sidebar chip shows last-synced health.
5. **Management** reads aggregated team time/context via the owner views (service role /
   dashboard) — where time goes, focus vs. distraction, what people work on.
6. **Updates** arrive silently via the companion; your local data is never touched.

---

## Architecture

- **Extension:** React/Vite, Manifest V3, syncs to Supabase (schema `tabatha`).
- **Companion:** Tauri 2 (Rust + React), tray app, bridges to the extension over a local
  WebSocket (`localhost:9147`), owns install-folder creation + auto-update.
- **Backend:** Supabase (part of the Flux ecosystem) — clock sessions, desktop activity,
  intent history, focus items, org registry, calendars. RLS keeps each user to their own
  rows; the owner reads team aggregates via service-role views.
- **Source of truth:** GitHub `MrMalkio/tabatha` (`main` = production, `staging` = dev).

---

## Known limitations / roadmap (next ~30 days)
- In-extension **manager dashboard** (today the owner reads via Supabase views).
- **AI features** on top of the captured context (the long game — agents acting on real
  team context).
- **Schedule + time-off** management; "not working" context.
- **Cross-profile divergence** flagging (Chrome activity in a profile without the
  extension is noted, not yet richly attributed).
- A **public download site** for the extension + companion + screensaver.
- **Productization** for an external party (usage data only, not their team's data).
