-- TR-01 — Regina device-row cleanup (one-off server-side dedup)
-- PREPARED overnight 2026-07-23 by the TaskRun (Soren/CeeCee orchestration).
-- NOT EXECUTED overnight: hard-deleting production rows is a §1.2 deferred action
-- (irreversible, no documented prior server-side-cleanup run to replicate). This
-- script is left for Malkio to review and run after approval (Morning Question).
--
-- Target profile (Regina): 07466c2e-ba6c-4a89-b701-1a550544a44e  (display_name "regina")
-- Schema: tabatha.  Verified against live DB via Mgmt API on 2026-07-23.
--
-- Regina's browser_profiles state at prep time:
--   37 total rows. Breakdown:
--     - 33 chrome rows with NULL machine_id  = the local_id-regeneration flood
--       (pre-6.7.46 bug; created 2026-07-20 .. 2026-07-22).
--     - 2 chrome rows WITH machine_id (8a531d2a-…) = real post-fix install  -> KEEP
--     - 1 desktop_companion row (null machine_id, distinct browser)          -> KEEP
--     - 1 tabatha_web row (sidecar-… machine_id) = phone/Sidecar             -> KEEP
--   Of the 33 flood rows: 15 are FK-referenced (focus_items / intent_history /
--   clock_sessions / etc.) and carry real history -> KEEP (visual dedup is TR-13's job).
--   The other 18 flood rows are UNREFERENCED pure dupes (0 rows in any of the 10
--   child tables) -> SAFE TO DELETE.
--
-- DELETE-SET = 18 rows.  KEEP-SET = 19 rows.  (verified counts at prep time)
--
-- The DELETE predicate re-derives the set by condition (NOT hardcoded ids), so it
-- stays correct even if a couple of rows changed between prep and run. The COUNT
-- assertion aborts if the derived set is unexpectedly large (safety rail).

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 (DRY RUN — run this alone first, read the count, sanity-check, THEN run STEP 1):
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS will_delete
FROM tabatha.browser_profiles b
WHERE b.profile_id = '07466c2e-ba6c-4a89-b701-1a550544a44e'
  AND b.machine_id IS NULL
  AND b.browser = 'chrome'
  AND b.revoked_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tabatha.focus_items          x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.intent_history       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.clock_sessions       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.desktop_activity     x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.operations           x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.initiatives          x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.clients              x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.projects             x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.tasks_registry       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.browser_profile_status x WHERE x.browser_profile_id = b.id);
-- Expect: 18. If materially different, STOP and re-inspect before proceeding.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 (BACKUP + DELETE — transactional; run only after STEP 0 looks right):
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1a. Snapshot the exact rows about to be deleted into a timestamped backup table
--     (reversible: re-INSERT ... SELECT * FROM the backup table to undo).
CREATE TABLE IF NOT EXISTS tabatha.browser_profiles_backup_20260723_regina
  (LIKE tabatha.browser_profiles INCLUDING ALL);

INSERT INTO tabatha.browser_profiles_backup_20260723_regina
SELECT b.*
FROM tabatha.browser_profiles b
WHERE b.profile_id = '07466c2e-ba6c-4a89-b701-1a550544a44e'
  AND b.machine_id IS NULL
  AND b.browser = 'chrome'
  AND b.revoked_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tabatha.focus_items          x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.intent_history       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.clock_sessions       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.desktop_activity     x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.operations           x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.initiatives          x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.clients              x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.projects             x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.tasks_registry       x WHERE x.browser_profile_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM tabatha.browser_profile_status x WHERE x.browser_profile_id = b.id);

-- 1b. Safety rail: abort the whole transaction if the backup captured an
--     unexpected number of rows (guards against predicate drift / accidental scope).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM tabatha.browser_profiles_backup_20260723_regina;
  IF n < 1 OR n > 25 THEN
    RAISE EXCEPTION 'Aborting: backup captured % rows, expected ~18 (1..25 allowed). Re-inspect.', n;
  END IF;
END $$;

-- 1c. Delete exactly the backed-up rows (join on id — deletes only what was snapshotted).
DELETE FROM tabatha.browser_profiles b
USING tabatha.browser_profiles_backup_20260723_regina k
WHERE b.id = k.id;

-- 1d. Verify the survivors (expect 19 for Regina).
--     (Runs inside the txn; review the notice, then COMMIT or ROLLBACK.)
DO $$
DECLARE keep int;
BEGIN
  SELECT count(*) INTO keep FROM tabatha.browser_profiles
   WHERE profile_id = '07466c2e-ba6c-4a89-b701-1a550544a44e';
  RAISE NOTICE 'Regina browser_profiles remaining after cleanup: % (expected 19)', keep;
END $$;

COMMIT;
-- If anything looked wrong before COMMIT, run ROLLBACK; instead.
--
-- UNDO (if ever needed):
--   INSERT INTO tabatha.browser_profiles
--   SELECT * FROM tabatha.browser_profiles_backup_20260723_regina;
--   DROP TABLE tabatha.browser_profiles_backup_20260723_regina;  -- once confident
