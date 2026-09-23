# Cross-Cutting Systems Audit — 2026-07-21

**Auditor:** Rook (Sonnet, read-only)
**Scope:** connective tissue between surfaces — docs staleness, auth emails, org-manager visibility, device lifecycle, version/branding drift.
**Repos inspected:** `C:\Users\mrmal\le dev\Tabatha` (main checkout, branch `staging`), `.claude\worktrees\integrate-6750` (extension line, manifest 6.7.53), `.claude\worktrees\tabby-sidecar-mobile-46c612` (Sidecar 0.13.4), plus a scan across ~25 other active worktrees for the docs/site source.
**Method:** direct inspection (git log, grep, live-site fetch, one read-only Supabase Management API GET) plus five parallel research passes whose findings are folded in and credited inline; nothing here is a subagent's unverified claim without at least one piece of file:line or live evidence backing it.

No writes were made anywhere — no Supabase config change, no file edit outside this report, no repo commit.

---

## Area 1 — Docs site staleness

**Where it lives:** `C:\Users\mrmal\le dev\Tabatha\site\docs\*.html` — plain hand-authored static HTML (no framework), part of the broader `site/` folder that also holds `site/show` (component showcase, separately brand-stamped to v6.7.17) and `site/enterprise` (CRX update artifacts). Deployed via root `package.json`:

```
"site:build":  "node scripts/build-privacy.mjs && node scripts/build-search-index.mjs"
"site:deploy": "npm run site:build && npx wrangler@4 pages deploy site --project-name=tabatha"
```

`site:build` only regenerates the privacy page and search index — it does **not** touch content, so nothing about the deploy pipeline itself would catch stale copy.

**The version badge is a hardcoded string, not derived from anything.** Confirmed directly: `site/docs/index.html:60` and `:189` literally contain `<span class="verbadge">v6.7.41</span>` and `brand-faithful to v6.7.41`. `git log --oneline -- site/docs` shows exactly two commits ever touched this path — `51b4fed` (v6.7.40, "new /docs help section") and `2d67623` (v6.7.41, "screensaver guide") — and nothing since, even in `integrate-6750` which is stamped 6.7.53. Live-fetched `tabatha.pondocean.co` confirms the badge renders `v6.7.41` today and the page structure (Getting Started × 6 surfaces, 9 "How do I" categories) is real and reasonably comprehensive in *breadth* — the gap is in *depth/currency* within existing pages, not missing pages.

**Coverage table (what shipped since 6.7.41 vs. what the docs say):**

