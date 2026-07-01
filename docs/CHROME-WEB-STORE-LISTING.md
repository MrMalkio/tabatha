# Chrome Web Store Listing Package — Tabatha

**Status: DRAFT — prepared ahead of time, NOT submitted.** See the checklist at the
bottom for what's still missing before this can actually go live.

This document contains everything needed to fill out the Chrome Web Store Developer
Dashboard listing form, ready to copy-paste when we're ready to publish. It is based on
`public/manifest.json` (v6.4.0), `RELEASE-6.4.0.md`, and `Tabatha_Concept.md` as of
2026-07-01.

---

## 1. Store listing title

**Tabatha — Context & Focus Manager**

Notes: Chrome Web Store titles are capped at 75 characters (this is 32). Keeping
"Tabatha" first preserves brand search; the suffix tells a stranger what it does at a
glance, which plain "Tabatha" alone would not.

---

## 2. Summary (single sentence, ≤132 characters)

> Context-driven tab manager: track intention, time, and focus, with agent-ready data about your work.

**Character count: 100** (limit 132). This is the short blurb shown in search results
and at the top of the listing, separate from the full description below.

---

## 3. Detailed description

```
Tabatha is an Attention & Context Operating System for your browser.

Most browsers treat tabs as a disposable, disconnected pile. Tabatha treats every tab
as a resource tied to a Context ("what am I doing?") and an Intent ("why am I doing
it?") — so your browsing has a shape, not just a tab count.

CONTEXT OVER CHAOS
Every tab belongs to a Context — "Q1 Report," "Learning React," "Vacation Planning."
Open a link from inside a Context and the new tab inherits it automatically, so you're
not stuck re-tagging your whole session by hand.

INTENTIONAL BROWSING
When you open a new tab with no clear path forward, Tabatha's Gatekeeper steps in with
one simple question: "What are you down for?" State your intent and go, take a five-
minute Side Quest, Park the tab for later, or stash a distraction in the Sugar Box to
enjoy as a reward. It's friction, on purpose — enough to turn autopilot tab-opening
into a small, deliberate choice.

UNIVERSAL TIME
Time tracking shouldn't be a separate app you forget to open. Tabatha tracks focus
sessions and clock in/out state as a natural part of using the browser, so where your
time actually goes stays visible without extra effort.

AGENT-READY DATA
Your current Context, active tabs, and stated intent are structured data — not a
guess an AI has to make from screenshots. That means the tools and agents you already
use can understand exactly what you're working on right now, instead of you having to
explain it every time.

Tabatha also includes a command-center sidebar (tab list, priority, time-in-context),
a New Tab dashboard that replaces the default page with your actual working state, and
tab locking so critical tabs can't be closed or navigated away from by accident.

Built for developers juggling docs across a dozen tabs, researchers keeping
investigation threads separate, anyone who benefits from a little good friction before
the next open tab turns into a doomscroll, and AI power users who want their agents to
have real context about their digital workspace.
```

(This intentionally leans on the four pillars from `Tabatha_Concept.md` — Context Over
Chaos, Intentional Browsing, Universal Time, Agent-Ready Data — rather than inventing
new marketing language. No claim above goes further than what the product actually
does per `RELEASE-6.4.0.md`.)

---

## 4. Category and language

- **Category:** Productivity (Chrome Web Store's closest fit for tab/workflow/time
  management tools; "Workflow & Planning" is the sub-label Google sometimes shows
  under Productivity and would also apply if offered as a separate option).
- **Language:** English (United States) — en-US. All current UI copy and docs are
  US English; no localization exists yet.

---

## 5. Single purpose description

Chrome Web Store requires one sentence stating the extension's single purpose, used to
check that every requested permission actually serves that purpose.

> Tabatha's single purpose is to help users maintain intentional context and track
> time across their browser tabs — organizing tabs by declared purpose ("Context"),
> capturing why each browsing session exists ("Intent"), and recording time spent so
> that focus and follow-through are visible.

