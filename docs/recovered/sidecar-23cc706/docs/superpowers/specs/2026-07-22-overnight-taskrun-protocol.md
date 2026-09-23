# Overnight TaskRun Autonomy Protocol

**Status:** CHARTER — governs unattended overnight TaskRun sessions
**Author:** Soren (Opus persona) · dispatched by CeeCee · **Date:** 2026-07-22
**First run this governs:** tonight, 2026-07-22 ~22:00 ET (Rook assembling the queue at `docs/taskrun/2026-07-22-queue.md`)
**Reads-first:** `AGENTS.md` (build/load constraint, global rules), `docs/OPERATIONS.md` (the release/maintenance bible — this doc is the *autonomy* layer on top of it, and defers to it for every "how do we ship X" question)

---

## 0. Why this exists

Malkio runs unattended overnight sessions. His charter, distilled from his own words:

> No human input at any point. When judgment is needed, decide from what's known about
> how he likes things and what the system is meant to do for him and for future users.
> Keep authed pages fresh by periodically refreshing them. Any modal that would need his
> assistance — delegate to Koda in a computer-use session (he has granted CeeCee and Koda
> that permission), possibly with guidance.

The whole night runs with **nobody watching**. That means two failure modes to engineer
against: (1) an agent freezing on a decision it was actually equipped to make, and (2) an
agent doing something irreversible or outward-facing that Malkio would have wanted to see
first. This protocol draws that line, then makes the machinery around it (auth freshness,
Koda delegation, surface propagation, session shape) concrete enough to run without a human
in the loop.

---

## 1. Decision framework

The single question for every judgment call:

> **Is this reversible and in-pattern?** If yes → decide and proceed. If it is irreversible,
> outward-facing, touches money, or touches another human → it goes on the MORNING-QUESTIONS
> list and the run continues around it.

### 1.1 DECIDE ALONE (reversible, in-pattern, no external party)

Agents have standing authority to do these without waking anyone:

| Action | Why it's safe alone | Authority / method |
|---|---|---|
| **Ship Sidecar straight to prod** | Own `0.x` line, no staging slot by design, roll-forward is one redeploy | `OPERATIONS.md` §2.1 (clean worktree, `--clear`, local-bundle preflight, `wrangler deploy`) |
| **Move the fleet CRX force-install channel** (jbdka line) | Self-hosted CRX, previous crx kept for rollback, managed Chromes poll on their own cadence | `OPERATIONS.md` §2.2b — pack, **verify id `jbdka…` + inner version before publish**, keep prior crx |
| **Deploy docs / marketing / showcase site** | Cloudflare Pages, instantly re-deployable, no data at stake | `OPERATIONS.md` §2.5 — **always `--branch=main` explicit** or it previews |
| **Apply a migration following the placeholder protocol** | Additive schema on the single prod project; placeholder-then-repair keeps CLI state honest | `OPERATIONS.md` §2.6 + §5 — `ls supabase/migrations` to re-verify next-free number FIRST |
| **Staff self-hosted update channel** (`ext-vX.Y.Z`) | Same pinned id every release, roll-forward trivial | `OPERATIONS.md` §2.2 |
| **Commits, version bumps, changelog, progress log, SYSTEM-MAP, Asana comments** | The record-keeping itself; never optional | §4 below + `OPERATIONS.md` §4 |
| **Build / test / lint / verify / read anything** | Non-mutating | — |
| **Companion release to the private mirror + `companion-latest.json`** | Roll-forward via manifest; freeze-gate is opt-in | `OPERATIONS.md` §2.4 |

In-pattern means: there is a documented pipeline, a prior successful run of the same shape,
and a rollback path. If any of those three is missing, it is **not** in-pattern — treat it as
a morning question even if it would otherwise look reversible.

### 1.2 DEFER to MORNING-QUESTIONS (irreversible / outward-facing / costs money / touches a human)

Do **not** do these overnight. Log them to `docs/taskrun/2026-07-22-morning-questions.md`
(create if absent) with: what's blocked, why it's deferred, the one decision or click Malkio
needs to make, and — critically — everything the agent *did* finish around the block so the
morning is a decision, not a re-investigation.

