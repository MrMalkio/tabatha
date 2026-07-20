# Epic 9 Design — Context View Customization (extension-side)

**Plan:** 040 (`sidecar_voice_timeline_tasks`) · Epic 9, Addendum 2 §D, Addendum 5 item 5
**Status:** DESIGN GATE — not assignable until Koda vets this doc (Addendum 5: *"Design-gated (Koda vet before build): Epic 3, Epic 9"*)
**Driver:** Dex · **Owner:** CeeCee
**Extension version at write time:** 6.5.0 (this worktree's stale base — **build must NOT branch from here**, see §3.4) · **Sidecar at write time:** v0.2.1
**Asana task:** [1216679003590382](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216679003590382)

---

## 0. Why this gate exists

Koda's vet of Plan 040 (Addendum 5, item 5):

> Epic 9: scope corrected — this adds the extension's **first-ever**
> `profiles.settings` write path. Both surfaces must write **distinct
> top-level JSONB keys, never blind whole-object updates** (per-key
> `jsonb_set` RPC preferred) to kill the read-modify-write race with the
> Sidecar's writer.

Confirmed by reading the code directly:

- **`src/settings/index.jsx`** (extension) has zero `profiles.settings` writes
  today. Its one `profiles` table write is `handleSaveDisplayName`
  (line ~587-596): `supabase.schema('tabatha').from('profiles').update({ display_name, updated_at })`
  scoped by `.eq('id', profile.id)` — a **scalar column**, not JSONB, and
  already schema-qualified + `.select()`-verified (a good pattern to reuse,
  see §3.2). Every other extension setting lives in
  `chrome.storage.local` via `useChromeStorage('settings', {})` — nothing
  reaches Supabase at all except that one scalar field.
- **`src/background/services/syncService.js`** — grepped every `.from('...')`
  call: `profiles`, `browser_profiles`, `calendars`, `calendar_events`,
  `intent_history`. No settings write. Confirms Koda's finding: Epic 9 is
  genuinely the first time the extension will write into
  `profiles.settings`.
- **Sidecar already has the exact bug class Koda is warning about.**
  `sidecar/src/context/AuthContext.tsx` has two settings writers, both doing
  a **client-side read-modify-write of the entire JSONB column**:

  ```ts
  // saveSidecarSettings
  const nextSettings = {
    ...(profile.settings || {}),
    sidecar: { ...(profile.settings?.sidecar || {}), ...patch },
  };
  await supabase.from('profiles').update({ settings: nextSettings }).eq('id', profile.id);

  // saveChaperoneSettings — same shape, different top-level key
  const nextSettings = {
    ...(profile.settings || {}),
    chaperone: { ...(profile.settings?.chaperone || {}), ...patch },
  };
  await supabase.from('profiles').update({ settings: nextSettings }).eq('id', profile.id);
  ```

  Both read `profile.settings` out of **client-held React state** (whatever
  was last fetched into `AuthContext`), splice in one top-level key, then
  `UPDATE ... SET settings = <entire object>`. Today this is "merely" a
  same-surface race (two calls in flight from one Sidecar tab). The moment
  the extension gets its own writer (Epic 9), it becomes a **cross-surface**
  race: if the extension fetches `profile.settings`, the Sidecar writes
  `chaperone` in between, and the extension's `contextView` patch lands
  computed from its stale snapshot, the extension's write **silently
  clobbers the Sidecar's `chaperone` update** — because the extension's
  `nextSettings` was built without it. This is exactly my own Epic 8 doc's
  finding at a *sub-key* level (§2.5 there: a shallow merge at the
  `sidecar` key can drop sibling *sub*-keys like `nudges.blockStart`); this
  doc is the same defect one level up, at the *top-level-key* level, now
  made real by having two separate processes doing it.

This design fixes the mechanism once (§1) rather than adding Epic 9 as a
third read-modify-write client, then defines the actual `contextView`
schema (§2), the extension UI (§3), the Sidecar's read-side precedence (§4),
and phasing (§5).

---

## 1. The safe write mechanism

### 1.1 Why `jsonb_set` per top-level key, not a bigger rewrite

The two existing writers are correct in spirit (top-level keys are already
supposed to be independent — `sidecar` vs `chaperone`) but wrong in
mechanism (they compute the "other" keys from a client-side snapshot instead
of letting Postgres merge server-side). The fix is **not** a new settings
table or a normalized schema — that's a bigger migration than this problem
needs, and `profiles.settings JSONB` is already the established pattern
(organizations.settings uses the same shape). The fix is: stop computing the
merge in JS: have Postgres do `jsonb_set(settings, '{key}', patch, true)`
inside a single `UPDATE`, which is atomic and race-free *by construction* —
two concurrent calls updating different top-level keys (or even the same
key) each see the DB's current value at their own transaction time, not a
stale client fetch.

### 1.2 RPC signature

```sql
-- Migration 035_update_profile_settings_rpc.sql
CREATE OR REPLACE FUNCTION tabatha.update_profile_settings(
  p_key   TEXT,   -- top-level settings key, e.g. 'contextView', 'sidecar', 'chaperone'
  p_patch JSONB   -- shallow-merged INTO settings->p_key (not a blind replace of the sub-object either — see 1.3)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id UUID;
  v_allowed    CONSTANT TEXT[] := ARRAY['sidecar', 'chaperone', 'contextView'];
  v_next       JSONB;
BEGIN
  IF p_key IS NULL OR NOT (p_key = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown settings key: ' || coalesce(p_key, 'null'));
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_patch must be a JSON object');
  END IF;

  SELECT id INTO v_profile_id FROM tabatha.profiles WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No profile for authenticated user');
  END IF;

  -- Atomic, server-side merge: jsonb_set on the top-level key (creating it if
  -- absent, `true` = create_missing), merged one level deep with `||` so a
  -- patch of {contextView: {showTimeline: false}} does NOT drop sibling
  -- sub-keys already at settings.contextView.* — same class of bug as the
  -- Epic 8 nudges caveat, fixed here at the DB layer instead of trusting
  -- every future client author to hand-roll the spread correctly.
  UPDATE tabatha.profiles
     SET settings = jsonb_set(
           coalesce(settings, '{}'::jsonb),
           ARRAY[p_key],
           coalesce(settings -> p_key, '{}'::jsonb) || p_patch,
           true
         ),
         updated_at = now()
   WHERE id = v_profile_id
  RETURNING settings -> p_key INTO v_next;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', v_next);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.update_profile_settings(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.update_profile_settings(TEXT, JSONB) TO authenticated;
```

Follows the exact `create_organization` precedent (migration 020):
`SECURITY DEFINER`, `SET search_path = ''`, fully schema-qualified body,
caller resolved via `auth.uid()` (not a passed-in profile id — closes the
"pass someone else's profile id" hole), `REVOKE ALL ... GRANT ... TO
authenticated`. RLS on `tabatha.profiles` (migration 001: `FOR ALL USING
(auth_user_id = auth.uid())`) already scopes direct table access; this RPC
is `SECURITY DEFINER` specifically so it can do the `jsonb_set` merge
server-side in one statement — a plain client-side `.update()` can't express
"merge this key" without first reading, which is the exact race being
closed.

**Allow-list, not a free-form key.** `v_allowed` hardcodes the three known
top-level keys. Rejects typos and prevents either surface from silently
creating stray keys nobody reads. Adding a new top-level settings key later
is a one-line array edit in a follow-up migration, not a schema change.

**One-level-deep merge (`||`), not a deep/recursive merge.** Postgres's
`jsonb` `||` operator only merges at the top level of the two objects being
combined — for `contextView`, that means a patch of `{showTimeline: false}`
correctly preserves sibling keys like `showDayCountdown` (both are keys
*directly under* `contextView`), but if `contextView` ever grows a *nested*
object member (e.g. a hypothetical `contextView.layout: {mode, density}`),
a patch of `{layout: {density: 'compact'}}` would still **replace** the
whole `layout` sub-object, same failure shape one level deeper. Given §2's
schema is intentionally flat (every customization is a scalar directly under
`contextView`), this doesn't bite today — flagged for whoever adds the first
nested member.

### 1.3 Migrating the Sidecar's two existing writers onto the RPC

`sidecar/src/context/AuthContext.tsx` — replace both bodies:

```ts
const saveSidecarSettings = useCallback(
  async (patch: Record<string, any>) => {
    if (!profile) return;
    const { data, error } = await supabase
      .rpc('update_profile_settings', { p_key: 'sidecar', p_patch: patch });
    // sidecar's supabase client is pre-scoped `db: { schema: 'tabatha' }`
    // (sidecar/src/lib/supabase.ts:23) — no .schema('tabatha') needed here,
    // unlike the extension's default client (see §3.2).
    if (!error && data?.success) {
      setProfile({ ...profile, settings: { ...(profile.settings || {}), sidecar: data.value } });
    }
  },
  [profile]
);
```

Same shape for `saveChaperoneSettings` with `p_key: 'chaperone'`. This is a
small, mechanical, low-risk change (same call sites, same callers, same
`Profile['settings']` shape returned to `setProfile`) — bundle it into
Epic 9's v1 rather than a separate epic, since it's the other half of
closing the race this doc exists to fix; shipping the RPC without migrating
the existing writers leaves the race half-closed (extension safe, Sidecar
still doing read-modify-write against the same column).

---

## 2. The `settings.contextView` schema

Read from `ContextView.tsx` what's *actually* wired today (not aspirational):
`dayResetHour` and `focusAwayImmediate` already live under
`settings.sidecar` (lines 62, 64); `showCheckpoints` also under
`settings.sidecar` (line 65, default-on when absent). `chaperone` is its own
top-level key already (`settings.chaperone`, read at line 87). Nothing today
gates the day-countdown bar, the "UP NEXT" queue list, or the bottom
timeline — they always render when their data exists. Layout is a single
hardcoded "v2" (no `v1` code path exists to select between — Epic 6 replaced
v1 outright).

Given that, `contextView` is a **new, focused top-level key** holding only
the display toggles that don't already have a home, plus **aliases** for the
two that currently live under `sidecar` (§2.1 explains why they move):

```json
"settings.contextView": {
  "showDayCountdown": true,
  "showUpNext": true,
  "showTimeline": true,
  "showCheckpoints": true,
  "dayResetHour": 0,
  "focusAwayImmediate": false,
  "layout": "v2"
}
```

| Key | Type | Default | Wires to (ContextView.tsx) |
|---|---|---|---|
| `showDayCountdown` | bool | `true` | new gate around the `dayBox` element (bar, right side) — currently always rendered |
| `showUpNext` | bool | `true` | new gate around the `queue.filter(...)` "UP NEXT" block (titleCol) — currently always rendered when non-empty |
| `showTimeline` | bool | `true` | new gate around `<FocusTimeline .../>` — currently rendered whenever `cf && dur > 0` |
| `showCheckpoints` | bool | `true` | **existing** `settings.sidecar.showCheckpoints`, moved (§2.1) |
| `dayResetHour` | number (0-23) | `0` | **existing** `settings.sidecar.dayResetHour`, moved (§2.1) |
| `focusAwayImmediate` | bool | `false` | **existing** `settings.sidecar.focusAwayImmediate`, moved (§2.1) |
| `layout` | enum `'v1'\|'v2'` | `'v2'` | reserved — no `v1` renderer exists yet; included now so the schema doesn't need a breaking shape change if/when a compact layout ships. Extension UI can hide this control until a `v1` exists (§3.3). |

Deliberately **not** included: `chaperone` (already its own top-level key,
Addendum 4 confirmed this split — not folding it into `contextView`) and
"colors/intensity" (Addendum 2 §D mentions "colors/intensity" but
`ContextView.tsx` has no theme/intensity concept in code today — no toggle
exists to expose; flagged as an open question, §6).

### 2.1 Why `dayResetHour`/`focusAwayImmediate`/`showCheckpoints` move from `sidecar` to `contextView`

They're Context-View-specific display settings that happen to have been
bootstrapped under the `sidecar` key because `contextView` didn't exist yet
when Epic 0/2 shipped them. Leaving them split (some CV settings under
`sidecar`, new ones under `contextView`) means every future reader has to
know the split by memory. Moving them under the new key is the right shape
long-term, but it's also the ONE place this design touches existing data —
handled via a read-side compat shim (§4.2) so no destructive migration is
required and old clients don't break mid-rollout.

### 2.2 Sidecar-only users are a first-class persona (Addendum 2 §B)

Every key in the table above has a hardcoded default matching current
behavior (all toggles default `true`/on, matching "always render" today).
A profile with **no `contextView` key at all** — true for every existing
user before this ships, and for any Sidecar-only user who never touches the
extension — renders identically to today. Nothing in Epic 9 requires the
extension to have run even once.

---

## 3. Extension-side UI

### 3.1 Where it lives

New section in `src/settings/index.jsx`'s `SECTIONS` array (line 84-107),
inserted near the other display-oriented sections (after `'clock'`, before
`'focus'` — Context View is a display/output surface like FlipClock, not a
behavior engine like Focus Lifecycle):

```js
{ id: 'contextview', label: '📺 Context View' },
```

...with a corresponding `activeSection === 'contextview' && (...)` render
block following the existing pattern (each section is a plain conditional
block inside the `<motion.div key={activeSection}>` wrapper, e.g. the
`'clock'` block at line ~1334, the `'lifecycle'` block delegating to
`FocusLifecyclePanel` at line ~1431). Given this section needs its own
async load/save lifecycle (Supabase, not `chrome.storage.local`) rather than
the synchronous `updateSetting()` helper every other section uses, model it
as a dedicated component — `ContextViewPanel` — following the
`FocusLifecyclePanel({ settings, updateSetting })` extraction pattern
(line 358) but with its own local state instead of taking `updateSetting`
as a prop, since it isn't writing to `chrome.storage.local` at all.

### 3.2 Read + write via the RPC

```js
// src/settings/ContextViewPanel.jsx (new file, mirrors UrlRulesSection.jsx's
// existing pattern of a self-contained settings sub-panel imported into index.jsx)
import { supabase } from '../services/supabaseClient';

async function loadContextView(profileId) {
  const { data, error } = await supabase
    .schema('tabatha')
    .from('profiles')
    .select('settings')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.settings?.contextView || {};
}

async function saveContextView(patch) {
  const { data, error } = await supabase
    .schema('tabatha')
    .rpc('update_profile_settings', { p_key: 'contextView', p_patch: patch });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Save failed');
  return data.value;
}
```

`.schema('tabatha')` is required here (unlike the Sidecar's RPC call, §1.3)
because the extension's default `supabase` client from
`src/services/supabaseClient.js` is not pre-scoped to the `tabatha` schema —
confirmed by every existing RPC call site in that file
(`redeem_invite_token`, `create_organization`, `create_invite_token`, all
`.schema('tabatha').rpc(...)`) and by `handleSaveDisplayName`'s
`.schema('tabatha').from('profiles')` in `settings/index.jsx`. Follow the
same `.select()`-verification + timeout-race pattern that
`handleSaveDisplayName` already uses (lines 594-601) rather than trusting a
silent 0-row response — same "RLS/stale-JWT silently drops the write"
failure mode applies here.

`ContextViewPanel` needs `profile`/`session` — check how `FocusLifecyclePanel`
and friends currently get auth context (likely via the `useAuth()`-style
hook already wired into `Settings()` at line 525, or props threaded down)
and follow that exact pattern rather than inventing a second auth path.

### 3.3 UI shape

Simple toggle list matching the existing `Toggle` component (line 109) and
`fieldRow`/`fieldLabel` styles already used throughout `index.jsx` — no new
UI primitives needed:

- Section header: "Context View — controls what shows on a paired TV/3rd
  screen running the Sidecar's Context View."
- Toggle rows: Day countdown, Up next, Timeline, Checkpoint preview (label:
  "Show last checkpoint"), Fade speed for phone-away (radio or toggle:
  "Immediate" vs "Slow fade" — maps to `focusAwayImmediate`), Day reset hour
  (existing numeric/select input style, 0-23).
- `layout` control **hidden** until a second layout value actually exists in
  code (§2, `'v1'` reserved but unbuilt) — shipping a dropdown with one
  option is worse than no control.
- Empty/loading state while `loadContextView` is in flight; disable toggles
  during save (same debounce/spinner conventions as nearby async panels,
  e.g. `DesktopActivityPanel`'s `statusMsg`/confirm-flag pattern at line 126).
- Not gated on Sidecar sign-in status in the extension — the extension has
  its own Supabase session (Sync & Account section) independent of whether
  the *phone* has ever signed into the Sidecar; if the extension's own
  Supabase session is absent, show "Sign in (Sync & Account) to customize
  the Context View" instead of the panel, matching how `UrlRulesSection`-style
  panels already gate on `isSignedIn` elsewhere in `index.jsx`.

### 3.4 Build constraint (binding, from Addendum 2 §A + §D)

**This section must be implemented from the current extension line
(6.7.24+/6.8.2 lineage), never from this worktree's stale 6.5.0 base, and
never from the sidecar branch.** Per the project's build/load constraint
(AGENTS.md): create a **fresh worktree** off the current staging/feature
line (run `git worktree list` and check each candidate's
`public/manifest.json` version first — Addendum 2 §A's version table is
already stale by the time anyone reads this, re-survey at build time), do
the `src/settings/index.jsx` + new `ContextViewPanel.jsx` + migration 035
work there, build, and mirror `dist/` into the fixed Chrome-load path per
the documented copy procedure. This doc's diffs above are illustrative
(line numbers/patterns from this worktree's snapshot of `index.jsx`) — the
build agent must re-locate the actual insertion points in the current line's
`index.jsx`, which may have shifted.

---

## 4. Sidecar read path

`ContextView.tsx` already reads three of these settings directly off
`profile.settings.sidecar.*` (§2, table). Once `contextView` exists as its
own key, the read path needs a **precedence + compat shim** so:
(a) a profile with only legacy `settings.sidecar.*` values (every existing
user, day one) keeps working, (b) a profile with the new `contextView` key
(post-Epic-9 extension write) is authoritative, (c) a profile with neither
gets the hardcoded defaults (§2.2).

### 4.1 Precedence

`contextView` key > legacy `sidecar` keys > hardcoded defaults.

### 4.2 Compat shim

Add one small helper, colocated with the other pure display-logic helpers in
`sidecar/src/data/focus.ts` (or a new `sidecar/src/lib/contextViewSettings.ts`
if `focus.ts` is focus-data-specific and this doesn't belong there —
resolve at implementation time by checking `focus.ts`'s actual scope):

```ts
export const DEFAULT_CONTEXT_VIEW_SETTINGS = {
  showDayCountdown: true,
  showUpNext: true,
  showTimeline: true,
  showCheckpoints: true,
  dayResetHour: 0,
  focusAwayImmediate: false,
  layout: 'v2' as const,
};

export function resolveContextViewSettings(settings: Record<string, any> | undefined) {
  const cv = settings?.contextView || {};
  const legacySidecar = settings?.sidecar || {};
  return {
    ...DEFAULT_CONTEXT_VIEW_SETTINGS,
    // legacy sidecar.* values apply BEFORE contextView so contextView always wins when both are set
    dayResetHour: legacySidecar.dayResetHour ?? DEFAULT_CONTEXT_VIEW_SETTINGS.dayResetHour,
    focusAwayImmediate: legacySidecar.focusAwayImmediate ?? DEFAULT_CONTEXT_VIEW_SETTINGS.focusAwayImmediate,
    showCheckpoints: legacySidecar.showCheckpoints ?? DEFAULT_CONTEXT_VIEW_SETTINGS.showCheckpoints,
    ...cv,
  };
}
```

This exact `{...defaults, ...legacy-mapped, ...new}` layering mirrors the
`mergeSettings`/`DEFAULT_CHAPERONE_SETTINGS` precedent already in
`sidecar/src/lib/chaperone.ts` (lines 19-23, 40-42) — same shape, proven
pattern, not a new idiom.

`ContextView.tsx` then replaces its scattered inline reads:

```ts
// before (lines 62, 64-65):
const resetHour = profile?.settings?.sidecar?.dayResetHour ?? 0;
const immediateAlert = !!profile?.settings?.sidecar?.focusAwayImmediate;
const showCheckpoints = profile?.settings?.sidecar?.showCheckpoints !== false;

// after:
const cv = resolveContextViewSettings(profile?.settings);
const resetHour = cv.dayResetHour;
const immediateAlert = cv.focusAwayImmediate;
const showCheckpoints = cv.showCheckpoints;
// + new gates:
// {cv.showDayCountdown && <View style={styles.dayBox}>...}
// {cv.showUpNext && queue.filter(...).length > 0 && <View style={styles.next}>...}
// {cv.showTimeline && cf && dur > 0 && <FocusTimeline .../>}
```

No data migration needed server-side — the shim does the reconciliation at
read time, forever (or until a follow-up decides to backfill/retire the
legacy `sidecar.*` trio, which is out of scope here and not urgent since the
shim costs nothing).

---

## 5. Phasing

| Version | Scope | Depends on |
|---|---|---|
| **v1** | Migration 035 (`update_profile_settings` RPC) + Sidecar's two writers migrated onto it (§1.3) + extension `ContextViewPanel` (read+write via RPC, §3) + Sidecar `resolveContextViewSettings` read shim + new gates in `ContextView.tsx` (§4) | This design doc approved by Koda; extension build happens from a **fresh worktree off the current staging/6.7.24+ line**, never this branch |
| **v2** | Live-preview from the extension — e.g. a small embedded preview of the Context View inside the Settings panel that reflects toggle changes before save, or a "push to paired screen now" affordance | v1 shipped and in use; needs its own design pass (realtime channel reuse vs a dedicated preview render path) |

Each version is additive to the `contextView` JSONB shape — no schema churn
between phases (same pattern Epic 8 committed to for `push_log`).

---

## 6. Open questions for Koda's vet

1. **RPC allow-list vs free-form key.** §1.2 hardcodes
   `['sidecar', 'chaperone', 'contextView']` in the RPC. Is a hardcoded
   allow-list the right call (safe, but means every *future* top-level
   settings key needs a migration to add to the array), or should the RPC
   accept any key and rely on RLS + the schema-level `settings` column type
   alone? Leaning toward keeping the allow-list — the cost of a one-line
   migration per new key is small next to the guardrail against either
   surface accidentally inventing a stray key.
2. **`dayResetHour`/`focusAwayImmediate`/`showCheckpoints` relocation
   (§2.1).** Moving these from `settings.sidecar` to `settings.contextView`
   is a shape change covered by a read-side compat shim (§4.2), not a
   write-side data migration — is that the right call, or should Epic 9
   instead do a one-time backfill (copy the three keys from `sidecar` into
   `contextView` for existing profiles, then have the Sidecar stop reading
   the legacy path once backfilled)? Leaning toward the shim (no migration
   risk, works for profiles created before AND after this ships), but a
   backfill would let the codebase drop the shim sooner.
3. **"Colors/intensity" from Addendum 2 §D's Epic 9 description** — no such
   concept exists in `ContextView.tsx` today (confirmed by reading the file;
   `colors`/`accent` are derived from focus state — over/on-break/normal —
   not a user-configurable theme). Is this scoped out of Epic 9 v1 entirely
   (nothing to build against), or does it imply a **new** feature (a
   selectable accent/intensity theme) that should get its own line in §2's
   schema now even though nothing reads it yet? Leaning toward scoping it
   out of v1 — speculative schema for a UI that doesn't exist yet risks
   guessing the wrong shape.

---

## Recommendation summary

- **Write mechanism:** new `tabatha.update_profile_settings(p_key, p_patch)`
  SECURITY DEFINER RPC (migration 035) doing an atomic, server-side
  `jsonb_set` + one-level `||` merge per top-level key — replaces both of the
  Sidecar's existing client-side read-modify-write writers (§1.3) and is the
  extension's only way in (§3.2). Closes the cross-surface race Koda
  flagged before it can ever manifest, rather than adding Epic 9 as a third
  copy of the same bug.
- **Schema:** new `settings.contextView` key, 7 fields, all defaulting to
  today's always-on behavior (§2) — three of them (`dayResetHour`,
  `focusAwayImmediate`, `showCheckpoints`) relocate from `settings.sidecar`
  via a read-side compat shim (§4.2), not a data migration.
- **Extension UI:** new `📺 Context View` section in `src/settings/index.jsx`
  (`ContextViewPanel.jsx`), toggle list, RPC-backed — **must be built from a
  fresh worktree off the current extension line, never this sidecar branch**
  (Addendum 2 §A rule 2, reaffirmed in Addendum 5's delegation structure).
- **Top risk / biggest open question:** whether the three relocated keys
  should get a real backfill instead of living behind a compat shim forever
  (§6 item 2) — low urgency, doesn't block v1 either way.

---

## CeeCee vet rulings (2026-07-18, gate cleared — PROCEED)

Koda's Epic 3/8 vet established the constraints this design follows; ruling on
the open items directly:
1. **§6.1 key allow-list:** hardcoded (`sidecar`,`chaperone`,`contextView`) —
   extend only by migration. Safer surface.
2. **§6.2 relocated keys:** compat shim for v1, NO backfill now; a backfill
   migration is a candidate once the extension UI ships and the shim proves out.
3. **§6.3 colors/intensity:** OUT of v1 — no such concept exists in
   ContextView today (YAGNI).
4. **Migration number correction:** Epic 9's migration is **038** (Koda's
   assignment table: 035=Epic 3, 036/037=Epic 8; the doc's "035" was written
   before that table landed).
