# Chrome Web Store Publishing — Private/Domain Rollout

Goal: publish Tabatha to the Chrome Web Store as **Private — restricted to Malkio's Workspace
domain** — so a Workspace admin can force-install it via Google Admin console policy and it
**auto-updates** for everyone on that policy, with zero per-machine dev-mode setup.

This is a *narrower* goal than the "Unlisted" framing in `docs/DEPLOYMENT.md` and
`docs/cws-api-release.md` (Unlisted = installable by anyone with the link, not domain-restricted).
Those docs were written before the domain-restricted requirement was confirmed — see
`docs/cws-api-release.md` for the general API mechanics (still accurate) and treat the visibility
setting below as the one that matters for this specific rollout. Reconciling the two docs'
"Unlisted" language is a follow-up, not blocking.

Companion docs:
- `docs/cws-api-release.md` — the API pipeline runbook (OAuth bootstrap, upload/publish/status
  mechanics, `publishTarget` vs. Visibility).
- `docs/CHROME-WEB-STORE-LISTING.md` — the listing *content* (title, description, permission
  justifications, screenshots, privacy policy).
- `docs/DEPLOYMENT.md` — where this fits next to the self-hosted staff update channel.

---

## 1. The one-command publish flow (once setup below is done)

```bash
# one-time per machine, only if deploy-creds.local doesn't already have CWS_* keys
npm run cws:auth

# every release after that:
npm run version:sync      # public/manifest.json is the source of truth
npm run build:store        # → store-assets/tabatha-store-v<version>.zip (key-stripped, validated)
npm run cws:upload         # first release: npm run cws:upload -- --new  (writes CWS_APP_ID)
npm run cws:publish        # publishTarget defaults to trustedTesters — see step 3 below
```

Check draft status any time with `node scripts/cws-publish.mjs --status`. Full mechanics,
failure modes, and credential hygiene are in `docs/cws-api-release.md`.

**This is as far as automation goes.** Everything below this line is a one-time action only
Malkio (or whoever owns the CWS developer registration + the Workspace admin console) can do —
none of it is safe or possible for an agent to do unattended.

---

## 2. One-time setup Malkio needs to do

### 2a. CWS developer account (if not already registered)

- Register at <https://chrome.google.com/webstore/devconsole> with the Google account that will
  own the listing. **One-time $5 registration fee** if this account hasn't registered before —
  an agent cannot pay this; do it directly in the console.
- If publishing should be attributable to the `chromeext@pondocean.co` group (per
  `docs/cws-api-release.md` §0) rather than a personal account, register with that identity, or
  add it as a collaborator on the item after creation (dashboard → item → Trusted testers /
  Collaborators).

### 2b. Google Cloud OAuth client (if not already created)

- In the Google Cloud console, in a project with the **Chrome Web Store API enabled** (docs
  reference project `tabatha-web-store-api`), create an OAuth client of type **Desktop app**,
  named e.g. "Tabatha CWS Publisher".
