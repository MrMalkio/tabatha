# Tabatha — First Team Deployment (v6.4.0)

**Goal:** Get Tabatha to its first team deployment **today** — installed *without* the
Chrome Web Store (unpacked extension + desktop companion), for Reggie & Po, on the
v6.4.0 line. This doc is the agreed source of decisions + the closeable checklist.

Owner of the build: **Argus** (Antigravity, `argus-antigravity-od`, Asana
`1216097535660831`). Maintainer / orchestration: this thread (on OD). Code review +
plan-vetting: **Koda** (Codex, `koda-codex-od`).

---

## 1. Why Tabatha exists (the North Star)

Tabatha is an **Attention & Context OS** for the browser + desktop. Priority order for
this deployment:

1. **Visibility & management (primary).** See *where the team's time and attention go* —
   clock in/out, focus, what they work on — combined with the work itself to understand
   the team's true **capacity** and **predictability** ("when can I expect things").
   30-day win: real clarity on delivery timing.
2. **Context capture for the agents (close second, long game).** The live context/data
   feeds the autonomous agents so they can jump in and accelerate everyone. *Today's
   Tabatha has no AI built in yet.* AI features land over ~30 days; eventually staff
   "just use the system," not the UI.
3. **Behavior change (an outcome we watch, not a lever we pull).** Staff get the same
   focus/organizing benefits Malkio gets.

