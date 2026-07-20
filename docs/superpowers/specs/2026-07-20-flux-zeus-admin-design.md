# Flux Argus — Super-Admin Management Dashboard for the Flux Ecosystem (Design)

**Status:** DESIGN GATE — for Koda vet before any build task is assigned
**Driver:** Malkio · **Owner:** Dex
**Template studied:** `SS-App/Zeus-Control` (SteadyStars god-mode config console)
**Extension version at write time:** 6.8.2 (dist) / 6.7.22 (prod) · **Sidecar at write time:** v0.9.2
**Asana task:** [1216679341518745](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216679341518745)

---

## 0. Codename

**Argus** — the all-seeing giant of Greek myth, covered in a hundred eyes, set to watch over
what matters most. Zeus configures one product family (SteadyStars); Argus watches **five
surfaces at once** (extension, sidecar, watch, companion, Context View) across the whole Flux
ecosystem. Same mythological family as Zeus (signals "sibling app," not "competitor"), distinct
enough not to collide with SteadyStars' internal tool name.

Repo: `flux-argus`. Product noun in code/docs: "Argus" or "the Argus console." Never "admin
panel" in user-facing strings anywhere outside Argus itself (per `feedback_hide_backend_names_in_ui.md`
— Argus is an internal tool, this rule governs Tabatha/Sidecar UI, not the console itself, but
Argus must still never leak "Supabase" into any Argus-authored copy that could round-trip into
a user-facing surface, e.g. audit log summaries).

---

## 1. Scope

The Flux/Tabatha ecosystem, not just the extension:

| Surface | What it is | Auth today |
|---|---|---|
| Extension | Chrome MV3, `src/` | `tabatha.profiles` via Supabase Auth |
| Sidecar | Expo RN-Web, `sidecar/` at tabatha.pondocean.co/sidecar | same `profiles` row, Google + magic link |
| Watch | Tabby Watch (native, in progress per 2026-07-18 design doc) | same `profiles` row (pairing codes, mig 040) |
| Companion | Desktop window-monitor (Tauri), local WS bridge | tied to a `browser_profiles` install row, no independent auth |
| Context View | Landscape kiosk mode inside Sidecar (`/sidecar`, mig 033 realtime) | rides the Sidecar session |