| Deferred action | Why |
|---|---|
| **CWS submission / publish / visibility / listing edits** | Outward-facing, review-gated, dashboard-set (`OPERATIONS.md` §2.3); a bad publish is public and slow to unwind. Never run `cws:auth` (interactive) or `cws:publish` unattended. |
| **Any email or message to a human** | Sending on someone's behalf is always a human-approval action (standing safety rules). Draft it, don't send it. |
| **Deleting data** (hard-delete rows, drop tables, empty trash, `migration repair` that discards real history, force-push over shared history) | Irreversible. `repair --status reverted` is fine only for the placeholder side-effect pattern, never to erase real applied migrations. |
| **Anything touching money** | Creating a licensed Workspace **user**, paid API upgrades, purchases, plan changes. Never overnight, never by an agent. |
| **New standing config / rules** | Mail forwarding/filters, OAuth grants, webhooks, DNS, changing account settings — persistent and outward-facing. |
| **Merging `staging → main` (production extension)** | Human-approval gate per `AGENTS.md` Global Rule 3. Prep the PR; do not merge. |
| **Anything a credential or payment would touch** | Stays Malkio-only, full stop (see §3.3). |

### 1.3 Tiebreaker — Malkio's known preferences

When 1.1 vs 1.2 is genuinely ambiguous, resolve toward what he's already told the fleet, in
this order:

1. **Consent-first product soul.** Tabatha is an *attention operating system* built on
   "good friction" and user consent. If a change would ever surprise a user, degrade their
   agency, or ship something they didn't opt into — stop and defer. This outranks speed.
2. **Verify reachability, proof before done.** Never assert a state you didn't observe. Grep
   the built artifact, hit the live URL, screenshot the admin page. "The report says it
   shipped" is not shipped (`feedback_verify_reachability.md`).
3. **Ship-fast, fix-fast.** For genuinely reversible, in-pattern work, bias to shipping now
   over waiting for morning. The whole point of an overnight run is forward motion.
4. **Version-per-commit, no rounding.** Every commit that changes behavior bumps the patch
   (+1) and runs `version:sync` in the *same* commit (`feedback_version_per_commit.md`,
   Headbox Rule 10). Never batch bumps.
5. **No coauthor lines.** Never add `Co-Authored-By` or any coauthor footer to commits or PRs
   (`feedback_no_coauthor.md`).
6. **Hide backend names in user-facing copy.** No "Supabase" etc. in any string that could
   round-trip to a user; use "Cloud Sync" (`feedback_hide_backend_names_in_ui.md`).

If after all six it's *still* ambiguous, it's a morning question. Ambiguity that survives the
tiebreaker is itself the signal to defer.

---

## 2. Auth-freshness routine

Overnight sessions die quietly when an authed browser tab silently logs out and the agent
keeps "working" against a login wall. Prevent it by treating logged-in pages as a perishable
resource that must be refreshed and re-verified.

### 2.1 Pages that matter overnight