Everything else (Gatekeeper prompts, sidebar, New Tab dashboard, sync) is in service of
that one purpose: turning tab/time management into structured, intentional data.

---

## 6. Permission justifications

Every entry below maps to a permission actually declared in `public/manifest.json`.

### `permissions`

| Permission | Justification |
|---|---|
| **tabs** | Core to the single purpose: Tabatha needs to read tab URL/title/status and respond to tab creation, update, and removal events to assign Context, show the Gatekeeper on new tabs, and maintain the sidebar's live tab list. |
| **tabGroups** | Used to organize tabs into Chrome tab groups that mirror Tabatha's Context layer (per the Context Engine / inheritance feature) — e.g. grouping tabs that share a Context so the native Chrome UI reflects it, not just Tabatha's sidebar. |
| **storage** | Persists the user's Contexts, Intents, focus-session history, settings, and sync state locally (`chrome.storage`), so the extension retains state across browser restarts and before/between cloud syncs. |
| **alarms** | Schedules recurring background work on a timer without keeping the service worker alive continuously: periodic cloud sync (~every 5 minutes per `RELEASE-6.4.0.md`), Side Quest timers, and focus-session bookkeeping. |
| **notifications** | Surfaces native OS notifications for time-sensitive events the user needs even when Chrome isn't focused — e.g. a Side Quest timer expiring ("nudges you back"), or sync errors that need attention. |
| **webNavigation** | Detects navigation events (e.g. following a link vs. opening a blank tab) so the Context Engine can tell "inherited context via link click" apart from "genuinely new, undirected tab" — the signal the Gatekeeper uses to decide whether to interrupt with "What are you down for?" |
| **downloads** | Supports the Markdown export feature (Agent-Ready Data / `context.md`) that lets a user (or the desktop companion) save the current context/intent state to a file on disk for AI agents or personal records to read. |
| **sidePanel** | Required to render Tabatha's Sidebar Command Center (the tab list, intent dashboard, and time heatmap) using Chrome's native side panel surface rather than a floating window. |
| **activeTab** | Grants temporary, user-invoked access to the current tab's URL/title (e.g. when the user explicitly interacts with the toolbar popup or a Gatekeeper action) without requiring broader always-on access for that specific interaction. |
| **idle** | Detects when the user is away from the keyboard so focus-session time tracking pauses accurately instead of over-counting idle time as active work (supports "Universal Time" accuracy and the planned Flow State detection). |
| **sessions** | Used for the New Tab "Return to Flow" feature — reading recently closed tabs/windows so Tabatha can offer to restore a previous session's tabs after a browser restart instead of the user losing their working set. |
| **scripting** | Injects the Gatekeeper overlay, the distraction Blockgate overlay, and the in-page context indicator (in-bar) into pages at the right lifecycle stage (`document_start` / `document_idle`), since these are the actual UI surfaces for "Good Friction" and Context display. |
| **topSites** | Powers the New Tab dashboard's "Quick Access" tiles (one-click launch for frequently visited sites), auto-injecting the user's current Intent when they relaunch a familiar site from the dashboard. |
| **identity** | Used for Google sign-in so a user's Tabatha account (and therefore their Context/Intent/time history) is tied to their identity and can be recovered on a new machine or after a fresh install (`RELEASE-6.4.0.md`: "your data follows your account, not the install"). |

### `host_permissions`

| Permission | Justification |
|---|---|
| **`<all_urls>`** | Tabatha's core feature set only works if it can operate on any site the user visits: the Gatekeeper/Blockgate content scripts run on every new tab regardless of domain, the Context Engine needs to read the URL/title of whatever page is open to categorize and track it, and URL Lock needs to intercept navigation attempts away from a locked domain. Because Contexts and Intents are user-defined and can apply to any site, there is no fixed, smaller set of domains that would cover real usage — this is a genuine "runs everywhere the user's tabs go" extension, not a single-site integration. |