One `profiles` row is the identity anchor across every surface (mig 017 `browser_profiles` +
mig 045 device management already establish "one profile, many devices/installs"). Argus is
built on that: **permissions are per-profile first**, with an optional org layer — the inverse
of Zeus, which is account-first with no user layer yet (Zeus's own documented gap, `01-zeus-
architecture.md` §9). Malkio's four asks map directly:

1. Per-user settings accessibility → `feature_permissions` keyed on `profile_id`.
2. Feature availability flags → `feature_inventory` + `feature_permissions.can_see/read/write`.
3. Free/pro plan templates → `plan_templates` + `plan_template_features`.
4. Org-creation capability → `feature_key = 'org_create'`, a normal `feature_permissions` row
   (see §2.3 — deliberately **not** a separate concept).

`profiles.account_type` (`standard | demo`, mig 044) is folded in as an input to which plan
template a profile resolves to by default (§5), and as a candidate axis for capability
defaults (e.g. demo accounts and `org_create` — flagged as an open question, §7).

---

## 2. Data model (schema `tabatha`, migrations 046+)

Verified next-free migration number: `045_device_management.sql` is the highest on disk, so
this proposal claims **046–049**. Four migrations, each independently reviewable:

| # | File | Contents |
|---|---|---|
| 046 | `feature_inventory_and_permissions.sql` | `feature_inventory`, `feature_permissions`, RLS |
| 047 | `plan_templates.sql` | `plan_templates`, `plan_template_features`, `profiles.plan_template`, seed free/pro rows |
| 048 | `feature_permission_audit_log.sql` | audit table, service-role-only RLS (mirrors mig 019 owner-view pattern) |
| 049 | `effective_permissions_rpc.sql` | `tabatha.get_effective_permissions()` — the one resolver every client calls |

### 2.1 `tabatha.feature_inventory`

The catalog — every gateable thing across every surface, real, seeded (not mock).

```sql
CREATE TABLE tabatha.feature_inventory (
  feature_key   TEXT PRIMARY KEY,               -- e.g. 'asana_sync', 'org_create'
  label         TEXT NOT NULL,
  domain        TEXT NOT NULL CHECK (domain IN
                   ('extension','sidecar','watch','companion','context_view','ecosystem','capability')),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  constraints   JSONB NOT NULL DEFAULT '{}',      -- e.g. {"kind":"numeric_limit","default":3}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`domain = 'capability'` is how `org_create` and future non-UI toggles (rate limits, device
caps) live in the same table as UI-gated features — see §2.3.

### 2.2 `tabatha.feature_permissions`

Per-user first. An org-level row is a *separate row* with `profile_id NULL`, not a second
table — the resolver (§2.5) checks user-row, then org-row, then plan template, in that order.

```sql
CREATE TABLE tabatha.feature_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES tabatha.feature_inventory(feature_key),
  can_see       BOOLEAN NOT NULL DEFAULT true,
  can_read      BOOLEAN NOT NULL DEFAULT true,
  can_write     BOOLEAN NOT NULL DEFAULT true,
  display_state TEXT CHECK (display_state IN ('coming_soon','locked','beta') OR display_state IS NULL),
  constraints   JSONB NOT NULL DEFAULT '{}',        -- overrides feature_inventory.constraints, e.g. {"limit":10}
  source        TEXT NOT NULL CHECK (source IN
                   ('plan_template','admin_override','promo','pilot','beta_program',
                    'default_seed','billing_writer')),
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((profile_id IS NOT NULL) <> (org_id IS NOT NULL))  -- exactly one scope per row
);

CREATE UNIQUE INDEX feature_permissions_user_uniq
  ON tabatha.feature_permissions (profile_id, feature_key) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX feature_permissions_org_uniq
  ON tabatha.feature_permissions (org_id, feature_key) WHERE org_id IS NOT NULL;
```

**Downward-inheritance rule** (mirrors Zeus's GHL principle, §3 of `01-zeus-architecture.md`):
a user-level row must never grant *more* than the org-level row that would otherwise apply to
that profile. Zeus enforces this in the admin UI, not a DB constraint (its own doc leaves this
an open question, unresolved) — Argus does the same in v1: the console's write path validates
before upsert, no DB trigger. Flagged for Koda: worth a DB-level check in v2 once real abuse
patterns exist, not before.

`billing_writer` is a real enum value with **no writer yet** — see §6, this is Zeus's own
"source field ready for a future billing writer" pattern, copied deliberately.

### 2.3 Capabilities are `feature_permissions` rows, not a separate concept

Argued and resolved: **unify**. `org_create` is a row in `feature_inventory` with
`domain = 'capability'`, and a normal `feature_permissions` row with `can_write` meaning "may
call `tabatha.create_organization`." No parallel `capabilities` table. Reasons:
- One resolver (§2.5), one audit trail, one console page instead of two.
- Zeus itself treats "ghost feature" gating and "tier limit" gating identically (§18 vs §5 of
  its hardcoded-variables inventory) — the precedent already blurs this line.
- The only thing capabilities need that features don't is sometimes a *number* instead of a
  boolean (e.g. `multi_device_limit`) — solved by `constraints JSONB` on both tables, not a
  new concept.

### 2.4 `tabatha.plan_templates` + `tabatha.plan_template_features`

Real, seeded rows — not mock, per the anti-pattern list.

```sql
CREATE TABLE tabatha.plan_templates (
  slug        TEXT PRIMARY KEY,                 -- 'free' | 'pro'
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tabatha.plan_template_features (
  plan_slug     TEXT NOT NULL REFERENCES tabatha.plan_templates(slug) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES tabatha.feature_inventory(feature_key),
  can_see       BOOLEAN NOT NULL DEFAULT true,
  can_read      BOOLEAN NOT NULL DEFAULT true,
  can_write     BOOLEAN NOT NULL DEFAULT true,
  display_state TEXT CHECK (display_state IN ('coming_soon','locked','beta') OR display_state IS NULL),
  constraints   JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (plan_slug, feature_key)
);

ALTER TABLE tabatha.profiles
  ADD COLUMN plan_template TEXT NOT NULL DEFAULT 'free' REFERENCES tabatha.plan_templates(slug);
```

Deliberate build choice, different from Zeus's write-on-event pattern: **plan templates are
resolved at read time, not materialized onto every profile.** Editing `pro`'s feature set in
Argus takes effect instantly for every pro profile on next read — no backfill job, no missed
row. `feature_permissions` rows stay reserved for the cases that need a durable, per-profile
row: admin overrides, timed promos, and eventually real billing writes.

### 2.5 The resolver — one precedence order, everywhere

For a given `(profile_id, feature_key)`:

1. User-level `feature_permissions` row (`profile_id` matches) — highest precedence.
2. Org-level `feature_permissions` row (`org_id` = profile's `default_org_id`), if the user
   row's inheritance ceiling isn't violated (§2.2).
3. `plan_template_features` for the profile's `plan_template`.
4. **Default-allow** — `can_see/read/write = true`, no `display_state` — for any `feature_key`
   with no row anywhere. This is the "nothing breaks on day one" guarantee: ship the schema
   before every feature is cataloged, and uncataloged features stay fully open until someone
   deliberately adds a row. Flip to default-deny is a **per-feature** decision (add the row),
   never a global switch.

### 2.6 `tabatha.feature_permission_audit_log`

Every write, always (Zeus's own resolved decision, §9 open-questions row 3 — copied verbatim).

```sql
CREATE TABLE tabatha.feature_permission_audit_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id   UUID REFERENCES tabatha.profiles(id),   -- Argus admin, if resolvable
  actor_email        TEXT NOT NULL,                          -- always captured, even pre-profile-link
  target_profile_id  UUID REFERENCES tabatha.profiles(id),
  target_org_id      UUID REFERENCES tabatha.organizations(id),
  feature_key        TEXT NOT NULL,
  action              TEXT NOT NULL,                          -- create_override | update_override | delete_override
  before_value        JSONB,
  after_value         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: `REVOKE ALL FROM PUBLIC, authenticated, anon; GRANT SELECT, INSERT TO service_role` —
identical shape to mig 019's owner-read views. No client, ever, sees this table.

---

## 3. Client contract

One `usePermission(key)` (or surface-native equivalent) per surface, all calling the **same**
RPC — not raw table reads merged client-side, so precedence logic (§2.5) lives in exactly one
place.

```sql
CREATE OR REPLACE FUNCTION tabatha.get_effective_permissions(p_feature_keys TEXT[] DEFAULT NULL)
RETURNS TABLE (feature_key TEXT, can_see BOOLEAN, can_read BOOLEAN, can_write BOOLEAN,
               display_state TEXT, constraints JSONB, source TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ /* resolves for auth.uid()'s own profile only — never accepts a target profile_id */ $$;

REVOKE ALL ON FUNCTION tabatha.get_effective_permissions(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.get_effective_permissions(TEXT[]) TO authenticated;
```

SECURITY DEFINER but scoped hard to `auth.uid()` — functionally equivalent to an RLS-gated
`SELECT`, just centralizing the three-way precedence merge server-side so no client
reimplements it. Plain `SELECT` RLS on `feature_permissions` still exists underneath
(`profile_id = tabatha.current_profile_id() OR org_id = <my org>`) as defense in depth.

| Surface | File | Notes |
|---|---|---|
| Sidecar | `sidecar/src/hooks/usePermission.ts` + `sidecar/src/data/permissions.ts` | Cached in a context provider, same shape as `useFocus`; first consumer wired into the Settings screen. |
| Extension | `src/services/permissionService.js` | Matches `installIdentity.js`/`orgAttribution.js` shape; fetches once at background init, broadcasts via the existing message bus to popup/sidebar/InBar. |
| Watch | *(doc note only — codebase not in this worktree)* | Same RPC contract; whoever builds the native client reads `get_effective_permissions` the same way. |
| Companion | *(not applicable v1)* | No independent Supabase Auth session (§1) — inherits gating from the paired browser profile; no separate hook needed until that changes. |

Failure mode: RPC error or missing key → **fail open** (default-allow, §2.5 rule 4), never a
silent live→mock fallback that masks a real error — the anti-pattern flagged from Zeus. A
failed fetch logs via the existing `logger.js`/console-error path, it does not swap in fake
data.

---

## 4. The console app

**Repo:** own repo, `flux-argus`, sibling to `Tabatha` and `SS-App` — not a folder inside
Tabatha (mirrors Zeus's "own repo" pattern, keeps the god-mode surface's git history and
access list separate from product code).

**Stack:** Next.js 15 + Supabase SSR, same as Zeus-Control. **Local-run only in v1** — no
Vercel/public deploy (Zeus's own foundation-branch scope does the same, for the same reason:
this surface should not be internet-reachable until there's a real reason for it to be). v2
path: hosted-behind-auth, once there's an actual need for someone other than Malkio/CeeCee's
fleet to reach it without a local checkout.

**Auth:** claim-based, `app_metadata.argus_admin === true` or `super_admin`, checked via a
`requireArgusAdminUser()` helper shaped exactly like Zeus's `zeus-admin.ts` — same code, new
claim name. **Separate claim namespace from `zeus_admin`**, not shared, because these are
different Supabase projects with different admin rosters; flagged as confirm-with-Malkio in §7
in case a single identity should span both.

**Nav** (mirrors Zeus's `ZEUS_NAV_ITEMS` shape):

| Route | Page | Notes |
|---|---|---|
| `/plans` | Plan Templates | Edit `free`/`pro` feature rows; add a plan (v2: more than two tiers) |
| `/features` | Feature Grid | Per-user AND per-org toggle, one table, filter by domain/surface |
| `/accounts` | Accounts | Profiles + orgs directory: `account_type`, device count (mig 045), plan, override count |
| `/provisioning` | Provisioning | Mint invites — **wraps `tabatha.create_invite_token`**, does not reinvent it |
| `/audit` | Audit Log | Read-only, before/after JSON, actor |

No impersonation in v1 (explicit instruction, also matches "no real support-tooling burden
yet" — add only once a real support workflow needs it).

---

## 5. Free/pro matrix (proposal — Malkio edits this, not final)

| `feature_key` | Free | Pro | Notes |
|---|---|---|---|
| `asana_sync` | locked | ✅ | Plan 040 Epic (Asana PAT) — paid third-party API surface, pro-gate by default |
| `voice_checkins` | locked | ✅ | #211 voice input — compute-heavy, pro-gate |
| `chaperone` | beta | ✅ | #182 v0 pre-recorded slice ships beta-gated regardless of plan; pro-only at GA |
| `pomodoro` | ✅ | ✅ | Core loop — user explicitly wants this broadly available, not paywalled |
| `watch_pairing` | 1 device | unlimited | Numeric via `constraints: {"limit": N}`, not a plain boolean |
| `desk_view` (Context View) | ✅ | ✅ | Already publicly showcased on the marketing site (`/show`) — keep open, it's an adoption surface |
| `multi_device_limit` | `{"limit": 3}` | `{"limit": null}` (unlimited) | Ties to mig 045 device management directly |
| `org_create` | ✅ (standard accounts) | ✅ | `account_type = 'demo'` default TBD — see open question §7.2 |

Eight keys, matching the directive's illustrative list. Everything else in the product
defaults to the resolver's rule 4 (default-allow, uncataloged) until Malkio decides it needs a
row — Argus does not need every feature cataloged before it ships.

---

## 6. v1 / v2 cut (Progressive Simplicity)

**v1 — ships:**
- Migrations 046–049 (schema + RPC), real seeded `free`/`pro` rows for the 8 keys above.
- `source` enum includes `billing_writer` but **no writer exists** — flags-only, matching the
  directive's explicit instruction that billing integration is out of v1.
- Sidecar hook + extension service (§3); watch/companion are doc notes, not code.
- Console: local-run, claim-gated, five nav pages (§4), no impersonation, `constraints` edited
  as a raw JSON field (no numeric-stepper UI polish yet).

**v2 — explicitly parked, do not build now:**
- A real billing writer (Stripe or whatever Flux settles on) populating `feature_permissions`
  rows with `source = 'billing_writer'`.
- Pilot-cohort scheduled unlock job (Zeus P3.1 pattern) — no pilot program exists in Flux yet.
- Promo/beta-program roster UI polish (the enum values exist; the console UI for managing them
  does not, until there's a real promo to run).
- Native watch/companion client wiring (real code against the RPC, not a doc note).
- Hosted-behind-auth Argus deploy.
- Impersonation / view-as-user for support.
- `constraints` as typed numeric-stepper UI instead of raw JSON.
- Org-level bulk edit / CSV import of overrides.
- DB-level enforcement of the downward-inheritance rule (§2.2) — v1 is console-validated only.

---

## 7. Build breakdown — parallelizable units, file-level scope

Per `docs/parallel-development-workflow.md`, zones touched: **Supabase migrations** (shared
resource, sequential — only one branch should hold 046–049 at a time) and a **new external
repo** (`flux-argus`, zero overlap with any Tabatha worktree). No conflict with the active
`claude/tabby-sidecar-mobile-46c612` line or any other in-flight Tabatha branch — this doc adds
no code to `sidecar/` or `src/` beyond the two client-contract files in Unit C/D below.

| Unit | Scope | Files | Depends on |
|---|---|---|---|
| **A — Schema** | Migrations 046–049 | `supabase/migrations/046_*.sql` … `049_*.sql` | none |
| **B — Resolver** | `get_effective_permissions` RPC body | folded into 049 (same file as A, same author) | A |
| **C — Sidecar client** | `usePermission` hook, first Settings-screen consumer | `sidecar/src/hooks/usePermission.ts`, `sidecar/src/data/permissions.ts` | A/B deployed to a dev branch |
| **D — Extension client** | permission service, message-bus wiring | `src/services/permissionService.js`, `background.js` registration | A/B deployed to a dev branch |
| **E — Console scaffold** | New repo bootstrap, claim-gated shell | `flux-argus` repo: `lib/auth/*`, `lib/argus/*`, `app/layout.tsx`, `app/login` | A (talks to Supabase directly, no dependency on C/D) |
| **F — Console pages** | Plans, Feature Grid, Accounts, Provisioning, Audit | `flux-argus/app/(app)/{plans,features,accounts,provisioning,audit}/*` | E, A |
| **G — Plan content** | Seed data entry for the 8 free/pro keys (§5) | `supabase/migrations/047_plan_templates.sql` seed rows | A (can run in parallel with F, same migration file needs coordination) |

E can start the moment A lands on a dev branch — it has no dependency on C or D. Max branch
lifetime: this is small enough (4 migrations + 1 new repo scaffold + 2 client hooks) to land
inside a single week; no scope-split needed beyond the unit table above.

---

## Open questions for Malkio

1. **Billing writer.** Which system eventually writes `source = 'billing_writer'` rows —
   direct Stripe, a future Helm-style aggregator, something else? Not needed for v1, but the
   enum value is locked in now; confirm the shape doesn't need to change later.
2. **`org_create` default for `account_type = 'demo'`.** Left ✅ in the matrix (§5) matching
   today's `create_organization` RPC, which is open to any authenticated profile. Should demo
   accounts be denied by default (abuse/spam vector) via a seeded `admin_override` row at
   redemption time, or is that a v2 concern?
3. **Claim namespace.** Confirm `argus_admin`/`super_admin` as a separate claim from Zeus's
   `zeus_admin` (different Supabase projects, likely different admin rosters) — or should one
   identity span both consoles?
4. **Watch/companion auth model.** Confirm whether Tabby Watch gets its own Supabase Auth
   session (own `usePermission` implementation, same RPC) or always rides the paired phone's
   session (no independent client needed, matches Companion's current model, §3).
5. **`constraints` typing.** Raw JSONB textarea acceptable for v1, or is a first-class
   numeric-limit column worth the extra migration complexity now instead of in v2?
6. **Repo naming.** "Argus" as the codename, `flux-argus` as the repo — confirm both, or
   propose a preferred name before Unit E scaffolds anything.