| Page | Why it must stay fresh | Refresh cadence |
|---|---|---|
| `admin.google.com` | Workspace admin — force-install, SMTP/routing, user/group management | Every ~30–45 min while any admin work is queued; else once/hour as a keepalive |
| Chrome Web Store dev dashboard | Item status polling (review state) — read-only overnight | Once/hour if a CWS item is in review; otherwise skip |
| Asana web (only if the CLI can't cover it) | Persona comments/status — but the **CLI is preferred** and needs no browser session | Prefer `asana-cli` (§4); refresh the web tab only if a task genuinely requires the UI |
| Cloudflare / Supabase dashboards | Only if a task needs the console (most deploys are CLI) | On-demand, right before the task that needs them |

Rule of thumb: if the CLI can do it (Asana, Supabase migrations, wrangler deploys, gh
releases), **use the CLI** — it doesn't have a session that expires. Reserve the browser for
things that are genuinely console-only (admin.google.com SMTP/routing, CWS listing/visibility).

### 2.2 claude-in-chrome mechanics

- **Load the tools in ONE `ToolSearch` select call** (per the claude-in-chrome server note):
  `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp`
  plus any task-specific tool (`form_input`, `get_page_text`) in the same call. Never one at a time.
- **Refresh = navigate to the page's own URL**, then **screenshot to verify you're still
  logged in** (look for the app chrome, not a Google sign-in screen). A `read_page` that comes
  back empty or shows a login form means the session lapsed → log a morning question ("re-auth
  admin.google.com"); the agent cannot log Malkio back in (credentials are his alone, §3.3).
- **Focus-gatekeeper gotcha (critical).** Malkio's Chrome runs a Tabatha-style focus gatekeeper
  that injects full-screen modal overlays ("Drifting off?", "Progress Check", "Focus Timer
  Expired"). **These blank the DOM entirely — `read_page`/accessibility reads return nothing.**
  - Always take a **`computer` screenshot first** — it is the only tool that reveals the overlay.
  - **Never type while a modal may hold focus** — keystrokes leak to the page's global shortcuts
    (on Supabase, typing once navigated the dashboard to `/realtime`). For editors, set content
    programmatically (`window.monaco…setValue`) and run with Ctrl+Enter.
  - **Do NOT dismiss Malkio's focus modals as an agent.** They are *his* consent surface. If one
    appears during browser work, **STOP browser work, screenshot it, note it, and route the click
    to Koda** (§3) — dismissing his own good-friction modal violates the consent-first soul and
    the dogfood rule (`feedback_use_tabatha_properly.md`). The one exception is a modal that is
    itself the thing being tested; that must be explicit in the task.
  - The gatekeeper re-fires on a ~15 min timer + checkpoints; work in the clean window right
    after a (Koda-performed) dismissal.

---

## 3. Koda computer-use delegation

Some authed UIs need a real click an agent's tools can't safely make — a native modal, a
consent dialog, a picker, or a focus-gatekeeper overlay. Malkio has granted **CeeCee and Koda**
computer-use permission for exactly this.

### 3.1 When to delegate

- A modal/prompt in an authed UI needs a click and the DOM path is blocked or unsafe (the
  focus gatekeeper is the archetypal case — DOM is blanked, only pixels are visible).
- A native OS dialog appears (file picker, permission grant) that browser tools can't reach.
- Any interaction where typing would leak to page shortcuts and the safe path is a single
  deliberate click.

### 3.2 How to delegate

1. **Screenshot first** so the dispatch carries evidence of the exact state.
2. Dispatch to Koda with **explicit guidance**: what screen it is, the exact target
   ("click the 'Snooze 5 min' button, bottom-left of the overlay"), what NOT to touch, and the
   expected post-state. Never dispatch "deal with the popup" — dispatch the precise click.
3. Require Koda to return an **evidence screenshot** of the post-click state.
4. **Verify** the post-state matches the expectation before continuing; if not, re-screenshot
   and re-dispatch — don't assume the click landed.
5. **Log every intervention** — a one-line entry in the run log (`docs/taskrun/…`) and the
   Asana umbrella comment: what modal, what click, what it unblocked.

### 3.3 Hard limits (never delegate these — to Koda or anyone)

- **Credentials and payment stay Malkio-only.** No agent, Koda included, ever types a password,
  card number, 2SV code, app password, API key, or token, or completes a sign-in/checkout.
  Standing safety rules make these prohibited actions regardless of who asks. If a task can only
  proceed past a credential/payment field, it is a morning question with the exact field named.
- No CAPTCHA solving, no accepting terms/OAuth grants on Malkio's behalf, no irreversible
  confirm/delete clicks — those are §1.2 morning questions even if a click would technically do it.

---

## 4. Surface-propagation protocol

**Standing rule:** every shipped change *slates its dependent surfaces for update* — either
immediately (preferred for the record surfaces) or batched at end-of-run (acceptable for the
public/derived surfaces), but never dropped. A change that ships without propagating is not
done (`OPERATIONS.md` §4: "a release that's only a commit, with no changelog entry and no Asana
trace, is not considered done").

At the moment of shipping any change, consult this table and slate every row that applies:

| Change type | Surfaces to touch |
|---|---|
| **Extension version bump** (any behavior change) | `public/manifest.json` (source of truth) → `npm run version:sync` (propagates `package.json`, `AGENTS.md` header, changelog gate); `Tabatha_Changelog.md`; `docs/progress.md`; SYSTEM-MAP §2; Asana comment |
| **Sidecar release** | `sidecar/app.json` **and** `sidecar/src/lib/device.ts` `SIDECAR_VERSION` (hand-synced pair, no script); `Tabatha_Changelog.md` if user-visible; `docs/progress.md`; SYSTEM-MAP; Asana |
| **Fleet CRX channel move** (jbdka) | `site/enterprise/update.xml` (`codebase`+`version`); keep prior `.crx`; deploy site; live-verify update.xml + `Cr24` magic bytes; `docs/progress.md`; Asana |
| **CWS state change** | `docs/CWS-PUBLISHING.md` if steps changed; Asana; **morning-questions** if it needs a human publish |
| **Migration applied** | `supabase/migrations/` (the file); `docs/progress.md` (drift/placeholder notes); SYSTEM-MAP §5 migration ledger; Asana |
| **New feature / UI surface** | Feature doc under `docs/features/`; **`/show` (showcase site)** via the `component-showcase-site` / `showcase-site-update` skill; `Tabatha_Changelog.md`; SYSTEM-MAP |
| **New version available to users** | **`/download` versions** (marketing/showcase site); in-app "What's New" (`public/changelog.json` via `build-changelog.mjs`) |
| **Any deploy / release / migration** | `docs/OPERATIONS.md` if the *pipeline itself* changed (not per-release); the five record locations in `OPERATIONS.md` §4 (Conventional Commit + Changelog + Asana + progress + SYSTEM-MAP + GitHub Release for artifacts) |
| **Ops/pipeline change** | `docs/OPERATIONS.md`; `AGENTS.md` if it changes a global constraint |

The **five always-on record locations** (`OPERATIONS.md` §4), none optional for tracked work:
Asana (Flux Development `1214031898449333`), `docs/progress.md`, `Tabatha_Changelog.md`,
`docs/system-map/SYSTEM-MAP.md`, GitHub Releases per artifact.

**Batched-at-end discipline:** derived/public surfaces (`/show`, `/download`, changelog
compilation, SYSTEM-MAP) may be batched into an end-of-run propagation pass — but the *slate*
(a running checklist in the run log of what still needs touching) is maintained continuously,
so the end-of-run pass is a checklist to clear, not a memory exercise.

---

## 5. TaskRun session shape

### 5.1 The queue

Rook assembles `docs/taskrun/2026-07-22-queue.md`. The overnight session **works the queue
top to bottom**. Each item should carry: a builder-ready scope, its acceptance/verification
gate, and whether it's §1.1 (decide-alone) or §1.2 (morning-question). If an item's category is
unstated, apply the §1 framework and record the call.

### 5.2 Per-item loop

For each queue item:

1. **Read the item + its linked design doc.** Don't start from the title alone.
2. **Categorize** (§1): decide-alone → build; morning-question → log to
   `morning-questions.md` with everything already learned, and move on.
3. **Dispatch a builder** (subagent, cheapest model that fits — `feedback_fable_delegation_rules.md`;
   personas + an Asana subtask per scope). Give it the design doc, the acceptance gate, and the
   surfaces-to-propagate slate for its change type.
4. **Verification gate (proof before done).** Do not accept a builder's "done":
   - Build passes (`npm run build`) / tests pass where they exist.
   - **Reachability proof** — grep the built artifact for the change; hit the live URL;
     screenshot the admin/console state. (`feedback_verify_reachability.md`.)
   - Version bumped + `version:sync` clean in the same commit; no coauthor footer.
5. **Propagate surfaces** (§4) — slate immediately, batch the derived ones.
6. **Commit** (Conventional Commit, per-file `git add`, never `-A`/`.` in the shared sidecar
   worktree — `OPERATIONS.md` §5 worktree-collision gotcha).

### 5.3 Auth-freshness heartbeat

Interleave the §2 refresh cadence with the item loop — roughly every 30–45 min, or right
before any browser-dependent item, refresh + screenshot-verify the authed pages the run needs.

### 5.4 Checkpoint cadence

- **Asana umbrella comment every ~2h** on this run's tracking task: items completed, items
  deferred (with the morning-question they became), current position in the queue, any Koda
  interventions. Single-line-per-point, `asana-cli comment add <gid> --text "…" --as <persona>`.
- Update `docs/progress.md` at each checkpoint, not only at the end — an overnight run can be
  interrupted; the log must let the next session resume cold.

### 5.5 Morning handoff report

At end-of-run, write `docs/taskrun/2026-07-22-handoff.md` and post its digest as the final
Asana comment. Format:

```
# Overnight TaskRun Handoff — 2026-07-22

## Shipped (decide-alone, done + verified)
- <item> — <what changed> — proof: <url / grep / screenshot ref> — commit <sha>

## Morning questions (need Malkio)
- <blocked item> — the ONE decision/click needed — everything already done around it — where it's parked

## Koda interventions
- <modal/click> — what it unblocked — evidence screenshot ref

## Surfaces propagated
- <checklist: what was touched, what's still slated>

## Queue position
- Completed N/M; next item on resume: <item>

## Verification summary
- Builds green: <y/n>; reachability proofs: <list>
```

The morning-questions section is the deliverable Malkio wakes to. Ideal shape: a short list of
**single clicks or single decisions**, each with the work already done underneath it — so his
morning is *approvals*, not investigation.

---

## 6. One-paragraph operating summary

Work Rook's queue top to bottom. For each item: reversible and in-pattern → build it, verify by
proof not report, propagate its surfaces, commit with a version bump and no coauthor line.
Irreversible, outward-facing, costs money, or touches a human → park it in morning-questions with
everything already learned. Keep the authed browser tabs fresh every 30–45 min and screenshot to
prove you're still logged in. When a modal needs a click you can't safely make — especially
Malkio's own focus gatekeeper — screenshot it and hand the exact click to Koda; never type a
credential or payment detail, ever. Checkpoint to Asana every 2h. Leave a morning of approvals,
not a morning of archaeology.