---

## 7. Privacy practices disclosure

**What is collected:** Browsing *metadata* only — the site/app in use, time spent,
Context and Intent labels the user enters, and focus/clock session state. Concretely:
tab URLs and titles, timestamps, declared Context/Intent text, and session duration.

**What is explicitly NOT collected:** No screenshots, no keystrokes, no page content
(form field values, message text, page body text, etc.) are captured or transmitted.
This matches the existing team commitment in `TEAM-ONBOARDING.md`:

> "Tabatha tracks **metadata** (which app/site, for how long, your stated intent) —
> **not** screenshots, not keystrokes, not page contents."

**Where it's stored:** Supabase, as part of the Flux ecosystem backend (schema
`tabatha`). Data sync happens roughly every 5 minutes and on changes. Row-Level
Security scopes each user to their own rows; only aggregated, non-identifying team
views are exposed to an organization owner via service-role views
(`v_owner_clock_daily`, `v_owner_desktop_daily`, `v_owner_intent_recent`) — the owner
does not get raw per-user row access through those views.

**Sold or shared with third parties:** No. Data is not sold. It is used solely to
provide the product's own functionality (context/time tracking, cross-device sync,
and — for organization accounts — aggregated team visibility for the org's own
owner). No advertising or analytics resale.

**Plain-language summary for the store's Privacy Practices tab:**

> Tabatha collects metadata about your browsing — which sites/apps you use, for how
> long, and the intent you tell it you're working on. It does not collect screenshots,
> keystrokes, or the contents of the pages you visit. This data is stored in our
> Supabase backend, tied to your account so it follows you across machines, and is
> used only to power Tabatha's own tracking and (for team/organization accounts)
> aggregated reporting to your organization's owner. We do not sell or share your data
> with third parties.

**Certifications to check in the Dashboard when submitting:**
- [ ] "This extension does not sell or transfer user data to third parties outside
      approved use cases" — should be checkable, confirm with current business terms.
- [ ] Confirm whether a hosted **privacy policy URL** exists/is required (Chrome
      requires a published privacy policy page if any personal or usage data is
      collected — see checklist item below, this is currently missing).

---

## 8. Asset checklist

