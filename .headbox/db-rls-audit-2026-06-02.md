# Tabatha Supabase RLS / Migration Audit — 2026-06-02

> **Scope:** static analysis of all 16 migrations (`supabase/migrations/001…016`).
> **Could NOT verify live DB state** — repo only contains the public anon key
> (`sb_publishable_…`); no service_role key / DB password / management token, and
> no Supabase MCP. To diff source-vs-live (orphaned policies, what's actually
> applied), provide a `postgresql://…` connection string OR service_role key.
> Project ref: `mtdgoahskcibjbhfvofx`.

---

## TL;DR
- **Today's two incidents are fully explained and repaired by migrations 015 + 016.**
- **Root villain = migration 012**, which *destructively replaced* policies from 001/010 — introducing the `profiles` recursion AND silently removing `browser_profiles` write access. That's the "migrations stepping on each other."
- **After 015 + 016 there is NO remaining RLS recursion** (verified by sweep).
- **One real security item** remains: `public.flux_time_entries` has RLS disabled (004).
- A few **by-design write-policy gaps** on team tables are fine *today* but are landmines if future UI adds direct inserts.

---

## ✅ FIXED (today's incidents)

| # | Bug | Introduced by | Fixed by |
|---|-----|---------------|----------|
| 1 | `profiles` infinite recursion (policy on profiles queried profiles) | 012 `"Managers see team profiles"` | **015** (SECURITY DEFINER helpers) |
| 2 | `org_members` self-recursion (`"Members see org roster"` queried org_members) | 001 | **015** |
| 3 | `organizations` recursion via org_members | 001 `"Members see own org"` | **015** |
| 4 | `browser_profiles` writes rejected ("new row violates RLS") | 012 dropped the FOR ALL policy, added SELECT-only | **016** (re-add INSERT/UPDATE/DELETE) |
| 5 | `browser_profile_status` read replaced | 012 dropped 010's read policy | **015** (non-recursive manager read; 010 writes intact) |

**Recursion sweep result:** the only self-referential policies in the whole schema were #1, #2, #3. All other policies reference *other* tables (mostly `profiles`), which is non-recursive once profiles' own policy is non-recursive. **Nothing else recurses.**

---

## ⚠️ REMAINING FINDINGS (ranked)

### A. [SECURITY — high] `public.flux_time_entries` has RLS DISABLED (migration 004)
- Table lives in the **`public`** schema (PostgREST-exposed by default) with `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **commented out** ("disabled for v1, anon key used by widget server").
- Risk: if `anon`/`authenticated` have table grants, anyone holding the **publishable key (shipped in the extension + the widget)** could read/write **all** workspaces' Asana time entries.
- **Do NOT blindly enable RLS** — the widget authenticates with the anon key, so enabling RLS without an auth model breaks it (that's why it was deferred pending "Asana OAuth user resolution").
- **Action before any public/tester release:** (1) confirm whether anon has grants on this table; (2) either move it behind an authenticated model + policies, restrict to `service_role` only, or stop exposing `public`. Ties directly to the pending **key/password rotation** (Tier-1).

### B. [Idempotency — medium] Migrations 001 & 002 are not re-runnable
- They use bare `CREATE TABLE` / `CREATE POLICY` (no `IF NOT EXISTS` / `DROP POLICY IF EXISTS`). 008/010/014/015/016 are idempotent.
- If the migration runner ever re-applies them, or runs the set against a partially-migrated DB, they **error** — a plausible explanation for how 008–013 got applied unevenly ("stepping on each other").
- **Action:** never re-run 001/002 against an existing DB; make all *future* migrations idempotent (drop-if-exists + create). Consider a one-time `supabase db diff` against a fresh shadow DB to confirm the live schema matches source.

### C. [By-design, verify before team features] SELECT-only policies on team tables
- `organizations`, `teams`, `org_members`, `team_members` have **SELECT-only** policies. Writes are meant to go through SECURITY DEFINER RPCs (`redeem_invite_token` 003, `create_invite_token` 012) which bypass RLS.
- **Verified:** client code only SELECTs these tables (`useAuth.js`, `TeamActivityPanel.jsx`); the one direct write — `invite_tokens.delete()` (revoke) at `TeamActivityPanel.jsx:206` — IS covered by `"Managers can manage tokens" FOR ALL`. ✓
- **Landmine:** the moment any future UI does a *direct* insert/update to organizations/teams/org_members/team_members (e.g. "create org from settings"), it will fail exactly like the browser_profiles bug. Route all such writes through SECURITY DEFINER RPCs.

### D. [Performance — low, optional] Per-row profile subquery in ~20 policies
- Most policies use `profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())`, re-evaluated per row.
- Supabase-recommended optimization (now available via 015): wrap as `(SELECT tabatha.current_profile_id())` so Postgres caches it as an initplan. Pure speed; not correctness. Candidate for a future "RLS perf pass" — but rewriting 20 policies should be validated against the live DB first.

### E. [Minor] `time_logs` has SELECT + INSERT only (no UPDATE/DELETE)
- Append-only assumption. Fine unless the client edits/deletes time_logs (it appears not to — superseded by `time_entries` / `clock_sessions`).

---

## Migration dependency integrity
Clean forward chain, no cycles: 002→001, 005→002, 012→{org_members,team_members}, 015→profiles, 016→015 (`current_profile_id()`). 011 (realtime publication) and 013 (unique index for companion/mobile rows) are idempotent and benign. The only integrity damage was 012's destructive policy replacement — repaired by 015+016.

---

## Recommended next steps
1. **Apply 016** (015 already applied). Then the `browser_profile_insert_failed` errors stop and multi-profile/team awareness works.
2. **Before team testers (BD-4):** make finding **A** (flux_time_entries RLS) a gated decision, and add a guardrail/PR-check that any new write to a team table goes through an RPC (finding C).
3. **Optional hardening:** make 001/002 idempotent in a consolidation note (finding B); RLS perf pass (finding D) — both validated against a shadow DB.
4. **To let an agent verify/repair the LIVE DB directly:** drop a `postgresql://…` connection string or service_role key into a gitignored `supabase/.env`; then a `supabase db diff` (or direct psql) can confirm the live policy set matches `001…016` and catch any orphaned/duplicate policies that ad-hoc dashboard edits may have left.
