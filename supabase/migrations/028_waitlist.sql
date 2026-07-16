-- 028_waitlist.sql — the public teaser's waitlist.
--
-- CONTEXT
-- The teaser page at `/` collects one thing: an email address. Rows arrive
-- exclusively through the `POST /api/waitlist` Pages Function
-- (`functions/api/waitlist.js`), which holds the service-role key in an env
-- binding. Nothing client-side ever touches this table, and no Supabase key is
-- ever shipped to the browser.
--
-- SECURITY SHAPE
-- This is the most sensitive table in the schema per row: a list of people's
-- email addresses with nothing to authenticate against, since waitlist signups
-- are anonymous by definition. There is no `profile_id` to scope an RLS policy
-- to, so the correct posture is not "a careful policy" but NO policy at all:
--
--   • RLS ENABLED with ZERO policies. Postgres denies all access by default to
--     any role that respects RLS, i.e. anon and authenticated. There is no
--     policy to get subtly wrong.
--   • service_role BYPASSES RLS, which is exactly and only how the Function
--     writes. That is the single intended path.
--   • REVOKE is not redundant here. Migration 006 (line 28) declared
--     `ALTER DEFAULT PRIVILEGES IN SCHEMA tabatha GRANT SELECT, INSERT, UPDATE,
--     DELETE ON TABLES TO anon, authenticated, service_role`, so THIS TABLE
--     INHERITS anon/authenticated DML grants the moment it is created. RLS
--     still denies the rows today, but that inherited grant is a loaded
--     footgun: the day anyone adds a permissive policy for an unrelated reason,
--     the whole email list becomes anon-readable. Revoking the table-level
--     grant means both locks must fail before an address leaks.
--
-- EMAIL IDENTITY
-- `citext` is not installed on this project and no existing migration enables
-- it, so rather than take an extension dependency for one column we normalise
-- at the boundary: the Function lowercases and trims before insert, and the
-- CHECK below makes that invariant the DATABASE's rule rather than a promise
-- the client makes. A plain UNIQUE on the already-lowercased text then gives
-- true case-insensitive identity. `a@b.com` and `A@B.com` cannot coexist.
--
-- Duplicates are a SUCCESS case, not an error: the endpoint must never reveal
-- whether an address is already on the list. The Function relies on the UNIQUE
-- constraint via ON CONFLICT DO NOTHING and returns the same response either
-- way. Enumeration of the list via the signup form is therefore impossible.

CREATE TABLE IF NOT EXISTS tabatha.waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stored already-lowercased and trimmed; the CHECK enforces it server-side.
  -- 320 is the RFC 5321 maximum addressable length (64 local + @ + 255 domain).
  email      TEXT NOT NULL UNIQUE
             CHECK (email = lower(email))
             CHECK (length(email) BETWEEN 3 AND 320)
             CHECK (position('@' IN email) > 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Which surface produced the signup. Defaults to the teaser because that is
  -- the only thing that writes here today; kept free-form so a future surface
  -- does not need a migration to be attributable.
  source     TEXT NOT NULL DEFAULT 'teaser',

  -- Referring origin, recorded by the Function from the Referer header. Held
  -- for provenance only. NEVER a full URL with a query string: the Function
  -- reduces it to an origin precisely so this column cannot accumulate
  -- tracking parameters or personal data lifted out of a link.
  referrer   TEXT
);

COMMENT ON TABLE tabatha.waitlist IS
  'Public teaser waitlist. Written ONLY by the /api/waitlist Pages Function via '
  'service_role. RLS is enabled with no policies, so anon/authenticated have no '
  'access by design. Emails are stored lowercased (CHECK-enforced) with a UNIQUE '
  'constraint, so duplicate signups collide and are treated as success.';

COMMENT ON COLUMN tabatha.waitlist.email IS
  'Lowercased, trimmed address. UNIQUE + CHECK(email = lower(email)) together '
  'give case-insensitive identity without a citext dependency.';

-- Deny-by-default. No policies follow, and that is deliberate: see header.
ALTER TABLE tabatha.waitlist ENABLE ROW LEVEL SECURITY;

-- Force RLS for the table owner too, so a future migration running as owner
-- cannot read the list without opting in explicitly.
ALTER TABLE tabatha.waitlist FORCE ROW LEVEL SECURITY;

-- Strip the grants inherited from migration 006's ALTER DEFAULT PRIVILEGES.
-- service_role is intentionally NOT revoked: it is the Function's only path in.
REVOKE ALL ON TABLE tabatha.waitlist FROM anon, authenticated;

-- Reporting reads the list newest-first; the UNIQUE index already covers email.
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON tabatha.waitlist (created_at DESC);
