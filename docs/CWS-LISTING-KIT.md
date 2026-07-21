# CWS Listing Kit — item `piopncjacohahbkkmockjnpenhdbmmbc` (v6.7.47 draft)

> Prepared 2026-07-21 (Soren/CeeCee). Chrome **hard-forbids automation of Web Store
> pages** ("The extensions gallery cannot be scripted") and desktop computer-use is
> read-only on browsers, so the listing must be filled by hand. Everything below is
> ready to paste — ~10 minutes total.
>
> Console: https://chrome.google.com/webstore/devconsole → Tabatha draft → Edit.

## 1) Store listing tab

**Screenshots** — already correct at 1280×800, in `store-assets/screenshots/`.
Recommended five, in order: `02-sidebar.png`, `03-home.png`, `06-popup.png`,
`07-workshifts.png`, `04-settings.png`.

**Category:** Productivity → Workflow & Planning. **Language:** English.

**Description (paste verbatim):**

```
Tabatha turns your browser into an Attention Operating System. Instead of treating tabs as a disposable, ever-growing list, Tabatha binds every tab to a Context (what you're doing) and an Intent (why you're doing it) — so your browser reflects your actual work, not your distractions.

WHY TABATHA
Most tab managers just hide the chaos. Tabatha removes it at the source: it makes browsing intentional, tracks your time automatically, and helps you follow through on what you set out to do.

THE GATEKEEPER — GOOD FRICTION
Open a new tab with no clear path and Tabatha gently interrupts: "What are you down for?" State your intent and get to work, take a timed 5-minute side quest, save a distraction to enjoy later, or park a tab for another time. A moment of friction that stops mindless browsing before it starts.

CONTEXT ENGINE
Tabs inherit context automatically. Open a link from a "Project X" tab and the new tab joins "Project X" — no manual tagging. Tabatha also recognizes common sites and suggests sensible categories.

THE SIDEBAR — YOUR COMMAND CENTER
A permanent side panel showing your current focus, how long you've been active, a rich tab list with priority colors and time heatmaps, and Projects layered above Chrome's native tab groups.

MISSION CONTROL NEW TAB
Your New Tab page becomes a dashboard: quick-launch your top sites with your current intent attached, restore a previous session with "Return to Flow," and manage tabs and stats at a glance.

TIME & WORK SHIFTS
Time tracking is built into the browser, not bolted on as a separate app. Tabatha tracks active time per context, auto-pauses when you step away, and organizes your day into work shifts you can review.

TAB LOCKING
Hard-lock critical tabs against accidental closing, or URL-lock a tab to a single site so stray navigations open in a new tab instead of losing your place.

FOCUS TOOLS
Focus timers, break reminders, nudges back to task, and a step-away mode for when you need to pause.

CLOUD SYNC
Sign in to sync your contexts, focus history, and settings across your devices — your data, tied to your own account.

Tabatha is part of the Flux ecosystem — tools built to bridge the gap between browsing and doing.
```

## 2) Privacy tab

**Single purpose (paste):**

> Tabatha is a single-purpose tool for intentional browsing and attention
> management: it assigns a Context and Intent to each tab, tracks time spent per
> context, and provides focus tools so users browse deliberately instead of
> mindlessly.

**Permission justifications** (matches the real v6.7.47 manifest):

| Permission | Justification |
|---|---|
| tabs | Read tab titles/URLs to assign each tab its Context and Intent and track active time per tab. |
| tabGroups | Keep Tabatha's contexts/projects in sync with Chrome's native tab groups (two-way). |
| storage | Persist the user's contexts, intents, focus sessions, and settings locally. |
| unlimitedStorage | Store extended time-tracking and activity history without hitting the default quota. |
| alarms | Schedule focus timers, break reminders, side-quest countdowns, and data-retention cleanup. |
| notifications | Show focus-timer, return-to-task, and break reminders. |
| webNavigation | Detect a new tab opened without a clicked link (to trigger the Gatekeeper) and enforce URL-lock navigation. |
| downloads | Export the user's own context/activity data (markdown export) to their device. |
| sidePanel | Provide the Sidebar command center in Chrome's side panel. |
| activeTab | Read the current tab to display and update its context/intent. |
| idle | Detect idle to auto-pause time tracking and drive step-away / auto-break behavior. |
| sessions | Restore prior browsing sessions ("Return to Flow") so contexts survive restarts. |
| scripting | Inject the Gatekeeper, BlockGate, and InBar UI overlays into pages. |
| topSites | Populate quick-access shortcuts on the New Tab (Mission Control) home page. |
| identity | Sign the user into their own account for optional cloud sync. |
| Host `<all_urls>` | The content-script overlays (Gatekeeper, BlockGate, InBar) and per-tab context/time tracking must work on whatever site the user visits; Tabatha targets no specific site and does not read page content beyond tab title/URL. |

**Data usage — declare all three, then certify:**
- Web history (tab URLs, for the user's own time/context tracking)
- User activity (active-time and interaction timing)
- Website content (tab titles only, for labeling contexts)
- Certify: not sold, not used for unrelated purposes, not for creditworthiness. Check every certification box.
- Remote code: **No**.

## 3) Distribution tab

- Visibility: **Private** → restricted to the Workspace domain.
  ⚠️ The admin login observed is `mr@gnge.co` (OU "Duck & Shark") — confirm whether
  the private-domain option shows `duckandshark.com` or `gnge.co`, and that it
  matches the domain of the devices being force-installed.
- Distribution: all regions. Then **Save draft → Submit**.

## 4) After publish — Workspace force-install

admin.google.com → Devices → Chrome → Apps & extensions → **Users & browsers** →
OU **Duck & Shark** → yellow **+** → **Add Chrome app or extension by ID** →
`piopncjacohahbkkmockjnpenhdbmmbc` → From the Chrome Web Store → **Force install +
pin** → Save.

- Attempted 2026-07-21 pre-publish: red toast "Failed to add app." (draft not
  resolvable) — expected; re-run after publish. No junk entry was left.
- Existing entry observed: **`jbdkacccpknbiphigeabcdojemnhacjj` — Force install +
  pin** — this is the self-hosted CRX line (the ID derived from the standalone
  signing .pem), not the unpacked dev ID. Left untouched; retire it only after the
  store item is confirmed installing on fleet machines.
