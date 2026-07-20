# Chrome Web Store API Release Pipeline — Tabatha

Companion to `docs/CHROME-WEB-STORE-LISTING.md` (which covers the *content* of the
listing — description, permission justifications, assets, privacy disclosure). This
doc covers the *mechanics* of getting a build from `dist/` onto the Chrome Web Store
using the CWS Items API instead of the manual dashboard upload flow.

Scripts live in `scripts/cws-auth.mjs` and `scripts/cws-publish.mjs`, backed by pure
helpers in `scripts/lib/`. Secrets live only in the gitignored `deploy-creds.local`
(`*.local` pattern in `.gitignore`) — never commit it, never paste its contents
anywhere.

---

## 0. Prerequisites (already done as of this writing)

- GCP project `tabatha-web-store-api` exists, Chrome Web Store API **enabled**.
- OAuth client **"Tabatha CWS Publisher"** created, type **Desktop app**
  (client id starts `1006989794983-...`).
- CWS developer account registered and paid (one-time $5 fee), publisher identity
  involves the `chromeext@pondocean.co` group.
- `npm run build:store` already produces the key-stripped upload artifact
  `store-assets/tabatha-store-v<version>.zip` — see
  `docs/CHROME-WEB-STORE-LISTING.md` section 7a.

## 1. One-time OAuth bootstrap

```
npm run cws:auth
```

What happens (no code-pasting required):

1. The script finds the newest `client_secret_*1006989794983*.json` in your
   Downloads folder (falls back to the newest `client_secret_*.json` if that
   exact one isn't there, or pass `--client <path>` to point at a specific file).
2. It starts a tiny local HTTP listener on `127.0.0.1:<random free port>` and opens
   your default browser to the Google consent screen for scope
   `chromewebstore` (offline access, forces the consent screen so a refresh token
   is actually issued).
3. You sign in with the account that owns the CWS developer registration and click
   Allow. The browser tab redirects back to the local listener, which grabs the
   `?code=`, shows a "you can close this tab" page, and exchanges the code for a
   refresh token in the background.
4. `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` are written into
   `deploy-creds.local` (existing keys such as `ASANA_PAT` are left untouched).

Failure modes handled explicitly: no client_secret file found, user denies consent,
2-minute timeout with nothing received, loopback port already in use, token exchange
returning no refresh token (usually means Google already has a prior grant — revoke
at https://myaccount.google.com/permissions and retry).

You only need to run this once per developer machine, unless the refresh token is
revoked.

## 2. First-time listing creation

The CWS API can create a brand-new item, but **all the human-facing listing content
still has to be filled in via the developer console UI** — see
`docs/CHROME-WEB-STORE-LISTING.md` for the exact copy to paste (title, summary,
description, category, screenshots, privacy policy URL) and set **Visibility =
Unlisted** there too; the API's `publishTarget` (below) is a *different* axis
(who can install a Public/Unlisted item during pre-review) and does not control
Public/Unlisted/Private visibility itself.

```
npm run cws:upload -- --new
```

This builds `store-assets/tabatha-store-v<version>.zip` if it doesn't already exist
for the current `public/manifest.json` version, POSTs it to create the item, and
writes the returned `CWS_APP_ID` into `deploy-creds.local`. Go fill in the listing
in the dashboard before publishing.

## 3. Per-release loop

Once `CWS_APP_ID` exists in `deploy-creds.local`:

```
# 1. bump the version (public/manifest.json is the source of truth)
npm run version:sync

# 2. build the upload artifact
npm run build:store

# 3. upload the new package to the existing item
npm run cws:upload

# 4. publish it
npm run cws:publish                       # publishTarget=trustedTesters (default)
node scripts/cws-publish.mjs --publish --target default   # or the full audience
```

`npm run cws:upload` builds the zip automatically if it's missing for the current
version, so step 2 is technically optional but keeping it explicit makes the version
bump visible in your terminal history.

Check status at any point with:

```
node scripts/cws-publish.mjs --status
```

which prints `uploadState` and echoes back any `itemError` entries verbatim (those
are Google's own diagnostic messages, not secrets, so they're safe to read/share).

## 4. `publishTarget` vs. Visibility — don't confuse these

- **Visibility** (Public / Unlisted / Private) is a dashboard-only setting. For a
  staff/limited rollout, set it to **Unlisted** in the console once, when the item
  is first created.
- **`publishTarget`** (this pipeline's `--target` flag) controls the API's own
  concept of *who can install the item while Google reviews it*:
  - `trustedTesters` (default here) — only accounts you've added as trusted testers
    in the dashboard can install/see it pre-review. Use this for staff rollout.
  - `default` — publish to everyone the Visibility setting already allows.

Since the goal right now is an unlisted/staff rollout, this pipeline defaults
`--target` to `trustedTesters`. Switch to `--target default` deliberately once
you're ready for the full unlisted audience (or public, if Visibility is ever
flipped to Public).

## 5. Review latency expectations

Tabatha's permission set (`identity` + `<all_urls>` + `scripting` + `webNavigation`
+ `tabs`) is exactly the combination Chrome's review team tends to flag for closer,
often-manual scrutiny (see `docs/CHROME-WEB-STORE-LISTING.md` section 10). Budget
noticeably more calendar time than a simple single-permission utility would need —
this is not a same-day turnaround, and a rejection asking for clarification on the
permission justifications (section 6 of the listing doc) is a realistic first-pass
outcome, not a sign something is broken in this pipeline.

## 6. Credential hygiene

- `deploy-creds.local` is `KEY=value` per line, gitignored via the `*.local`
  glob in `.gitignore`. Never commit it, never print its contents.
- These scripts only ever print booleans or `.length` counts for secret values
  (e.g. "refresh token received (103 chars)") — if you see a raw token in a
  terminal transcript, something upstream of these scripts leaked it, not this
  pipeline.
- To rotate: revoke access at https://myaccount.google.com/permissions for the
  "Tabatha CWS Publisher" client, delete the `CWS_*` lines from
  `deploy-creds.local`, and re-run `npm run cws:auth`.

## 7. What's still needed from Malkio

- Download the "Tabatha CWS Publisher" client_secret JSON into
  `C:\Users\mrmal\Downloads\` (the auto-finder looks there first).
- Run `npm run cws:auth` interactively (needs a real browser + real consent click —
  not something an agent should do unattended).
- Fill in the first-time listing fields in the developer console (title, summary,
  description, category, screenshots, privacy policy URL, Unlisted visibility) —
  content is already drafted in `docs/CHROME-WEB-STORE-LISTING.md`.
- Add trusted testers in the dashboard if using the default `trustedTesters`
  publish target for the initial staff rollout.
- Decide when to flip `--target default` for a wider unlisted audience.