| Asset | Requirement | Status |
|---|---|---|
| Store icon | 128×128 PNG | **Needs work.** `public/icons/icon128.png` exists but is actually a 1024×1024 image saved under that filename — it was never resized. Same is true of `icon16.png` and `icon48.png`: all three files in `public/icons/` are byte-identical 1024×1024 PNGs (verified: all three are 358,170 bytes, all measure 1024×1024px). The manifest icon set is technically "working" because Chrome scales at runtime, but the Web Store upload for the *store listing* icon specifically wants a real 128×128 PNG — export one properly (with padding per Google's spec) from the source art rather than reusing the raw 1024px file. |
| Small promo tile | 440×300 PNG or JPEG | **Needs to be created.** No promo tile assets found anywhere in the repo (`public/`, or elsewhere). |
| Screenshots | 1–5 images, 1280×800 or 640×400 | **Needs to be captured.** No screenshots exist in the repo. This is a live-capture task, not something to fabricate — see shot list below. |
| Marquee promo tile (optional) | 1400×560 PNG or JPEG | **Not started / optional.** Skip unless we want featured placement; not required to publish. |

Quick way to confirm current icon state yourself: `public/icons/icon16.png`,
`icon48.png`, and `icon128.png` all report 1024×1024 when opened — none of them is
actually 16px or 48px. Before submitting, regenerate proper multi-resolution icons
(16, 48, 128 at minimum, ideally also 32) from source vector art (`public/icons/icon.svg`
exists and is the right source to re-export from).

---

## 9. Screenshot shot list

Real screenshots should be captured live — during Malkio's install call with the team,
or pulled from the PS machine, which has real day-to-day usage history (Contexts,
focus time, sync state) rather than a blank fresh-install state. Aim for 1280×800.
Suggested five, in the order they'd best tell the product's story to a stranger:

1. **The Gatekeeper new-tab prompt** — the "What are you down for?" overlay on an
   intentional new tab, showing Continue / Side Quest / Sugar Box / Park options.
   This is the single most distinctive, recognizable feature — lead with it.
2. **The sidebar command center with an active focus** — side panel open, showing
   the Intent Dashboard (current focus + elapsed time) and the rich tab list with
   priority colors / context labels, mid-session so it doesn't look empty.
3. **The home/New Tab dashboard** — `home.html`, showing Quick Access tiles and
   (ideally) a "Return to Flow" restore prompt after a restart, to show the
   New-Tab-as-Mission-Control concept.
4. **Settings sync status** — the options page showing the "last synced remotely"
   health chip (synced/stale/error/offline) and account/org info, to visually back
   up the privacy and sync claims made in the listing.
5. **Backdating an intent** — the intent start-time editor (the 6.4.0 "forgot to
   start tracking" feature), to show depth beyond the headline Gatekeeper feature.

Capture notes:
- Use a real account with a few days of history so time heatmaps / stats aren't empty.
- Scrub or fictionalize any tab titles/URLs that reveal internal-only info (e.g.
  client names, unreleased project codenames) before these become public-facing.
- Keep a consistent browser theme/window chrome across all five for a cohesive set.

---

## 10. "Not yet ready to submit because..." checklist

- [ ] **Screenshots not captured** — all 5 shots above are still TODO; requires a
      real, populated Tabatha instance (see PS machine note above), not a fresh install.
- [ ] **Icon assets are not store-ready** — `icon16.png`/`icon48.png`/`icon128.png`
      are all the same unresized 1024×1024 PNG; need real multi-resolution exports.
- [ ] **No promo tile (440×300)** created yet — required for the listing.
- [ ] **No hosted privacy policy URL** — Chrome Web Store requires a published privacy
      policy page for extensions that handle user data; we have the *content* (section
      7 above) but no live URL to point the Dashboard's Privacy field at yet.
- [ ] **Chrome Web Store developer account** — confirm the one-time $5 registration fee
      has been paid and the publishing account is set up under the right organization
      (not a personal account), so ownership/transfer isn't a mess later.
- [ ] **Extension is still team-distributed as unpacked + desktop-companion installer**
      (per `RELEASE-6.4.0.md`) — publishing to the Web Store is a distribution model
      change; decide whether the desktop companion's silent-update mechanism still
      makes sense once Chrome's own auto-update takes over, or whether they'd conflict.
- [ ] **Permission combination likely to trigger slower/manual review:**
      `identity` + `<all_urls>` together (plus `scripting`, `webNavigation`, and
      `tabs`) is exactly the profile Chrome's review team flags for closer, often
      manual, scrutiny — broad host access combined with sign-in/account linking
      reads as higher-risk even though our actual usage (per section 6) is narrow
      and legitimate. Expect this listing to take longer than a typical simple-utility
      review; budget extra calendar time before a hard launch date, and make sure the
      permission justifications in section 6 are copy-pasted in verbatim since
      reviewers will check them against this exact combination.
- [ ] **Business/legal sign-off** on the privacy disclosure wording (section 7) if
      Tabatha becomes externally distributed rather than internal-team-only — the
      "Productization for an external party" item is still on the roadmap per
      `RELEASE-6.4.0.md`'s Known limitations section, and a public Web Store listing
      is a bigger commitment than the current internal deployment.

---

*Generated from `public/manifest.json` (v6.4.0), `RELEASE-6.4.0.md`, `Tabatha_Concept.md`,
and `TEAM-ONBOARDING.md` on 2026-07-01. Update this doc if the manifest's permissions,
version, or description change before submission.*
