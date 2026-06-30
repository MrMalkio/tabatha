# Tabatha v6.4.0 — Install Guide (unpacked, no Chrome Web Store)

This is the **first team deployment**. Today ships the **Chrome extension** (the core:
clock in/out, time + attention tracking, intent/context, sync to the team workspace).
The **desktop companion** (machine-wide app tracking + one-click install + auto-update)
is a fast-follow — its code is done; it just needs a build host with the MSVC toolchain.

---

## For Reggie & Po (fresh install)

1. **Get the extension folder.** You'll receive the `tabatha-6.4.0` folder (the built
   `dist/`). Put it somewhere permanent, e.g. `C:\Users\<you>\Tabatha\extension\`
   (don't load it from Downloads — if you delete it, the extension breaks).
2. Open Chrome → go to **`chrome://extensions`**.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the `tabatha-6.4.0` folder → **Select Folder**.
5. Tabatha is now installed. Pin it (puzzle-piece icon → pin) and open a new tab — the
   Tabatha home/gatekeeper appears.
6. **Create your account** (Sign in with Google, or email magic-link), then **redeem your
   invite** in Settings → this joins you to the team workspace so your time/context is
   visible to management.
7. Sanity check: the sidebar shows a **sync chip** ("Synced … ago"). Clock in once and
   confirm it goes green.

Because this is unpacked, the extension ID is pinned (stable) so your data survives
reloads. **Updates** today are manual: you'll get a refreshed folder and click the
reload ↻ on the Tabatha card in `chrome://extensions`. (The companion will automate this
once it ships.)

---

## For existing installs (Malkio's OD + PS machines) — DATA-SAFETY FIRST

These machines already run Tabatha **without** the pinned `key`. Loading the new keyed
build changes the extension ID **once**, which would orphan the old `chrome.storage`
unless the data is already in the cloud. **Order matters:**

1. **On each existing machine, force a full sync first** (open Tabatha → Settings →
   "Sync now"; confirm the sync chip shows a fresh success and data is in Supabase).
2. Only then load the new keyed `tabatha-6.4.0` build (Load unpacked at the new folder).
3. Sign in → the extension **rehydrates** your history from the cloud at the new ID.
4. Verify your clock history / contexts are present after sign-in.

Do NOT skip step 1 — it's the guard against losing local history on the ID change.

---

## Runtime steps the owner/admin completes once (workspace-side)

- Apply Supabase migrations **018** (org-attribution — makes synced data attributable to
  the org so management views work) and **019** (owner read views). `supabase db push`
  from `le dev/Tabatha`, or via the dashboard SQL editor.
- Add the extension's OAuth redirect URL
  `https://hoknmoclnhccpgofpdihmiadmnmejjod.chromiumapp.org/` to Supabase Auth → URL
  allowlist (needed for Google sign-in).
- (For in-app feedback) set `ASANA_PAT` + `ASANA_PROJECT_GID` secrets and deploy the
  `feedback-to-asana` edge function.

## Companion (fast-follow)

Code complete (`tabatha-desktop`): creates the extension folder, guided install, and
Supabase-Storage auto-update with a manifest-key guard (never swaps to a different
identity, never touches the local SQLite DB). Needs a build host with **Rust + VS Build
Tools + Windows SDK** to produce the `.msi`. Once built, installing it replaces the
manual steps above with a one-click flow + silent updates.
