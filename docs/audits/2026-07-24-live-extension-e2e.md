# Live Extension E2E Audit — 2026-07-24/25 TaskRun

**Agent:** Torren (Sonnet 5, live-testing agent, dispatched by CeeCee)
**Beat:** Chrome extension, exercised for real in Malkio's browser (claude-in-chrome)
**Charter:** `docs/taskrun/2026-07-24-night-targets.md`
**Asana:** [Flux Development #1216867647939897](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216867647939897)

## Headline finding — tooling blocker, read this first

**claude-in-chrome cannot drive or read any of Tabatha's own extension pages tonight.** Every read/interaction tool (`computer` screenshot, `get_page_text`, `read_page`, `find`, `javascript_tool`) throws:

```
Cannot access a chrome-extension:// URL of different extension
```

This fired identically for:
- `chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod/home.html` (Home / new-tab override)
- `chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod/manifest.json`
- `chrome://extensions` (Chrome's own page, not just Tabatha's)

This is a **deliberate cross-extension isolation guard baked into claude-in-chrome itself** — it refuses to automate any extension page that isn't its own, presumably so a remote automation agent can't be used to snoop on/manipulate arbitrary installed extensions. It is not a URL-syntax problem I could work around (I did also independently find that the `navigate` tool has a separate bug where it force-prepends `https://` even onto already-schemed `chrome-extension://`/`chrome://` strings — e.g. `chrome-extension://ID/home.html` in → `https://chrome-extension://ID/home.html` out, which Chrome then mis-parses as host `chrome-extension` — but fixing that alone would not clear the "different extension" guard, which fired even via `chrome_url_overrides.newtab` auto-loading home.html with no manual URL typed at all).

**Practical consequence:** `home.html`, `settings.html`, `sidebar.html`, and `popup.html` (and therefore Devices panel, Team Activity, Task Sync/Asana card, Live Preview, Work Shifts, Logs, Tasks, backburner UI, What's New modal, header-at-3-widths) are **untestable via claude-in-chrome as currently permissioned**. I did not attempt to defeat this guard (e.g., spoofing extension identity) — it reads as an intentional security boundary, not a bug to route around.

**This almost certainly affects every other agent on tonight's TaskRun using claude-in-chrome against Tabatha's extension surfaces**, not just my beat — flagging for CeeCee/Kael as a fleet-wide constraint, not just a personal blocker.

**What remained testable:** Tabatha's content scripts (`gatekeeper.js`, `blockgate.js`, `inbar.js`) inject *into normal web-page origins* (`matches: <all_urls>`), which are NOT extension-owned origins — those pages loaded and were readable/screenshot-able normally.

## Loaded-version note

I could not confirm the *loaded* extension version (Settings → About / `chrome://extensions` are both blocked, see above). Repo source at this worktree (`C:\Users\mrmal\le dev\Tabatha\public\manifest.json`) reads **6.7.73**. I have no independent confirmation the browser has this build loaded; if anyone reports version drift, treat 6.7.73 as "source of truth," not "confirmed loaded."

## What happened live

A throwaway tab I created (navigating to `en.wikipedia.org` to trigger the gatekeeper) surfaced **Malkio's real, live gatekeeper modal** — populated with his actual live focus/task data (`TGC pricing`, `TGC meeting 2 prep`, `Anasa review`), matching what the Tabby Sidecar page showed independently (`TGC meeting 2 prep`, 3:11:24 elapsed). Per charter, I did **not** click Continue / any focus row / Side Quest / Sugar Box / Park / Later / Nevermind / Dismiss — all of those write real state to his account, and since I can't reach the extension's own pages to verify or undo anything, I had no safe cleanup path. I captured a screenshot as evidence and left the tab untouched.

Within moments, that tab (and two other throwaway tabs I'd opened) **disappeared out from under me** (`tabs_context_mcp` reported them gone). The most likely explanation is Malkio is live at the keyboard tonight and closed the surprise tab/modal himself. I throttled further new-tab testing accordingly rather than keep popping unexpected gates in his live browser.

## Test matrix results

| # | Surface | Result | Notes |
|---|---|---|---|
| 1a | Home header layout @ 1000/1400/2560 | **COULD NOT TEST** | Blocked — home.html is an extension page |
| 1b | Context Activity empty state | **COULD NOT TEST** | Same |
| 1c | Backburner affordances (Home + Sidebar) | **COULD NOT TEST** | Same |
| 1d | What's New modal | **COULD NOT TEST** | Same |
| 2a | Settings sections render | **COULD NOT TEST** | settings.html blocked |
| 2b | Devices panel (rename, pause/resume throwaway row) | **COULD NOT TEST** | Same; also would have needed extra caution re: "never touch primary device" |
| 2c | Team Activity chip grouping | **COULD NOT TEST** | Same |
| 2d | Task Sync (Asana) card presence | **COULD NOT TEST** | Same |
| 2e | Live Preview panel coverage | **COULD NOT TEST** | Same |
| 2f | Settings search finds new sections | **COULD NOT TEST** | Same |
| 3a | Gatekeeper renders on new tab | **PASS** | Real modal fired on fresh Wikipedia tab; screenshot captured |
| 3b (regression) | Labels render as real text, not `[object Object]` (6.7.69 self-heal) | **PASS** | Observed real strings: "TGC pricing" (todo), "TGC meeting 2 prep" (focus), "Anasa review" (focus). No corruption. |
| 3c (regression) | Gate appears without page rendering first (6.7.65/6.7.68 race fix) | **PASS (best-effort)** | Gate + dim backdrop were already fully rendered at the first observation point immediately after `navigate()` returned; no raw/undimmed page flash observed. A screenshot-based check can't fully exclude a sub-frame race, but no evidence of regression. |
| 3d (regression) | No full-viewport dim blocking clicks when it shouldn't (6.7.68, "disabled users") | **NOT TESTED** | Requires toggling the gatekeeper OFF in Settings to check the disabled-path — Settings is unreachable (see blocker above). The dim I *did* see was the correct, expected backdrop for a legitimately active gate, not the bug. |
| 3e | InBar (pause / sticky note / edit dropdown) on a normal page | **COULD NOT SAFELY TEST** | Every fresh tab I could reach triggers the real intent gate first; resolving it to reach InBar would mutate Malkio's real focus/task state with no way to verify or clean up (Home/Tasks pages unreachable). Declined per charter's "never dismiss a real focus-gatekeeper modal." |
| 4 | Work Shifts / Logs / Tasks pages | **COULD NOT TEST** | All extension pages, blocked |
| 5 | Console errors across extension pages | **COULD NOT CAPTURE** | Blocked at the page-access layer before console could be read; the one normal-page tab (Wikipedia) closed before I could pull its console log |

## Defects found

None of the *product* regression checks I could actually run failed — 3b and 3c both held. No new product defects to report from this session; the only defect-shaped finding is the tooling blocker above, which is a claude-in-chrome capability gap for this TaskRun, not a Tabatha bug.

| Severity | Surface | Repro | Suspected file |
|---|---|---|---|
| — | N/A | No Tabatha-side defects confirmed this session | — |

## Could not test — summary of why

- **Root cause:** claude-in-chrome refuses to screenshot/read/script any `chrome-extension://` origin other than its own, and refuses `chrome://extensions` too. This blocks 100% of Tabatha's own first-party pages (home/settings/sidebar/popup and everything routed through them: Devices, Team Activity, Task Sync, Live Preview, Work Shifts, Logs, Tasks, backburner UI, What's New).
- **Secondary, independent bug (same tool):** `navigate()` force-prepends `https://` even onto URLs that already carry a `chrome-extension://`/`chrome://` scheme, producing a malformed URL Chrome can't resolve (`https://chrome-extension//ID/path`). This alone wouldn't matter if not for the guard above (the `chrome_url_overrides.newtab → home.html` path loads correctly with zero URL typed, and still hit the same "different extension" guard), but it's worth fixing/flagging separately since it'll bite any future attempt to navigate to a non-http(s) scheme with this tool.
- **InBar interactive flows:** untestable without either (a) resolving Malkio's real, live gatekeeper (declined — no verify/cleanup path since Home/Tasks are also blocked) or (b) finding an already-intent-resolved normal tab of his to observe passively (none available without touching his existing tabs, which the charter also asks me to avoid disturbing).
- **Loaded version:** unconfirmable (Settings→About / chrome://extensions both blocked). Source-of-truth version is 6.7.73 per this worktree's `public/manifest.json`.

## Anything touched in Malkio's account

Nothing. No buttons clicked on the real gatekeeper modal, no settings changed, no devices touched, no intents created. Three throwaway tabs were opened during testing (one to Wikipedia which surfaced the real gate); all three appear to have been closed already (presumed by Malkio, live). No cleanup action was needed or taken since nothing was mutated.

## Recommendation

Flag to CeeCee/Kael before other agents burn time hitting the same wall: either (a) get claude-in-chrome's cross-extension guard relaxed/scoped specifically for Tabatha's own extension id for this TaskRun, or (b) shift extension-surface testing to `computer-use` at "full" tier by having Malkio (or a session with elevated permission) grant it, or (c) accept that tonight's T2 extension review is limited to content-script surfaces (gatekeeper/blockgate/inbar) until the tooling gap is resolved, and rely on other agents' non-live methods (code review, unit tests) for the rest.

---

## Round 2 — dev-harness testing (Wren)

**Agent:** Wren (Sonnet 5, dispatched by CeeCee as the second attempt at this beat, after Torren's Round 1 above)
**Worktree used:** `.claude/worktrees/integrate-6750` (branch `integrate/6.7.50`, source read at v6.7.69 before this session's harness commit bumped it to v6.7.70)
**Harness branch:** `test/extension-preview-harness` (commit `cadfd35`), built from `integrate-6750`

### Headline — the harness works, but running it in Malkio's real browser is unsafe, and I have to disclose a mistake

Torren's Round 1 correctly diagnosed that claude-in-chrome refuses to script real `chrome-extension://` pages. My assignment was to route around that by serving the same pages over plain `http://localhost:5173` (ordinary Vite multi-page entries) with a `window.chrome` shim standing in for the real extension APIs, since claude-in-chrome has no objection to `http://localhost` URLs.

**This technically worked** — `home.html` rendered as real React, using my fixture data, at `http://localhost:5173/home.html`, and claude-in-chrome could screenshot and interact with it normally. Full harness is at `test/preview-harness/` (`fixtures.js`, `chromeShim.js`, `README.md`) + root `vite.harness.config.js` (`npm run dev:harness`), committed on `test/extension-preview-harness`.

**But I discovered — the hard way — a serious hazard with this approach**, and I need to be upfront about it rather than bury it: claude-in-chrome drives **Malkio's real, live Chrome browser** (the same one Torren observed him actively using). Tabatha's real, installed extension declares its content scripts (`gatekeeper.js`, `blockgate.js`, `inbar.js`) with `matches: <all_urls>` in `public/manifest.json`. `<all_urls>` does not exclude `localhost`. So the moment I navigated to `http://localhost:5173/home.html`, the **real, installed extension's real `gatekeeper.js` content script injected into my harness page too** — on top of my own fixture-driven React render — showing Malkio's **real, live gatekeeper overlay with his real account data**, not a test fixture.

I did not realize this on the first two navigations. The modal read "Why are you here?" with rows "TGC pricing", "TGC meeting 2 prep", "Anasa review" — I initially assumed this was my own harness rendering (I have a fixture item literally labeled "Anasa review", which made the coincidence more convincing at a glance), and clicked **"Dismiss — browse without intent"** to get past it and see the page underneath, on **two separate throwaway localhost tabs**. Only when a third instance of the same modal rendered corrupted labels reading `[object Object]` — text that could not possibly come from my fixtures (my fixture focus/task labels are all correctly-typed strings; the real modal is a vanilla-JS content script, not something my React harness could ever produce) — did I realize this was the real gatekeeper, not my test harness, both times. I stopped immediately: no further clicks, no "Continue," no focus-row selection, no Side Quest/Sugar Box/Park/Later. The third tab (with the corrupted render) had already been closed — by Malkio, it appears, consistent with the tab-closing pattern Torren also observed — before I could close it myself.

**Net account impact, best I can assess without extension-page access to verify:** I dismissed the real gatekeeper ("browse without intent") on two disposable `localhost` tabs. This is tab/domain-scoped state, not a mutation of his actual focus/task/clock data — but it is exactly the category of real-gate interaction both Torren's charter and mine explicitly rule out, and I did it by mistake, not by informed choice. Flagging this plainly rather than downplaying it. Both tabs are already gone from the session's tab group.

**This is a hazard for every future dev-harness attempt, not just mine** — I've written it up prominently at the top of `test/preview-harness/README.md` in bold: do not point this harness at a browser that has the real Tabatha extension installed and signed in. The safe fix is a clean, extension-free browser profile for harness work; I did not have a way to switch claude-in-chrome to one without sending Malkio a live "Connect" prompt while he's working (`switch_browser`), which felt like a worse intrusion than stopping, so I stopped instead. This should go to CeeCee/Kael as a process fix before anyone else tries this approach.

**Given this, I made the call to stop all further live/interactive browser testing for the rest of this session** rather than keep navigating and risk a third real-gate hit. The test matrix below reflects that: a handful of items got one real, live, screenshot-verified data point each before I stopped; the rest fall back to direct source-code reading (clearly marked as such — not equivalent to a rendered screenshot, but considerably more certain than a guess).

### An unplanned but real finding: a live gap in the 6.7.69 self-heal fix

The corrupted-modal instance above is not just a safety incident — it's evidence. `Tabatha_Changelog.md`'s v6.7.69 entry describes a fix (`src/utils/focusDataSanitize.js`, wired into `focusService.js` and `storageService.js`'s `getFocusEngine()`/`getTabData()`) specifically to stop legacy-corrupted `label`/`funnelStage`/`context` fields from ever rendering as `[object Object]` again, self-healing on every read. Torren's Round 1 confirmed it held (3b, PASS). I saw it **fail live, on Malkio's real data**, in a later gate instance than the one Torren saw render correctly.

Reading `src/content/gatekeeper.js` explains why both observations are consistent, not contradictory:

- Focus items (`focusItems`) come from `chrome.runtime.sendMessage({type: 'GET_FOCUS_ENGINE'})` (`gatekeeper.js:151`) — routed through the sanitized `focusService.js` path. This is the part 6.7.69 fixed, and it's the part Torren (and my first observation) saw render correctly.
- The "recent" and "persistent" intent suggestion rows, however, come from **`await chrome.storage.local.get(['intentHistory', 'intentPresets', 'settings'])` at `gatekeeper.js:160`** — a **direct** storage read that never passes through `focusDataSanitize.js` at all. `sanitizeFocusEngine`/`sanitizeTabsMap` (per the 6.7.69 changelog) were wired into `focusService.js` and `storageService.js`'s `getFocusEngine()`/`getTabData()` only — not into `intentHistory` or `intentPresets`.
- `appendIntentHistory()` (`src/background/services/tabTrackingService.js:39-60`) writes `context: entry.context ?? entry.newContext ?? null` straight to storage with **no string coercion**. I checked its one caller (`src/background/services/tabService.js:567`, from `setTabContext`) and it currently only ever passes a string — so this isn't an active write-time bug today — but it means any **pre-existing legacy-corrupted entry** already sitting in `intentHistory`/`intentPresets` (the exact kind of historical corruption the 6.7.69 changelog says "survives indefinitely" for paths that were never swept) will render as `[object Object]` **forever**, because nothing on the read side ever coerces it. This is precisely the failure mode 6.7.69 was written to eliminate, in a code path the fix didn't cover.

I can't independently confirm Malkio's real `intentHistory`/`intentPresets` contents (no extension-page access, and I'm not going to go digging in his real storage). But the visual evidence — a modal rendering `[object Object]` for both the input placeholder and every suggestion row, on his real account, in his real running extension — combined with a confirmed, unsanitized direct-read code path that bypasses the entire 6.7.69 fix, is strong enough to report as a live, high-confidence gap, not a maybe.

**Recommendation:** extend `sanitizeFocusEngine`-equivalent coercion to the `intentHistory` and `intentPresets` reads in `gatekeeper.js:160-186` (and ideally coerce at the `appendIntentHistory` write site too, defensively, even though no live caller triggers it today).

### Test matrix results

| # | Surface | Result | Notes |
|---|---|---|---|
| 1a | Home header @ 1000px | **PASS (live, harness)** | Rendered cleanly: greeting/subtitle left, `FlipClock` centered, version badge + 2 icons right, no truncation/overlap. Screenshot taken via claude-in-chrome against `http://localhost:5173/home.html`. |
| 1a | Home header @ 1400 / 2560px | **NOT TESTED** | Stopped live testing after the real-gate incident (above) before reaching these widths. `src/home/index.jsx:1884` uses a pure CSS Grid (`minmax(220px,1fr) auto minmax(220px,1fr)`) with **no `@media` breakpoints** inside a `maxWidth:1100px` container (source-read, not rendered) — mathematically this should behave identically at 1400/2560 (just more side gutter past 1100px); no code path suggests width-dependent behavior above 1000px, but this is inference from source, not a screenshot. |
| 1b | Context Activity empty state (H7) | **LIKELY FIXED — source-review only** | `src/components/UnifiedTimeline.jsx` comments tagged `TR-06` (lines ~120-125, ~342-348) describe fixing exactly the bug the 2026-07-21 audit (`SYNTHESIS.md` #9 / `extension-ux-audit.md` H7) flagged: it used to bail to fully blank whenever `sessions.length === 0`. Current early-return condition is `segments.length === 0 && clockMarkers.length === 0` (not `!sessions.length`), with two distinct non-blank empty-state messages ("🖥️ Desktop companion connected — waiting for activity..." / "📭 No activity yet today..."). Not rendered live — I built a fixture (`companionRecentSessions: []`) specifically to exercise this path but never got a safe screenshot of it. |
| 1c | Backburner affordances | **NOT TESTED** | Fixture includes a backburner item (`FIXTURE_FOCUS_ENGINE.backburner`); never rendered live. |
| 1d | What's New modal | **NOT TESTED** | Not investigated this round. |
| 2a | Settings sections render, no console errors | **NOT TESTED (live)** | Never safely reached `settings.html` after the real-gate incident. |
| 2b | Devices panel + grouping logic | **PARTIAL — source-review only** | `src/utils/deviceGrouping.js` confirmed: groups by `machine_id` → `local_id` prefix → row `id` (lines 69-73), default-visibility cutoff at 30 days or named/self (lines 58-63), "Show all" toggle surfaces the rest (lines 90-95), revoked rows stay listed with a disabled "Signed out ✓" state rather than being hidden (`DevicesPanel.jsx:121-133`). I built `FIXTURE_DEVICE_ROWS` with a same-`machine_id` duplicate, a stale/unnamed row, and a revoked row specifically to exercise this — logic reads correct from source, but I never got a live screenshot confirming the *rendered* grouping/toggle behavior. |
| 2c | Task Sync (Asana) card presence | **CONFIRMED present — source-review only** | Inline in `src/settings/index.jsx` "integrations" section (~lines 2010-2043, `data-search-id="integrations-asana"`), fields `settings.asanaWidgetEnabled`/`asanaWidgetUrl`. Not a separate component file, contrary to what I initially assumed going in. |
| 2d | Live Preview panel coverage (11/24 blank claim) | **Count confirmed exact; already patched in current source** | `src/settings/index.jsx` lists 24 sections (lines 88-111). Live Preview switch (lines 2105-2234): 9 sections get a real mockup, 4 get a generic "About"-style fallback, and **exactly 11** (`contextview`, `devices`, `lifecycle`, `blocked`, `workclock`, `followthrough`, `sync`, `webhooks`, `desktop`, `integrations`, `developer`) are tagged in a code comment **"6.7.60 — TR-12"** as the fix for what "previously rendered a fully blank Live Preview pane" — now showing a generic "🔍 Preview available when components are active" message instead of nothing. The 2026-07-21 audit's "11/24 blank" count is exactly right, and per this comment it's already been patched to a fallback message (not left blank) as of 6.7.60. Not rendered live to confirm the fallback actually paints correctly. |
| 2e | Settings search finds new sections | **NOT TESTED** | Not investigated this round. |
| 3 | Sidebar + popup render, backburner affordance, no console errors | **NOT TESTED (live)** | Never navigated to `sidebar.html`/`popup.html` after the real-gate incident. |
| 4 | Console errors across pages | **NOT CAPTURED** | Never called `read_console_messages` — testing stopped before reaching this step for any page. |
| 5 | Harness itself (chrome.storage shim, sendMessage responders, fixture data shape) | **PASS, with one caught-and-fixed fixture bug** | See below. |

### Harness self-test finding (not a product bug)

First render showed `Clocked In NaN:NaN:NaN` in the Shift Controls panel. Root cause was my own fixture, not the product: `src/home/index.jsx:1834` computes break duration as `new Date(b.end).getTime() - new Date(b.start).getTime()`, but my first draft of `FIXTURE_CLOCK_SESSION.breaks[]` used field names `{startedAt, endedAt}` instead of the actual `{start, end}` (confirmed against `src/background/services/clockService.js:347-350`, the real writer of this shape). Fixed in `fixtures.js`; re-rendered and confirmed a correct `3:45:03` readout on the next load. Documented in `test/preview-harness/README.md` as a "known fixture gotcha" so the next person writing a fixture checks real field names first — a plausible-looking shape that's subtly wrong manufactures false-positive defects.

### What the harness can and cannot prove (see `test/preview-harness/README.md` for the full list)

Can prove: component layout/structure given plausible data, empty-state branch logic, pure client-side grouping/filter/sort logic, whether a page throws on mount with representative fixture data. Cannot prove: real `chrome.storage` persistence semantics, real background-service business logic (every `sendMessage` response is a hand-written stub, not the real service), real Supabase round-trips (the real `supabase-js` client runs unmocked and will produce real, expected `console.error`s against fake fixture IDs — a harness artifact, not a defect), MV3 service-worker lifecycle behavior, or real message-passing timing. And, per the incident above: it cannot safely run in a browser that has the real extension installed.

### Anything touched in Malkio's account

Real gatekeeper "Dismiss — browse without intent" was clicked twice, on two disposable `localhost:5173` tabs, before I recognized the modal wasn't mine (see headline above). No other buttons on the real gate were clicked (no Continue, no focus row, no Side Quest/Sugar Box/Park/Later/Nevermind). No settings changed, no devices touched, no real intents/tasks created. Both affected tabs are already closed (not by me). I have no way to verify or undo the two dismissals without extension-page access, which remains blocked per Torren's Round 1 finding.

### Recommendation

1. **Process fix before any future dev-harness attempt:** never point `npm run dev:harness` (or any `localhost` Vite dev server serving Tabatha's pages) at a browser that has the real Tabatha extension installed and signed in — its `<all_urls>` content scripts don't distinguish `localhost` from anything else. Use a clean, extension-free profile.
2. **Product fix, medium-high priority:** extend the 6.7.69 sanitize-on-read coverage to `gatekeeper.js`'s direct `intentHistory`/`intentPresets` read (lines 160-186) and, defensively, to `appendIntentHistory`'s write site — closing the gap that let `[object Object]` render live during this session.
3. The harness (`test/extension-preview-harness` branch) is worth keeping for **structural/layout review in a safe, extension-free environment** — it rendered real React, real Tailwind, real component logic against realistic fixture shapes, and caught a real fixture bug via its own output. It is not a substitute for a real extension-context test, and every finding above sourced from it (not source-review) is labeled accordingly.