- Download its `client_secret_*.json` into `C:\Users\mrmal\Downloads\` — `npm run cws:auth`
  auto-finds the newest one there (prefers a filename containing the expected client-id prefix,
  falls back to the newest `client_secret_*.json` present).
- **Credential reality check (as of this pass):** neither a matching `client_secret_*.json` nor
  any `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` / `CWS_APP_ID` were found in
  `deploy-creds.local`, `.env`, `.env.cortex.local`, or Windows Credential Manager on this
  machine — see the credential inventory in the accompanying report. This step has **not** been
  done yet, or was done on a different machine/account. A `client_secret_2_496847762109-*.json`
  *is* present in Downloads, but it belongs to GCP project `gws-cli-500107` (the Google
  Workspace CLI tool) — **do not reuse it here**, it is not registered for the
  `chromewebstore` scope and is an unrelated OAuth client.

### 2c. Run the OAuth bootstrap (interactive — needs a real browser click)

```bash
npm run cws:auth
```

Opens the Google consent screen, you sign in with the account from 2a/2b and click Allow. Writes
`CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` into the gitignored
`deploy-creds.local`. Never something an agent should trigger unattended — it needs your
real consent click.

### 2d. Create the first listing

```bash
npm run cws:upload -- --new
```

creates the CWS item and writes `CWS_APP_ID` into `deploy-creds.local`. Then in the developer
console, fill in (copy from `docs/CHROME-WEB-STORE-LISTING.md`):

- Title, summary, description, category, screenshots, privacy policy URL.
- **Visibility → Private.** In the Private-visibility panel, choose **"Only users in your
  organization can see and install"** (this is the domain-restriction that makes the item
  discoverable/installable only inside your Workspace domain, distinct from "Unlisted"). This
  option is only available because the account from 2a is a member of the Workspace.
- Do **not** submit for public review yet if you only want the domain-private rollout — Private
  items still go through a (lighter/faster) review before becoming installable, but they never
  appear in public search.

### 2e. Publish target

`npm run cws:publish` defaults to `--target trustedTesters` (only accounts you've explicitly
added as trusted testers can install pre-review). For a domain-wide rollout once you trust the
build, either add trusted testers in the dashboard, or run
`node scripts/cws-publish.mjs --publish --target default` to publish to the full audience the
Visibility setting already allows — which, with Visibility=Private/domain, is everyone in the
Workspace domain, not the public.

---

## 3. How the Workspace admin then repoints force-install

Once the item exists and is installable (step 2d/2e done, `CWS_APP_ID` known — that ID **is**
the extension ID Chrome assigns for the store build; it is **different** from the pinned staff
channel ID `hoknmoclnhccpgofpdihmiadmnmejjod` used by `docs/DEPLOYMENT.md` Channel 1, because the
store strips the pinned key and mints its own):

1. Workspace admin signs in at <https://admin.google.com>.
2. **Devices → Chrome → Apps & extensions → Users & browsers** (choose the org unit / group to
   target — e.g. everyone, or a pilot OU first).
3. **Add app/extension → search by ID** and paste the `CWS_APP_ID` from `deploy-creds.local` (or
   look it up on the item's dashboard URL, `.../devconsole/.../<id>/edit`).
4. Set **Installation policy → Force install** (optionally **+ pin to toolbar**).
5. Save. Chrome on managed devices in that OU picks up the policy on its next policy refresh /
   browser restart and silently installs the extension — no dev mode, no manual "Load unpacked",
   no per-user action.
6. **Auto-update is then native Chrome behavior**: Chrome's own background updater polls the
   Chrome Web Store's `update_url` (`https://clients2.google.com/service/update2/crx`) for
   force-installed extensions on its regular cadence (hours, not the self-hosted channel's fixed
   6h). Every subsequent `npm run cws:upload && npm run cws:publish` (after that release clears
   Google's review) is picked up automatically — no `install-tabatha-staff.ps1`-style script and
   no separate update-channel pointer needed for these users.
7. If a person previously used the self-hosted staff channel (Channel 1, pinned key
   `hoknmoclnhccpgofpdihmiadmnmejjod`), that is a **different install** — the force-installed
   store copy gets its own ID and its own local data. Remove the staff-channel unpacked install
   (or let the two coexist temporarily) and have them sign in to Cloud Sync on the store copy to
   get their data back, same caveat as `docs/DEPLOYMENT.md` Channel 2 already documents.

Every-review-takes-days caveat from `docs/cws-api-release.md` §5 still applies: Tabatha's
permission set (`identity` + `<all_urls>` + `scripting` + `webNavigation` + `tabs`) is the
combination Google's review team tends to flag for closer scrutiny, so budget calendar time
before the item is actually installable, even privately.

---

## 4. What this pass actually verified (2026-07-20)

- `feat/cws-api` (commit `99b8069`) reviewed line-by-line: sound, secrets never logged, 649
  original unit tests green, current pattern is the *correct* one (local-loopback OAuth — Google
  deprecated the out-of-band `urn:ietf:wg:oauth:2.0:oob` flow for new clients in 2022).
- Merged into new branch `feat/cws-activation` off `origin/staging` (`c38c66c`, v6.7.40). Did
  **not** touch `staging` directly. 8 merge conflicts, all resolved (version bumps + changelog
  entries + one stray/broken duplicate `scripts/cws-auth.mjs` that had separately landed on
  staging via an unrelated merge and used the deprecated OOB flow — replaced with this branch's
  working version). Bumped to **v6.7.41**. 651/652 tests pass (the 1 failure pre-exists on
  pristine `origin/staging`, confirmed unrelated). Build green. New CWS files eslint-clean.
- `npm run build:store` produced `store-assets/tabatha-store-v6.7.41.zip` — manifest validated
  (MV3, description present, all icon sizes present, no remotely-hosted code, no sourcemaps, no
  dotfiles, pinned `key` stripped).
- Credential inventory: **no CWS credentials exist anywhere searched** (`deploy-creds.local` in
  this worktree or the main dir, `.env`, `.env.cortex.local`, Windows Credential Manager). No
  dry-run of the API was possible as a result — step 2a-2c above are fully outstanding.