| Shipped feature | Docs coverage | Evidence |
|---|---|---|
| Device management panel in extension Settings (post-lockout, #222, ext ~6.7.50) | **Missing entirely** | Zero hits for "device management" in any `site/docs/*.html`; `pairing-devices.html` only covers watch-code and companion-token pairing |
| Pairing codes minted *from the extension* (ext 6.7.52) | **Missing** | `pairing-devices.html:73` still frames code-minting as Sidecar-only ("Sidecar → Settings → Pair a watch → Get pairing code") |
| Count direction/precision — count-up/down, second vs. rounded-minute (Sidecar 0.13.0) | **Missing** | No "count", "precision", or "direction" language in `timers-extensions-backburner.html` |
| Un-resolve (Sidecar 0.13.0) | **Missing** | No "resolve"/"un-resolve" language in `focus-and-intents.html` or elsewhere |
| Phone-away semantics — 60s heartbeat, away-vs-gone 3-way split (Sidecar 0.13.0) | **Stale, describes an older mechanism** | `phone-focus-mode.html` only documents the earlier slow-fade-vs-immediate toggle (~6.7.34 era); no "heartbeat"/"gone" language |
| Invites (org/team invite flow, Demo/Personal/Team remodel, Sidecar 0.9-0.11) | **Missing entirely** | Zero mentions of "invite" anywhere in `site/docs/` |
| TV sign-in ("sign in with a code") | **Missing as an auth mechanism** | `getting-started-context-view.html` mentions "TV" only as a cast target, not as a sign-in flow |
| PWA orientation fix (0.13.2, unblocks landscape auto-rotate) | **Not called out** (minor — bugfix, not really doc-worthy alone) | Generic landscape language exists but no note that installs were previously portrait-locked |

**Freshness-check mechanism:** none exists. No `.github/workflows` in the repo at all. `docs/OPERATIONS.md` (added at Sidecar 0.13.0) already self-admits two related gaps: `site:deploy` lacks `--branch=main` (preview-deploy risk) and "sidecar version hand-synced in 2 files (drift risk)." The team already knows this class of problem exists; nothing has closed it.

**Fix sketch:** (1) drive the verbadge from a single source (root `manifest.json` version, same pattern as `version:sync`) at build time instead of a hand-edited span — cheap, kills the silent-drift failure mode permanently. (2) Add a `docs:check` script that greps `site/docs/*.html` for a list of "must-mention" feature keywords maintained alongside `Tabatha_Changelog.md` entries, run in `prebuild` or a lightweight CI step, failing loud when a shipped feature has no doc mention — this is the "could a check exist" question, and yes, cheaply. (3) Content debt itself (8 items above) is a content-writing task, not an infra task — recommend a single pass rewriting `pairing-devices.html`, `phone-focus-mode.html`, `timers-extensions-backburner.html`, `focus-and-intents.html`, plus new sections for invites and TV sign-in.

---

## Area 2 — Auth emails

**Current state, read via GET `https://api.supabase.com/v1/projects/mtdgoahskcibjbhfvofx/config/auth` (no writes made):**

- `site_url` = `http://127.0.0.1:3000` — a localhost dev placeholder, not a Tabatha domain. This is likely why nothing looks branded: several email template variables (`{{ .SiteURL }}`) resolve to a dev URL that happens to still work because every actual redirect is passed explicitly (see below), so nobody noticed.
- `uri_allow_list` includes `https://127.0.0.1:3000`, two distinct `*.chromiumapp.org` extension IDs (`hoknmoclnhccpgofpdihmiadmnmejjod` and `piopncjacohahbkkmockjnpenhdbmmbc` — worth checking whether one is stale/orphaned from an old extension key), and `https://tabatha.pondocean.co/sidecar` (+ trailing-slash and wildcard variants).
- **SMTP: not configured.** `smtp_host`, `smtp_port`, `smtp_admin_email`, `smtp_sender_name`, `smtp_user`, `smtp_pass` are all `null`. This is the direct, sole root cause of the "email comes from supabase.co" symptom — with no custom SMTP, Supabase's shared mailer sends on its own domain/branding regardless of anything else.
- **Mailer templates:** all stock defaults. Subjects are "Confirm Your Signup," "Your Magic Link," "You have been invited," "Reset Your Password" — no Tabatha copy anywhere. The `mailer_subjects_custom_contents`/`mailer_templates_custom_contents` flags read `true`, but that only means the custom slots are addressable, not that anything has been written into them — content is still unmodified boilerplate.
- Other fields of note: `mailer_autoconfirm: true`, `jwt_exp` 3600s, refresh-token rotation on. `external_email_enabled: true`; every named OAuth provider flag including `external_google_enabled` reads `false` at this project-config layer even though the app does live Google sign-in via `signInWithOAuth({provider:'google'})` with its own client id/secret — plausibly a stale/inert flag at this API layer rather than proof Google login is broken; flagging for a live test, not asserting a break.

**Redirect-flow inventory (does anything rely on the bare `site_url`?):**

| Surface | Call | Redirect behavior |
|---|---|---|
| Tabby Sidecar (`sidecar/src/context/AuthContext.tsx`) | `signInWithOAuth({provider:'google', options:{redirectTo: redirectUrl()}})` | Explicit — `window.location.origin + pathname` on web, `sidecar://auth` on native |
| Tabby Sidecar | `signInWithOtp({email, options:{emailRedirectTo: redirectUrl()}})` | Explicit, same resolver |
| Extension (`src/services/supabaseClient.js`) | `signInWithChromeIdentity()` via `chrome.identity.launchWebAuthFlow` | Explicit — `chrome.identity.getRedirectURL()`, a `*.chromiumapp.org` URL, `skipBrowserRedirect:true` |
| Extension | `signInWithMagicLink()` | Explicit — `emailRedirectTo: chrome.identity.getRedirectURL()` |
| Extension | `linkChromeIdentity()` | Same explicit pattern |

**Conclusion: every sign-in call on both surfaces passes an explicit redirect. Nothing falls back to bare `site_url` today.** Changing `site_url` to a real Tabatha domain is therefore **low-risk** to existing redirect behavior — its only live role right now is the `{{ .SiteURL }}` template variable (cosmetic in unbranded emails) and a safety-net default for any future code path that omits an explicit redirect. It will **not** by itself fix the branding problem — that requires SMTP + templates.

### Ready-to-execute change plan

1. **The one credential Malkio must supply:** an app password for a Google Workspace sending account on `duckandshark.com` (e.g. `tabatha@duckandshark.com`), generated at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (requires 2FA already enabled on that account). Nothing else in this plan needs anything from him.
2. **Configure custom SMTP** (Dashboard → Auth → Emails → SMTP Settings, or Management API PATCH once the credential is in hand):
   - Host: `smtp.gmail.com`, Port: `587`, Username: `tabatha@duckandshark.com`, Password: the app password, Sender email: `tabatha@duckandshark.com`, Sender name: `Tabatha`.
3. **Set `site_url`** to `https://tabatha.pondocean.co` (root marketing/docs domain, matching the pattern of the existing `/sidecar` allow-list entry). Add `https://tabatha.pondocean.co/sidecar` explicitly to `uri_allow_list` if not already covered by the wildcard entry (it already is, per the GET above — no action needed there beyond the site_url change).
4. **Rewrite the four mailer templates** (Confirmation, Magic Link, Invite, Recovery) — no vendor names, links to `tabatha.pondocean.co`, e.g.:
   - *Magic Link* — Subject: "Your Tabatha sign-in link". Body: "Tap below to sign in to Tabatha. This link expires in 1 hour and can only be used once. If you didn't request this, ignore this email." + button linking `{{ .ConfirmationURL }}`.
   - *Invite* — Subject: "You've been invited to a Tabatha team". Body: names the inviting org (if the template variable is available) and links to accept.
   - *Confirmation* / *Recovery* — same brand-voice treatment, same no-vendor-name rule.
5. **Verify the two `chromiumapp.org` allow-list entries** — confirm both extension IDs are current (dev + prod, or one stale) before this project is treated as "clean"; not blocking the email fix, but adjacent hygiene.
6. **After changing `site_url`:** since no code path relies on the bare value (§ redirect-flow inventory above), no client code changes are required. Do one live smoke test per surface (Sidecar magic-link, extension Chrome-identity flow) post-change as a confirmation step, not because the audit found a reason to expect breakage.

---

## Area 3 — Org-manager visibility

*(Area investigated by a background research pass; findings independently corroborated below and folded in per the coordinator's condensed relay — credited accordingly.)*

**What exists (real, substantial backend):**

- `supabase/migrations/001_create_tabatha_schema.sql` creates `organizations`/`org_members` and *already* ships one manager-visibility RLS policy at creation (managers/admins can `SELECT` co-org-members' `time_entries`, restricted to work/professional/business realms — personal realm excluded, a fence referenced repeatedly in every later migration).
- `002_add_team_time_tracking.sql` adds `teams`/`team_members` with richer roles, `user_status`, and immutable `time_logs`, with RLS letting team managers see their team's `time_logs`.
- `008_add_batch1_sync_tables.sql` adds `org_id`/`team_id` to `clock_sessions`/`desktop_activity` — but its RLS is **own-profile-only**. No manager-read policy was added here, meaning the tables where "hours" actually live today carry **no manager visibility at the RLS layer** — a regression against the pattern set in 001/002.
- `012_manager_scoping_and_invite_mint.sql` — header literally states "so a Team Activity dashboard works" — grants managers `SELECT` on `browser_profiles`/`browser_profile_status`/`profiles` for their scope.
- `019_owner_read_views.sql` builds `v_owner_clock_daily`, `v_owner_desktop_daily`, `v_owner_intent_recent` — exactly the aggregated-hours views an owner would want — but grants them to **`service_role` only**, with an explicit `REVOKE` from `authenticated`/`anon`. The migration's own comment states an ordinary signed-in user gains no cross-member visibility from it.
- `020`/`026` add self-serve org creation and SECURITY DEFINER helpers (`is_org_wide_admin`, `my_visible_member_profile_ids`) codifying owner/admin = org-wide vs. manager/sub-manager = team-scoped.
- `042-045` are invite-kind and device-management plumbing, not visibility features.

**UI:** a real, wired-in `TeamActivityPanel.jsx` exists in the extension's Settings (`src/settings/index.jsx:1327`, gated correctly by `orgPermissions.js`), present in both main repo and the 6.7.53 line. It shows **live presence only** — current focus label, clock/break state, online/offline chip, invite mint/revoke — realtime-subscribed. It never queries `time_entries`/`time_logs`/`clock_sessions` or the `v_owner_*` views. **Sidecar has no team/org visibility UI at all** — only invite redemption.

**Docs:** feature #191 ("Team Activity Dashboard — Mutual Visibility") is planned/unbuilt. The #221 concept doc (`docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md`) proposes three visibility tiers — Manager-private, Internal/presence-only (default), Public/client-aggregate — with a load-bearing consent rule: per-person time is manager-visible only if work-realm **and** the participant opted in (default off); personal-realm data is never visible; no drift/idle-shaming; nothing auto-published.

**Verdict: partially built, split cleanly down the middle.** The presence slice is genuinely built and wired end-to-end (RLS + UI). The hours slice is **built-then-deliberately-blocked** — migration 019 computed exactly the aggregate views an owner dashboard needs, then fenced them behind `service_role` by explicit design, so nothing in the product can surface them today; Malkio would have to query Supabase directly to see anything. This is not "never built" — the hard part (aggregation logic) already exists — and it is not an oversight either, given 019's own comment; it reads as an intentional pause pending a consent model, which #221 has now specified.

**Proposed minimal honest v1** (respecting the consent-first stance): extend `TeamActivityPanel` — don't build new UI — with one new `SECURITY DEFINER` RPC (e.g. `get_team_hours_summary`) that reuses 019's aggregation logic but scopes access via 026's `my_visible_member_profile_ids()` instead of `service_role`. Default to **aggregate team/org totals only** (no per-person breakdown); unlock per-person detail solely behind a new `profiles.settings.share_hours_with_org` opt-in flag, default off. The personal-realm fence from 001 stays absolute regardless of opt-in. Lives on the existing extension Settings surface, next to the presence panel that already has the right permission gating.

---

## Area 4 — Device lifecycle state machine

**Current `tabatha.browser_profiles` schema, by migration:**

- **001**: `id`, `profile_id`, `browser` (default `chrome`), `profile_name`, `profile_path`, `classification`, `extension_installed`, `last_seen_at`, `created_at`.
- **013**: partial unique index on `(profile_id, browser)` for non-chrome browser values (`desktop_companion`, `mobile_ios`, `mobile_android`, `tabatha_web`).
- **016**: RLS-only fix, re-adding own-row INSERT/UPDATE/DELETE policies that 012 had accidentally dropped.
- **017**: adds `local_id` (text) + `machine_id` (text); a **non-partial** unique index on `(profile_id, local_id)` — this is the upsert conflict target every writer now targets.
- **045**: adds `display_name`, `auth_session_id` (GoTrue session id), `paused` (bool, default false), `revoked_at` (timestamptz), `device_settings` (jsonb); adds the table to the realtime publication.

**Per-writer behavior:**

| Writer | `machine_id` | `local_id` | `revoked_at` | `paused` | Dedup strategy |
|---|---|---|---|---|---|
| Extension `ensureBrowserProfileRow` (`syncService.js:135-241`) | companion's row id, else null | `installIdentity.localId` | **clears unconditionally on every ~15-min sync wake, no guard** | never touched | 3-tier: cached-id UPDATE → adopt-newest-row UPDATE → UPSERT on `(profile_id, local_id)` |
| Sidecar `registerDevice` (`AuthContext.tsx:163-248`) | a random self-generated per-install UUID — **not** a companion reference | `sidecar-${surface}` | clears, gated by an in-memory `registered.current` guard, so once per app launch | never touched | UPSERT on `(profile_id, local_id)` only |
| Desktop Companion proxy (`companionInstallService.js`) | not set (NULL) | not set (NULL) | never read or written | never read or written | SELECT-then-INSERT on `(profile_id, browser='desktop_companion')` via 013's partial index |
| `pair-watch` redeem fn | — | — | — | — | not itself a row writer — mints an auth session; the row gets written afterward by whichever surface's normal writer runs next |
| `device-signout` fn | — | — | sets `revoked_at = now()` + best-effort GoTrue Admin session delete (skipped if `auth_session_id` missing) | — | ownership-checked by row id |

**Concrete inconsistencies, in order of severity:**

1. **Extension TOCTOU resurrect (high).** `syncService.js:141-157` includes `revoked_at: null` in its upsert payload on *every* sync cycle, unguarded. If the admin-side session revoke didn't also succeed (e.g. missing `auth_session_id`), the very next background sync silently un-revokes the row with no re-authentication required. This is the class of bug the recent 6.7.53/0.13.4 fixes ("reclaim revoked row on sign-in") were aimed at, per both worktrees' latest commits dated today (2026-07-21) — worth confirming those specific commits actually close this path rather than only fixing the sign-in-time case, since the sync-cycle path described here is a separate trigger from sign-in.
2. **Same bug, narrower window, Sidecar (medium).** The `registered.current` guard limits the resurrect to once per app launch — but relaunching the app right after a surprise sign-out (a very plausible sequence) re-triggers it.
3. **Companion writer has zero lifecycle awareness (medium).** It never reads or writes `revoked_at`/`paused` — a revoked or paused companion device just keeps heartbeating forever and can't self-service reclaim either, unlike the other two writers.
4. **`machine_id` is semantically overloaded (medium).** It means "companion-pairing FK" for the extension writer and "arbitrary self-generated install UUID" for Sidecar — these are not comparable values, despite sharing a column and (per migration 017's doc comment) an intended single meaning.
5. **Grouping logic duplicated, not shared (low-medium).** `src/utils/deviceGrouping.js` (extension) and an inline reimplementation inside `DevicesCard.tsx` (Sidecar) can silently drift from each other.
6. **RLS has no state-aware `WITH CHECK`(high).** Any client holding a valid session for a profile can `UPDATE` a sibling row's `revoked_at`/`paused` directly — this is the structural enabler behind #1/#2; a policy-layer fix (require the caller's own `auth_session_id` to match, or forbid clearing `revoked_at` from a non-admin write path) would close the resurrect bug at the root instead of patching each writer separately.
7. **Pause is deliberately soft/self-resumable** (post-lockout fix, feature #222) — by design, not a bug — unlike `revoked_at`, which is meant to be hard/terminal but currently isn't, per #6.
8. `grouped-dupe` is a pure UI-rendering artifact, not a DB state — duplicate rows persist indefinitely today (a ~650-row flood was previously documented in `DevicesCard.tsx:111-122`'s dedup comment).

**Proposed canonical lifecycle:** `fresh` → (`named`, orthogonal, cosmetic) → `active` ⇄ `paused` (soft, self-resumable, no re-auth needed) → `revoked` (via `device-signout`, hard/terminal) → sign-out honor-logic returns the device to `fresh` on next legitimate re-registration. The bug is that a second, unintended path exists: any writer's next unguarded sync silently returns `revoked` → `active` with no re-auth at all. Closing #6 (state-aware RLS) is the single highest-leverage fix — it protects all four writers at once instead of requiring four separate guard-clause patches that can each drift again later.

---

## Area 5 — Version/branding drift sweep

**Version parity — high severity, multiple live "current" numbers simultaneously:**

| Location | Version | Note |
|---|---|---|
| Main checkout (`staging`), `public/manifest.json` | **6.7.47** | HEAD commit message says "6.7.52 → 6.7.53" — the working tree is behind its own last commit's stated version |
| `origin/staging` (GitHub) | **6.7.46** | Last pushed commit; local `staging` is ahead of GitHub |
| `integrate-6750` worktree | **6.7.53** | Matches the task brief's "current" extension version |
| `Tabatha_Changelog.md` top entry (main checkout) | **v6.5.0** (dated 2026-07-01) | Stale relative to every manifest above |
| Tabby Sidecar (`sidecar/app.json`) | **0.13.4** | Matches brief |
| Sidecar root `package.json` (worktree root) | 6.5.0 | This is the *extension's* monorepo package.json living at the worktree root, not a sidecar artifact — cosmetic confusion, not a real drift, but worth not mistaking for a signal |
| `sidecar/package.json` | 1.0.0 | Expo template default, not meaningful |

Same class of problem as the docs verbadge in Area 1: no single reconciled source of truth, several numbers live at once.

**Logo/icon drift ("Split-Tab T" rollout) — high severity, confirmed by diff:**

- Changelog record: `integrate-6750/Tabatha_Changelog.md:11`, "New mark ('Split-Tab T')… Replaces `icon-1024.png`, `icon128.png`, `icon48.png`, `icon32.png`, `icon16.png`, `icon.svg`" (2026-07-21), built in worktree `logo-rollout`.
- **Main checkout (staging) still has the OLD mark** — confirmed by direct diff: main's `public/icons/icon.svg` is the old dark-plate/cyan-ring/eye-in-T design; `integrate-6750`'s is the new two-tab-card crossbar mark. File sizes confirm too (main `icon-1024.png` 358KB old vs. `integrate-6750`'s 78KB new). Since staging is the presumed Chrome Web Store production line, **the store-facing icon is stale until this merges**.
- **Sidecar PWA icons are stale** (previously known, now confirmed with git evidence): `sidecar/public/icons/icon-192.png`/`icon-512.png` are byte-identical and unchanged since the `v0.1.0` commit (July 17), predating the July 21 logo rollout entirely. `sidecar/public/manifest.webmanifest` was touched July 21 for an unrelated orientation fix but still points at the same stale icon files.
- **Marketing-site favicon**: could not confidently locate the live tabatha.pondocean.co root site's actual deployed favicon source in this pass — the nearest candidate (`.claude/worktrees/site/public/favicon.svg`) is an unrelated purple gradient blob that matches neither the old nor new mark, and that worktree looks stale/unrelated ("Focus Engine, InPop v2..." as its last commit). Given Area 1 established the real docs/site source lives at `C:\Users\mrmal\le dev\Tabatha\site\` (main repo), the favicon to check is `site/public/favicon.svg` there, not the `site` worktree — flagging as **unverified, needs a direct look at `site/public/favicon.svg` in main repo** rather than guessing further.

**Vendor-name leakage ("Supabase" in user-facing strings) — already handled correctly, low/none:**

- Extension Settings (`src/settings/index.jsx` ~line 2038) already renders "Cloud Sync" / "Sync focuses, clock sessions, and org data to the cloud." — properly abstracted.
- Every other "Supabase" occurrence across both extension and Sidecar `src/` is a comment, an import name (`Session` from `@supabase/supabase-js`), an internal variable/env-var name, or a client call — none render to a user. **No live leakage found.**

**Other hardcoded-version stamp drift:**

- Extension: all version displays read `chrome.runtime.getManifest().version` dynamically — correct pattern, no risk.
- Sidecar: `sidecar/src/lib/device.ts:26` defines `export const SIDECAR_VERSION = '0.13.4'` as an **independent hardcoded literal**, unlinked to `app.json`. It renders directly to users (`SettingsScreen.tsx:905`, "Tabby Sidecar v{SIDECAR_VERSION}") and is sent in a payload (`SettingsScreen.tsx:350`). Currently in sync by coincidence; there is no build-time sync step tying it to `app.json`, so the next version bump that only touches `app.json` will silently leave this About-screen string stale — **medium severity, latent**.

---

## Findings summary table (severity / class / fix)

| # | Area | Finding | Severity | Class | Fix sketch |
|---|---|---|---|---|---|
| 1 | Docs | 8 shipped features since v6.7.41 undocumented or stale in `site/docs/*.html`; verbadge hardcoded | High | NOW-fix (badge) + content debt | Drive verbadge from manifest version at build; content rewrite pass |
| 2 | Docs | No docs-freshness CI check exists at all | Med | OVERHAUL | Add `docs:check` keyword-vs-changelog script |
| 3 | Auth email | SMTP not configured — root cause of unbranded/Supabase-sender emails | High | NOW-fix | Custom SMTP via Workspace app password (plan above) |
| 4 | Auth email | Mailer templates are 100% stock Supabase copy | High | NOW-fix | Rewrite 4 templates, no vendor names |
| 5 | Auth email | `site_url` is a localhost placeholder | Med | NOW-fix | Set to `https://tabatha.pondocean.co` — verified low-risk, no redirect flow depends on it |
| 6 | Auth email | Two distinct `chromiumapp.org` extension IDs allow-listed | Low | hygiene | Confirm both are current, prune stale one |
| 7 | Auth email | `external_google_enabled=false` at project-config layer despite live Google sign-in code | Low | verify | Live smoke test, don't assume broken |
| 8 | Org visibility | Aggregate-hours views (mig 019) exist but are `service_role`-only by explicit design — owner has no in-product way to see hours | High | OVERHAUL | New scoped RPC + opt-in flag (plan above) |
| 9 | Org visibility | `clock_sessions`/`desktop_activity` (mig 008) have no manager-read RLS at all, unlike 001/002's pattern | Med | BUG (regression) | Add manager-scoped SELECT policy consistent with 001/002/012 |
| 10 | Org visibility | Sidecar has zero team/org visibility UI | Med | OVERHAUL | Out of scope for v1; extension-only per proposal |
| 11 | Device lifecycle | Extension sync writer clears `revoked_at` unconditionally every ~15min cycle — silent un-revoke | High | BUG | State-aware RLS `WITH CHECK`, root-cause fix across all writers |
| 12 | Device lifecycle | Same bug, narrower window, on Sidecar app relaunch | Med | BUG | Same root-cause fix covers this |
| 13 | Device lifecycle | RLS allows any session-holder to flip a sibling row's `revoked_at`/`paused` | High | BUG (root cause of #11/#12) | Add state-aware WITH CHECK / require matching auth_session_id |
| 14 | Device lifecycle | Companion writer never reads/writes `revoked_at` or `paused` | Med | BUG | Add lifecycle awareness to companion proxy writer |
| 15 | Device lifecycle | `machine_id` means two incompatible things across writers | Med | OVERHAUL | Split into two columns or document the divergence and stop conflating |
| 16 | Device lifecycle | Device-grouping logic duplicated (extension vs. Sidecar), can drift | Low | simplify | Extract to a shared package/util |
| 17 | Version drift | 4 different "current" extension version numbers live at once (6.7.46 GitHub / 6.7.47 local / 6.7.53 commit msg / 6.5.0 changelog) | High | NOW-fix | Reconcile: push local staging, update changelog, single source of truth |
| 18 | Version/branding | Main `staging` checkout still ships the OLD logo; `logo-rollout` branch not yet merged | High | NOW-fix | Merge `logo-rollout` into staging before next CWS build |
| 19 | Version/branding | Sidecar PWA icons (192/512) still old, unchanged since v0.1.0 | High | NOW-fix (known, now confirmed) | Regenerate from new mark, matching `logo-rollout`'s asset replacement list |
| 20 | Version/branding | Marketing-site favicon source unverified this pass | Low | needs follow-up | Direct check of `site/public/favicon.svg` in main repo |
| 21 | Version/branding | Sidecar `SIDECAR_VERSION` hardcoded independent of `app.json` | Med | latent BUG | Generate from `app.json` at build, same pattern as extension |
| 22 | Version/branding | Vendor-name leakage swept — none found, "Cloud Sync" abstraction already correct | — | clean | No action needed |

---

## Parking-lot items noticed but out of scope

- Two distinct `chromiumapp.org` extension IDs in the Supabase auth allow-list (finding #6) — worth a quick Chrome Web Store dashboard check for which is current.
- The `site/docs` deploy script (`site:deploy`) lacks `--branch=main`, a preview-deploy risk already self-flagged in `docs/OPERATIONS.md` — not re-litigated in depth here since it was already known and documented by the team, just re-confirmed as still open.
