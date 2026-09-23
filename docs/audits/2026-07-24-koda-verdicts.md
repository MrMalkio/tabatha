# Koda — Adversarial Verdicts, 2026-07-24/25 TaskRun

**Reviewer:** Koda (adversarial review persona)
**Dispatched by:** CeeCee, per `docs/taskrun/2026-07-24-night-targets.md`
**Repo:** `C:\Users\mrmal\le dev\Tabatha` — `staging` @ 6.7.73
**Prod DB:** project `mtdgoahskcibjbhfvofx` (read-only access via Management API; SELECT/EXPLAIN only, no writes performed)

| # | Scope | Verdict |
|---|---|---|
| 1 | org-hours v1 auth model (`feat/org-hours-v1` + migration 060) | **REJECT** |
| 2 | Migrations 050→060 + edge-function surface | **CONDITIONAL — 1 High, 1 Medium, 2 governance findings** |
| 3 | Q7 production promotion `staging` → `main` | **NO-GO** |

---

# VERDICT 1 — org-hours v1: **REJECT**

> **Immediate action recommended, independent of the branch decision:** migration 060 is
> **already applied to production and already callable**. Holding the UI does not contain it.
> See §1.7 for the one-line mitigation.

## 1.1 What the locked consent model requires

Per Malkio's Q3 (2026-07-23) and `docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md` §4:

1. Aggregate-only by default.
2. Per-person named rows **only** with `profiles.settings.share_hours_with_org` opt-in.
3. Personal-realm time never visible.
4. Managers see work-realm only (the migration 001 fence).

The build satisfies (2) literally and fails (1), (3) and (4) substantively. The failure of (1) is
not a tuning problem — it is structural, and it is live.

## 1.2 F1 (Critical) — the "anonymous" aggregate is an exact per-person disclosure

`060_org_hours_summary_rpc.sql:148-160` emits one aggregate row summed over `cs.org_id = p_org_id`
with **no minimum-contributor threshold**. In an org where one member dominates a time window, the
aggregate *is* that member's data with a `NULL` label attached.

**Proven live against the real Duck & Shark org** (3 members: Malkio R `owner`, regina `user`, po `user`).
Executed as regina — an ordinary `user`, not a manager — by setting `request.jwt.claims.sub` to her
auth id under `SET LOCAL ROLE authenticated`, inside a rolled-back transaction:

```sql
SELECT * FROM tabatha.get_org_hours_summary(
  'a7427066-b4d7-4030-9c5d-a60720988ae2'::uuid, '2026-07-21', '2026-07-21');
```

```
member_profile_id | display_name | work_ms  | session_count | is_aggregate_only
NULL              | NULL         | 36101399 | 5             | true
```

Cross-checked against the raw table: Malkio's five sessions on 2026-07-21 are
`13962216 + 885644 + 8565644 + 4075662 + 8612233 = 36,101,399`. **Exact match.** regina has zero
sessions that day, so the "anonymous org-wide aggregate" is, byte for byte, Malkio's worked hours
(10h 01m) and his shift count. **Malkio has not opted in** — verified, no profile in the database
has the `share_hours_with_org` key set at all.

Before 060 this was impossible: `clock_sessions` RLS is own-rows-only
(`Users manage own clock sessions`, `profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())`),
and migration 019's `v_owner_clock_daily` is service-role-only by explicit design. **Migration 060 is
the entire delta** between "no member can see another member's hours" and the result above.

## 1.3 F2 (Critical) — unbounded range → full timeline reconstruction

`060:96-97` defaults the window to 7 days but `060:122-123` validates only that the dates are
non-null and ordered. There is no minimum window, no maximum lookback, and no rate limit. A member
can sweep day by day:

```sql
SELECT d, r.work_ms, r.session_count
FROM generate_series('2026-07-06'::date,'2026-07-24'::date,'1 day') d
CROSS JOIN LATERAL tabatha.get_org_hours_summary('a742…'::uuid, d::date, d::date) r
WHERE r.is_aggregate_only AND r.session_count > 0;
```

Run as regina, this returned the org's complete day-by-day worked-hours and shift-count history in a
single query — 8 populated days, every one of which is attributable, because on 7 of the 8 the only
contributor was Malkio. `session_count` in the aggregate row makes this worse: it leaks work
*fragmentation* (how many times someone started and stopped), not just volume.

