# Preview harness — dev-server chrome.* shim

## Why this exists

Tabatha's own extension pages (`home.html`, `sidebar.html`, `settings.html`,
`popup.html`, `workshifts.html`, `activity.html`) load as
`chrome-extension://<id>/...` URLs when the extension is actually installed.
Our browser-automation tooling (claude-in-chrome) refuses to script or
screenshot any `chrome-extension://` page belonging to a *different*
extension than itself, and also refuses `chrome://extensions` — a
deliberate cross-extension isolation guard, not a bug (see
`docs/audits/2026-07-24-live-extension-e2e.md`, Torren's Round 1 finding).

Since these are ordinary Vite multi-page entries under the hood, this
harness serves them over plain `http://localhost:5173`, which automation
tooling *can* reach, with a `window.chrome` shim standing in for the real
extension APIs.

## Usage

```
npm run dev:harness
```

This runs `vite --config vite.harness.config.js` (a sibling of the real
`vite.config.js`, never used by `npm run dev` or `npm run build`). Visit:

- `http://localhost:5173/home.html`
- `http://localhost:5173/sidebar.html`
- `http://localhost:5173/settings.html`
- `http://localhost:5173/popup.html`
- `http://localhost:5173/workshifts.html`
- `http://localhost:5173/activity.html`

Add `?companion=on` to any URL to flip the fixture desktop-companion state
to "connected, with recent sessions" (default is disconnected/no-sessions,
which is the harder empty-state case — see `fixtures.js`).

Console line `[preview-harness] chrome.* shim active — this is fixture
data, not real product data` confirms the shim loaded before the page's
own module executed.

## ⚠️ CRITICAL — do not run this against a browser that has the real
## Tabatha extension installed

Tabatha's content scripts (`gatekeeper.js`, `blockgate.js`, `inbar.js`)
declare `matches: <all_urls>` in `public/manifest.json`. If the browser
driving your automation tool has the **real, live** Tabatha extension
installed and signed in, those content scripts will inject into your
`localhost:5173` harness pages too — on top of the harness's own React
render — and you will be looking at (and, if you click, interacting
with) the **real user's live gatekeeper overlay with real account data**,
not a test fixture.

This actually happened during the 2026-07-24 Wren harness session: a
"Why are you here?" modal rendered on top of `home.html`, showing real
focus labels ("TGC pricing", "TGC meeting 2 prep") that do not exist
anywhere in this harness's fixtures — it was the real `gatekeeper.js`
content script, injected by the real installed extension, into the
harness's own dev page. Two throwaway localhost tabs had that real gate
dismissed via clicks intended for the fixture harness before this was
noticed. See `docs/audits/2026-07-24-live-extension-e2e.md`, "Round 2"
section, for the full incident writeup.

**Before using this harness against any real Chrome profile:** confirm
the profile does NOT have Tabatha installed, or use a profile/window
where it's disabled, or (safest) run the harness only against a
purpose-built clean Chromium profile with no extensions. Do not assume a
`localhost` URL is a safe sandbox just because it's not a Tabatha domain
— content-script matching does not care.

## What this harness CAN prove

- Component structure and layout render correctly given plausible data
  shapes (grid columns, breakpoints, spacing, wrapping behavior).
- Empty-state / conditional-render logic (e.g. "no companion sessions yet"
  branches) given a fixture that deliberately hits that branch.
- Client-side pure-logic behavior that operates on `chrome.storage`-shaped
  data once loaded — grouping, filtering, sorting, dedup (e.g.
  `src/utils/deviceGrouping.js` behavior against the intentionally
  duplicate-ish `FIXTURE_DEVICE_ROWS`).
- Whether a given settings section/page throws a console error on mount
  with representative-shaped fixture data.

## What this harness CANNOT prove

- Real chrome.storage persistence semantics (quota behavior, storage
  area event ordering under real Chrome, `chrome.storage.sync` propagation
  across devices).
- Real background-service business logic — every `chrome.runtime.sendMessage`
  response here is a **canned, hand-written stub** (see `RESPONDERS` in
  `chromeShim.js`), not the actual service code in
  `src/background/services/*.js`. A responder returning `{ok:true}` proves
  the UI *handles* that shape; it proves nothing about whether the real
  service ever produces that shape correctly.
- Real Supabase round-trips. The page's real `supabase-js` client
  (`src/services/supabaseClient.js`) is NOT mocked — it's the real client,
  making real (anonymous, unauthenticated) network calls to the real
  Supabase project. Expect real `console.error`s from failed
  profile/org/team lookups for the fixture's fake user id; these are a
  harness artifact, not evidence of a product bug. This harness does not
  attempt to fully sandbox `supabase-js` — doing so would need a much more
  invasive network-layer mock.
- MV3 service-worker lifecycle behavior (wake/sleep, `chrome.alarms`
  actually firing, message delivery to a suspended worker).
- Anything timing-sensitive to the real extension's message-passing pipe
  — this shim's `sendMessage` responds via `setTimeout(fn, 0)`, which is
  not the same latency profile as a real cross-context message.
- Content-script surfaces (`gatekeeper.js`, `blockgate.js`, `inbar.js`)
  themselves — those only run as real content scripts in a real installed
  extension; this harness only serves the four/six top-level HTML pages.

Treat every "PASS" produced against this harness as **"renders correctly
given plausible fixture data,"** never **"works end-to-end in the real
extension."**

## Files

- `fixtures.js` — canned data (focuses, tasks, device rows including
  duplicates/stale/revoked, one org member, clock session, companion
  sessions in both empty and populated variants, settings blob).
- `chromeShim.js` — the `window.chrome` shim itself (storage.local/sync +
  both `onChanged` registries, runtime.sendMessage with a `RESPONDERS` map,
  tabs, identity, alarms, action). Exposes `window.__harness` for ad-hoc
  console poking (`__harness.setKeys({tasks: []})`).
- `../../vite.harness.config.js` (repo root) — the dev-only Vite config
  that injects the shim `<script>` tag before each page's real entry
  module via `transformIndexHtml`.

## Known fixture gotcha (fixed, kept as a comment for the next person)

`FIXTURE_CLOCK_SESSION.breaks[]` entries must use `{start, end}` field
names (ISO strings), matching
`src/background/services/clockService.js:347-350` and the consumer at
`src/home/index.jsx:1834`. An earlier draft used `{startedAt, endedAt}`,
which silently produced `new Date(undefined)` → `NaN` → a `NaN:NaN:NaN`
clock readout. That was a fixture bug, not a product bug — always check
the actual field names a component destructures before writing a fixture
for it; a plausible-looking shape that's subtly wrong will manufacture
false-positive "defects."