**Roadmap, NOT today:** in-extension manager dashboard, AI features, schedule + time-off
management, "not-working" context, productization for the external party (who needs
*usage* data, not their team's actual data), and a **public download website** for the
extension + companion + screensaver (likely already scoped somewhere in the folder —
to be located).

## 2. What data Tabatha surfaces (for management)

When sync works, each member's data lands in Supabase project `mtdgoahskcibjbhfvofx`
(schema `tabatha`): **clock sessions** (in/out, work/break), **desktop activity** (app,
window, category, duration — from companion over WS), **browser intents / focus**,
**org registry** (clients/projects/tasks), **calendar** events.

**Owner visibility, today:** RLS limits each *extension* user to their own rows (manager
view is a future phase). Malkio owns the Supabase project, so RLS doesn't constrain him
in the dashboard / via service role. Day-one visibility = sync flowing + members joined
to the org + a couple of **read views** (or the table editor). No dashboard build today.

## 3. Source of truth & git model

- **Today's canonical baseline = PS** (Pondecean-Silver, remote, SSH): `staging` @
  `3aa8611`, `manifest.json` = **6.4.0**, feature branches already merged, tree clean
  (only untracked `.headbox` docs). OD (this machine) is stale at 5.8.0; GitHub
  `origin/staging` is behind (`d901220`). 5.x is dead.
- **Going forward, GitHub IS the source of truth.** Repo `github.com/MrMalkio/tabatha`.
- **Reconciliation order (this thread plays maintainer):**
  1. **Sort out PS** — confirm clean 6.4.0, decide which branches are good vs. dead,
     merge what should be merged, prune the rest.
  2. **Sort out GitHub** — push the clean 6.4.0 line so GitHub becomes authoritative.
  3. **OD pulls from GitHub** — use **Bifrost** to ensure OD has the GitHub credentials.
- **Treat PS and OD as two independent developers**, each a physical machine with its
  own coding agents, both deploying to/from GitHub. GitHub will omit gitignored content
  (node_modules, dist, local data, secrets), so the machines stay independent dev envs.
- **Team-development guidelines live in the headbox protocols** — already on PS; must be
  **installed on OD** so both machines follow the same git/coordination rules.

## 4. Coordination model (humans must see everything)

- **Primary coordination = Asana** — tasks + comments, so the human team has full
  transparency. Agents do their work and coordinate there under their own accounts.
- **Heimdall = multi-machine necessity** (dispatch/transfer/credentials across PS↔OD)
  and agent↔agent where needed — but Asana stays the visible record.
- **To Malkio = Slack + Asana** (mixture). Never the Heimdall mailbox for Malkio.
- This thread can **initiate/manage the other agents via their CLI + Heimdall.** No human
  needed except testing — which this thread can also do (browser access).

## 5. Install experience (dummy-proof, companion-driven)

Companion (Tauri tray app) owns the start of install + an in-app guide:

1. Companion **detects extension state** via the WebSocket on `localhost:9147`:
   - **Never installed** → prompt to install (guided flow below).
   - **Was present, now deactivated/broken/disconnected** → a **distinct** message
     ("Tabatha extension stopped responding"), not the first-run install prompt.
2. Guided flow: **[Copy DIST path]** → **[Open chrome://extensions]** → on-screen steps
   (Developer Mode → Load unpacked → paste path → Enter).
3. **Auto-detect success:** when the extension connects over WS, the guide advances to
   "✅ installed."

**Multiple browser profiles (design consideration for the implementation plan):**
- Invite the user to install the extension on as many Chrome profiles as possible
  (better context). The expected primary = the workspace-controlled profile.
- If the companion sees the user in Chrome but **not** on a tab in an
  extension-equipped/identified profile, **flag that as a "divergence" in the history**
  (so Chrome-to-Chrome across profiles isn't silently merged) — excepting incognito.
- We may not be able to detect profiles without the user pointing them out; capture this
  as a known limitation to design around, not a hard blocker for today.

## 6. Update mechanism (no Web Store) — code-only, never data

1. Companion bundles the extension and creates the folder
   (`%APPDATA%\Tabatha Desktop\extension\`); team always loads from there.
2. On update: companion **fetches new files from Supabase Storage** (chosen host),
   **atomically replaces** the folder's code, **preserving** the local SQLite DB and the
   extension's `chrome.storage`.
3. Companion sends `UPDATE_READY` over the WS → extension calls
   `chrome.runtime.reload()` → Chrome re-reads the updated unpacked files. No manual
   refresh.

**Data durability (broader than today, but design for it now):**
- Pin a stable **`key`** in `manifest.json` so the unpacked extension ID — and therefore
  `chrome.storage` — survives reloads/updates.
- The **durable record of truth is the cloud** (Supabase), keyed by the durable
  `local_id` / `machine_id` (groundwork already in commit `b147bba`). So data must be
  **recoverable on sign-in regardless of extension ID** — covering the future case of a
  user switching from the unpacked build to a Chrome Web Store build (different ID) and
  not losing anything. Verify cloud rehydrate-on-sign-in works.
- Companion updates must never touch the SQLite data dir. Reconcile the three stores
  (companion SQLite ↔ extension local ↔ Supabase).
- Surface a **"last successfully synced remotely"** indicator in the UI (code already
  records `_lastSyncSuccess`; mostly a display task).

## 7. New in-scope features for today

- **Intent start-time editing.** Let a user set/adjust an intent's **start time** —
  including backdating — so a forgotten intent can be tracked retroactively (records time
  *backwards*, not only forward).
- **In-app lightweight feedback.** A simple feedback control in the app for issues /
  feature requests → posts via a **webhook to the existing Asana project** (tasks signed
  by a coding agent's PAT) → a **scheduled task reviews them and initiates fix plans**.
  (`webhooks.js` infra already exists in the extension.)

## 8. Live sync test bed (use it today)

Tabatha is effectively installed on **two browsers/profiles on PS** and **one browser on
OD**. Initiate sync across these and test multi-install behavior (durable identity,
attribution, no double-counting) before Reggie & Po onboard.

**Browser-control gotcha (for any agent testing):** Claude runs on **both PS and OD**.
Chrome may report multiple browsers or open on the wrong machine; agents always identify
as "local." **A `0x0` screenshot/interaction error means you're driving the browser on
the wrong machine** — re-target before continuing.

---

## First-Deployment Checklist (the closeable loop)

### Phase 0 — Source of truth (blocks all build/ship) — *maintainer: this thread*
- [x] Confirm PS `staging` @ 6.4.0 canonical (`3aa8611`, manifest 6.4.0).
- [ ] Sort out PS: identify good vs. dead branches, merge what's needed, prune the rest.
- [ ] Install/replicate **headbox protocols** on OD (match PS).
- [ ] Push clean 6.4.0 → GitHub; GitHub becomes source of truth.
- [ ] Give OD GitHub credentials via Bifrost; OD pulls from GitHub → matches 6.4.0.
- [ ] Verify PS == GitHub == OD at 6.4.0.

### Phase 1 — Extension build, sync, new features (Pillar A)
- [ ] Build unpacked `dist/` from 6.4.0.
- [ ] Verify Supabase migrations applied to the live project (esp. migration 005 →
      org/team scoping not NULL).
- [ ] **Live multi-install sync test** across PS (2 profiles) + OD (1) → data reaches
      Supabase, correctly attributed, no double-count.
- [ ] Pin stable `key` in `manifest.json`; verify cloud rehydrate-on-sign-in (data
      survives ID change).
- [ ] Surface "last synced remotely" indicator in the UI.
- [ ] **Intent start-time editing** (backdating).
- [ ] **In-app feedback → Asana webhook** (agent PAT) + scheduled review→fix-plan task.
- [ ] Owner read path: SQL view(s) so Malkio can see team time/context.

### Phase 2 — Desktop companion: install + update (Pillar B)
- [ ] Companion bundles 6.4.0 dist + creates the install folder.
- [ ] Dummy-proof guided install (copy-path + open-chrome + steps + auto-detect success).
- [ ] Distinct "extension was here, now broken/disconnected" state vs. first-run.
- [ ] Remote update from Supabase Storage: fetch + atomic replace (code only) +
      `UPDATE_READY` → reload.
- [ ] Data-integrity: updates never wipe SQLite/`chrome.storage`; three-store reconcile.
- [ ] Build companion `.msi`.

### Phase 3 — Deploy to Reggie & Po
- [ ] Reggie & Po install companion → load extension via guide → create account + join
      org.
- [ ] Confirm their data lands in Supabase under the org; Malkio can see it.
- [ ] Feedback control live end-to-end.

### Definition of done (ship)
Bugs in the cut fixed · build packaged · 6.4.0 on PS + GitHub + OD (GitHub authoritative)
· companion creates the install folder · Reggie & Po can load it and their data is
visible to Malkio.

---

## Fleet plan
- **Claude + Argus (Antigravity)** — high token capacity → heavy components on separate
  worktrees (extension build/sync/features; companion install+update).
- **Koda (Codex)** — code review + implementation-plan vetting.
- This thread initiates/manages agents via CLI + Heimdall; coordinates on **Asana**
  (human-visible); reaches Malkio via **Slack + Asana**; uses **Heimdall/Bifrost** for
  multi-machine work.