De-anonymization does not even require the caller to be idle. Any member can always compute
`aggregate − (their own known hours)` to get the sum of everyone else. **For a 2-member org that is
always an exact named disclosure, with zero opt-ins.**

## 1.4 F3 (Critical) — the UI ships the subtraction as a displayed feature

`src/utils/orgHours.js:55-56`:

```js
const namedWorkMs = members.reduce((sum, m) => sum + m.workMs, 0);
const unattributedWorkMs = Math.max(0, (aggregate?.workMs || 0) - namedWorkMs);
```

Rendered at `src/settings/TeamActivityPanel.jsx:100` — *"· {X} from members who haven't opted in to
share by name"* — and `src/workshifts/TeamHoursView.jsx:113` — *"· {X} from members sharing
aggregate-only (haven't opted in by name)"*.

When exactly one member has declined to opt in, that string **is that member's exact worked hours,
labelled as belonging to the person who declined**. The product computes and displays the residual
specifically attributed to non-consenters. This inverts the consent model: opting in gets you a row
with your name; opting out gets you a row that says "the person who refused worked this much." The
only member in a small org who is *not* protected is the one who exercised the choice.

This is the specific thing the concept doc's never-dos list exists to prevent, and it is presented
in the UI as a helpful detail.

## 1.5 F4 (High) — "personal realm never visible" is unenforced, not structural

The migration header argues at length that leakage is structurally impossible because
`clock_sessions` carries no realm column. I verified the prod schema — it is correct that there is no
realm column:

```
id, profile_id, org_id, team_id, client_id, clocked_in_at, clocked_out_at,
total_ms, break_ms, work_ms, breaks, source, synced_at, browser_profile_id
```

But the header draws the wrong conclusion. The absence of a realm column does not mean personal-realm
time cannot leak — it means **personal-realm time cannot be excluded**. Migration 001's fence
(`realm IN ('professional','work','business')`) is *absent*, not inherited. Every clock session
stamped with an `org_id` contributes its full `work_ms` regardless of what the user was actually
doing. What leaks is not the realm label; it is the time itself.

Requirement (4) — "managers see work-realm only" — is therefore not met by this RPC. It cannot be met
until the shift ledger can distinguish realms, or until the RPC is restricted to sessions provably
tagged work-realm. The 16 org-tagged sessions in prod carry no such discriminator (several have
`source = 'reconstructed'`, i.e. synthesised by the ghost-stint reconciler, which makes their
provenance weaker still).

## 1.6 Remaining findings

| ID | Sev | Finding |
|----|-----|---------|
| **F5** | High | **Opt-in is global, not per-org.** `share_hours_with_org` is a single top-level boolean on `profiles.settings` (`060:210-228`). A user who consents to name-level sharing in one trusted org is simultaneously consenting in **every** org they belong to, now and in the future — including any org they are later added to. Consent granted in one context silently transfers to another. Should be `{ "<org_id>": true }`. |
| **F6** | Med | **Aggregate includes departed members.** Named rows correctly require a current `org_members` row (`060:183-187`) — good. The aggregate (`060:157-160`) filters on `cs.org_id` only, so someone who leaves the org can never remove their contribution from the org total. Leaving is not an exit. |
| **F7** | Med | **Cast DoS.** `COALESCE((p.settings ->> 'share_hours_with_org')::boolean, false)` at `060:182` throws `invalid input syntax for type boolean` on any non-boolean value. `set_share_hours_with_org` is safe, but the generic settings path / direct RLS write is not necessarily — one member with a malformed value breaks the RPC for the entire org. Needs a guarded cast (`jsonb_typeof(...) = 'boolean'`). |
| **F8** | Info | **"Manager-gated UI" is not a boundary — and the builder correctly says so** (`TeamActivityPanel.jsx:60-63`, `TeamHoursView.jsx:9-13`). Flagged here because it removes the usual mitigation: "don't ship the UI yet" does not reduce exposure by one bit. `GRANT EXECUTE … TO authenticated` (`060:198`) is live now, callable from PostgREST by any signed-in member. |

**What the build gets right, and should not be lost in a rewrite:** membership is checked inside the
function body rather than trusted from `p_org_id` (`060:130-138`); a non-member receives zero rows
rather than an error, so the function is not an org-existence oracle — I verified this with an
outside-org account (`rows_returned = 0`); `anon` genuinely cannot execute it (verified
`has_function_privilege('anon', …) = false`); `search_path` is pinned on both functions;
`set_share_hours_with_org` has a correct `auth.uid()` ownership check plus a `FOR UPDATE` row lock;
and named rows correctly require *current* membership. The write path is sound. The read path is not.

## 1.7 Why REJECT rather than SHIP-WITH-CHANGES

The builder flagged the "any org member vs manager-only" widening as the thing to review. That framing
is a distraction: narrowing the RPC to managers would not fix any of F1–F4. A manager subtracting the
aggregate learns exactly as much as regina did. The defect is not *who* can call it — it is that
**an aggregate over a 3-person team is not an aggregate**. Small teams are Tabatha's entire near-term
market, and there is no parameter setting that makes a 3-person org's aggregate anonymous against a
member who knows their own contribution.

This is also the precise place Malkio said Tabatha must not become surveillance software. What is
live in production right now is a mechanism by which one member of a small team can reconstruct
another member's complete daily working-hours timeline — start-stop fragmentation included — without
that person's consent, without a manager role, and without leaving a trace. The feature's own UI
labels the residual as belonging to the people who declined to be named. I do not think Malkio would
ship this, and I am not going to round it up to "ship with changes."

**Recommended immediate mitigation** (Malkio's call — I performed no writes):

```sql
REVOKE EXECUTE ON FUNCTION tabatha.get_org_hours_summary(UUID, DATE, DATE) FROM authenticated;
```

This leaves the opt-in setter and all data intact and closes the read path until the model is fixed.

**The path to a yes**, if the feature is wanted:

1. **Minimum-N suppression.** Return no aggregate unless ≥ N distinct *other* members contributed in
   the window. N = 3 is the floor; N = 5 is defensible.
2. **Clamp the range.** Minimum window ≥ 7 days, maximum lookback bounded, single-day queries denied.
3. **Drop `session_count`** from the aggregate row, or coarsen it to a band.
4. **Delete `unattributedWorkMs`** from `orgHours.js` and both UI surfaces. Do not display the residual.
5. **Realm fence.** Add a realm discriminator to the shift ledger and filter to work-realm, or state
   plainly in the UI that personal time is included — do not claim a guarantee that isn't enforced.
6. **Per-org opt-in** keyed by `org_id`.
7. **Guarded boolean cast**; log/rate-limit RPC calls so a day-by-day sweep is detectable.

Items 1, 2 and 4 are non-negotiable for my sign-off. If they materially damage the feature's
usefulness, that is the honest signal that org-level hours reporting does not belong in small-team
Tabatha at all.

---

# VERDICT 2 — Migrations + backend surface: **CONDITIONAL**

## 2.1 Deployed reality vs. repo

Migration ledger applied in prod: `001–028, 029, 030–045, 050, 058, 059, 060`.

| Item | Repo | Prod | Assessment |
|---|---|---|---|
| 058 lifecycle guard | on `staging` | applied — trigger `trg_browser_profiles_revoke_guard` verified present on `tabatha.browser_profiles` | consistent |
| 059 short invite tokens | **only on `origin/fix/short-invite-tokens`** (unmerged) | applied | **drift** |
| 060 org-hours | **only on `origin/feat/org-hours-v1`** (unmerged) | applied | **drift** |
| 046–049, 051–057 | never existed | never applied | numbering gap only; harmless |

`verify_jwt` on deployed functions matches `config.toml` exactly (invite-check `false`, pair-watch
`false`, send-focus-push `true`, connect-asana / device-signout / feedback-to-asana `true`) — that
part of the deployed reality is faithful to the repo.

**G1 (governance, Medium).** Production's schema cannot be reproduced from `staging` or `main`. Two
applied migrations exist only on unmerged branches. This is the finding that drives Verdict 3.

**G2 (governance, Medium).** Two functions are **ACTIVE in production with no source on any shipping
branch**: `asana-task-action` (v5) and `asana-widget` (v3), both `verify_jwt = false`. Their source
exists only on `origin/rescue/ai-integration-widget-work-20260718`. I audited them from that branch
and **both have legitimate auth** — `asana-widget` verifies an HMAC signature against
`ASANA_CLIENT_SECRET` (correct for an Asana-invoked component, which is why `verify_jwt` is off), and
`asana-task-action` does a real in-code JWT check including the anon-key rejection guard
(`index.ts:38-46`). So this is **not** a vulnerability. It is an auditability and continuity problem:
these endpoints are live, anon-reachable at the gateway, and outside every review and deploy path. A
clean redeploy from `main` would either lose them or silently leave a stale version running.

## 2.2 F-EDGE-1 (**High**) — `pair-watch` redeem is a practically brute-forceable account takeover

`supabase/functions/pair-watch/index.ts`. The `redeem` action is unauthenticated by design
(`verify_jwt = false`, no `Authorization` read) — the 6-digit code *is* the credential. A successful
redeem returns a full `access_token` + `refresh_token` (`:158-167`), i.e. complete account takeover.

The documented defence is "1M code space × 5-minute expiry × one-live-code-per-profile × platform
throttling", plus an attempt lock at `:119` (`row.attempts >= 5`). **The attempt lock is dead code.**
The lookup is by SHA-256 hash (`:106-109`), so a wrong guess matches no row, falls into `!row`, and
returns 401 — `attempts` is never incremented anywhere in the file. The source says so itself at
`:114-118`. There is no per-IP counter, no lockout, no captcha, and **failed attempts are not logged
at all**, so an attack in progress is invisible.

Honest math: 10^6 codes over a 300-second window. At ~3,400 req/s an attacker covers the entire
keyspace within a single code's lifetime; at 1,000 req/s they cover ~30% per window. That is an
ordinary commodity attack, not a nation-state one. The attacker does not need to know a pairing is
happening — they run continuously and take over whoever pairs during the window. This is the highest
real-severity item in tonight's set, and it is already live.

Fix (any one materially helps; the first two are the real ones):
1. Increment `attempts` on a *per-IP / per-window* basis, not per-code — the per-code counter can
   never work given hash lookup.
2. Raise the code space (8 alphanumeric ≈ 2.8×10^12) or add a short server-side lockout after N
   failures from an origin.
3. Log failed redeems so the attack is at least detectable.

Note for tonight: T1 has an agent redeploying `pair-watch` for the "expires immediately" P1. That
redeploy should not ship without at least (3), and preferably (1).

## 2.3 F-EDGE-2 (Medium) — `send-focus-push` has no in-code auth

`supabase/functions/send-focus-push/index.ts:124` is `Deno.serve(async () => {` — the request object
is not even bound, so no `Authorization` header is ever read. `verify_jwt = true` only proves *a*
project key was presented, and the publishable/anon key is public by design (it ships in the unpacked
extension and is hardcoded in `site/assets/download.js:20`). Its three siblings all layer a real check
on top of the same gate (`feedback-to-asana:55`, `connect-asana:72`, `device-signout:79`); this one
does not.

Consequence: anyone holding the public key can force the full cron sweep repeatedly. No user input is
parsed, so there is no injection surface, but it drives push amplification to real users' devices,
unbounded `push_dedup` inserts, `browser_profile_status.metadata` writes, and **subscription deletions**
on 404/410 (`_shared/webpush.ts:60`). Fix: assert a shared secret from Vault (the cron caller already
sends one per `031_sidecar_push_cron.sql:26-30`) and reject everything else.

## 2.4 `invite-check` as an enumeration oracle — **honest assessment: not currently exploitable**

The brief asked me to assess this honestly rather than reflexively, so:

**Deployed reality differs from the repo, and the repo is the stale one.** `staging`'s generator makes
33-char tokens (128-bit). Migration 059 is applied in prod and replaced it. I read the live function
from the database: `tabatha._short_invite_token()` builds **8 symbols of Crockford base32** from
`extensions.gen_random_bytes(5)` — a CSPRNG, uniformly consuming exactly 40 bits with no waste and no
modulo bias. Keyspace 32^8 ≈ **1.10 × 10^12**.

`invite-check` is genuinely an unauthenticated oracle with **zero rate limiting and zero attempt
logging at any layer** (in-function, DB, or client — confirmed; `index.ts:28-34` documents the absence
as deliberate). Valid and invalid are trivially distinguishable, which is unavoidable for an endpoint
whose job is answering "is this valid".

But the exposure is **not** practically exploitable today. Live unredeemed tokens in prod: **2**.
Expected guesses to hit one ≈ 2^40 / 2 ≈ 5.5 × 10^11. Even at a sustained and wildly optimistic
10,000 req/s against Supabase's gateway, that is ~1.7 years, at enormous cost and with completely
abnormal traffic volume. **059 did not create an exploitable hole.** I am not going to call this a
vulnerability, because it isn't one.

What it *did* do is remove a 2.6 × 10^26 safety margin and replace it with a margin that depends
entirely on the live-token pool staying tiny. The math degrades linearly with pool size: at 10,000
concurrent live invites the expected work drops to ~10^8 guesses — hours, not years. Since there is no
rate limit and no logging, nothing would detect the transition or the attempt.

Recommendation (not a blocker): keep 8 characters if the UX matters — it is fine at current scale —
but add attempt logging now, and add a simple per-IP rate limit before any growth in invite volume.
Alternatively 12 characters (60 bits) restores a large margin at negligible UX cost. Also worth
correcting: `invite-check/index.ts:8,71` reference "migration 050" for the token shape; the live shape
now comes from 059.

## 2.5 Lower-severity

- **Log hygiene (Low).** Verbatim upstream response bodies written to function logs:
  `connect-asana:139-140, :236-237`; `feedback-to-asana:174-175`. Server-side only, not client-facing.
- **Low.** `connect-asana:222` puts a profile UUID in a query string handed to Asana and stored there.
- **Info.** `device-signout` omits the `token === ANON_KEY` guard its two siblings have. No exploit —
  `getUser()` covers it — but the pattern should be consistent.
- **Correct and worth not regressing:** no wildcard CORS anywhere (every CORS-bearing function uses an
  explicit allow-list with `Vary: Origin`); `Access-Control-Allow-Credentials` is never set;
  `device-signout:96` is a textbook ownership check (`target.profile_id !== profile.id` against the
  JWT-derived id, with not-found and not-yours deliberately merged); `invite-check:111` correctly
  narrows columns so inviter/org identity is structurally unreachable in the response. **No IDOR was
  found in any of the six functions in scope.**

---

# VERDICT 3 — Q7 production promotion: **NO-GO**

`origin/main` @ 6.7.46 (`51c26d6`) → `origin/staging` @ 6.7.73 (`6156d31`); 68 commits, 94 files,
+7260/−531.

## 3.1 Blocking: the migration ledger is incoherent in the repo (G1)

Production has 059 and 060 applied. Neither is on `staging`; neither would be on `main` after the
promotion. Both exist only on unmerged feature branches — and one of them (060) is the subject of a
REJECT above.

This means the promotion produces a `main` that **cannot reproduce or verify the schema it is running
against**. That is disqualifying for a production tag on its own terms, independent of any defect:
the whole point of promoting to `main` is that `main` describes production. Right now it doesn't, in
both directions.

**Condition:** land 059 (and 060, or its replacement, or an explicit revert) into `staging` so the
migration history is contiguous and prod is reproducible from the branch being tagged.

## 3.2 Blocking: the E2E evidence does not cover the risky paths

**Torren's extension report** (`docs/audits/2026-07-24-live-extension-e2e.md`) landed during this
review. It is an honest, well-run report — and it is a **near-total coverage failure**, by its own
account. claude-in-chrome refuses to read or drive any `chrome-extension://` origin other than its
own, which blocks 100% of Tabatha's first-party pages: `home.html`, `settings.html`, `sidebar.html`,
`popup.html`, and everything routed through them — Devices, Team Activity, Task Sync, Live Preview,
Work Shifts, Logs, Tasks, backburner, What's New.

Actual result: **3 checks passed, 1 partial, 11 could-not-test** (`:41-59`). The three passes are all
content-script gatekeeper checks (renders on new tab; labels not `[object Object]`; no pre-render
flash). Everything else in the matrix is blocked. Torren also could not confirm **which build is
actually loaded in the browser** (`:29-31`) — 6.7.73 is repo source of truth, not a verified loaded
version. He correctly declined to resolve Malkio's live gatekeeper modal (no cleanup path) and touched
nothing in the account.

**Vail's web report** (`docs/audits/2026-07-24-live-web-e2e.md`) does not exist as of this writing.

So the charter's gate — a real manual smoke test — has not been met. Three green content-script checks
is not a smoke test of a 68-commit, 94-file promotion; it is the narrowest slice of the surface, and
the slice least likely to contain promotion risk. The charter says "Do not promote on a partial pass."
This is well short of partial.

Note also that the tooling gap is a **fleet-wide constraint**, not Torren's personal blocker — any
agent trying to validate extension surfaces tonight will hit the same wall. Until it is resolved
(Torren's options (a)/(b) at `:80-82`), no amount of additional agent-hours produces the evidence this
gate needs.

What the reports must actually cover before I sign off — evidence, not assertions:

1. **Pairing** end-to-end (mint → redeem → session), given §2.2 touches that exact path and T1 is
   redeploying `pair-watch` tonight.
2. **Auth and session** on a real signed-in account: sign-in, token refresh, sign-out, device-signout.
3. **The 058 lifecycle guard** under real revoke/re-register, since it is in this diff and the trigger
   is already live in prod.
4. **Invite redemption** on a *live 8-char* token — the post-059 shape, not a legacy 33-char one.
5. **Cross-surface sync** (extension ↔ Sidecar ↔ Context View), the charter's stated priority focus.
6. **Clock in/out and stint reconciliation**, given the `reconstructed` sessions visible in prod data.

Screenshots or artifacts per flow. A green build and passing unit tests are not evidence that these
paths work.

## 3.3 Non-blocking but material

- **F-EDGE-1 (`pair-watch`) is already live in production.** Promotion does not introduce it, but I
  am not willing to bless a production tag while a no-credential account-takeover path is open and
  unlogged. Fix or explicitly accept it, in writing, first.
- **Rollback path — partially adequate.** The enterprise channel retains prior CRXs, so the extension
  can be rolled back. But **the DB cannot**: 058/059/060 ship no down-migrations, and 060 in
  particular has already changed what data is reachable in production. Extension rollback does not
  undo an RPC grant. The rollback story is real for the client and absent for the backend.
- **Scope is otherwise clean.** I checked specifically: the org-hours UI is **not** on `staging`
  (`orgHours.js` / `TeamHoursView.jsx` absent — verified via `git ls-tree`). Verdict 1's UI does not
  reach production through this promotion. The only backend files in the diff are
  `disconnect-asana`, `invite-check`, and `058_*.sql`. I found nothing in the diff that
  independently should not reach production.

## 3.4 Verdict

**NO-GO tonight.** Not because the code looks bad — the diff itself is unremarkable and the scope is
clean — but because two of the promotion's preconditions are simply unmet: the repo does not describe
the database, and the extension is effectively untested (3 of 15 checks, none of them on the UI this
promotion changes) with the web report still outstanding.

I want to be explicit that this is **not** a judgement on Torren's or Vail's work — the extension
evidence gap is a tooling constraint, not an execution failure. But a gate is a gate. The absence of
evidence here is genuine absence, not a formality to be waived because the diff "looks fine."

**Promotion becomes GO when all of:**
1. 059 (+ 060 or its revert) is merged to `staging`; migration history contiguous and prod
   reproducible from the tagged commit.
2. Extension-surface testing is unblocked (cross-extension guard scoped to Tabatha's id, or
   `computer-use` at full tier) and both E2E reports cover §3.2's six paths with artifacts, passing
   clean — including confirmation of the actually-loaded build version.
3. `pair-watch` F-EDGE-1 is fixed, or explicitly accepted in writing by Malkio.
4. Verdict 1's mitigation is applied (the `REVOKE`) or 060 is remediated — because 060 is live in
   production *now*, regardless of what `main` says.

Conditions 1 and 2 are mechanical and could plausibly clear tonight. Condition 4 needs Malkio.

---

## Method note

All production queries were read-only `SELECT` / catalog reads via the Management API. The one
function-execution probe ran inside `BEGIN … ROLLBACK` under `SET LOCAL ROLE authenticated` with a
simulated JWT claim, and committed nothing. No writes, no schema changes, no secrets printed. The
recommended `REVOKE` in §1.7 was **not** executed — that is Malkio's decision.
