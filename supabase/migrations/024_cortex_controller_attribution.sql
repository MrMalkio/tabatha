-- ============================================================
-- Tabatha Migration 024 — Cortex Controller Attribution (Plan 044 T2, C11a)
-- ============================================================
-- C11a records WHO was driving each observation: the human or an AI agent.
-- A "controller span" (chrome.storage.local `agentSessions`) marks a tab,
-- window, or the whole machine as agent-driven; the local-first
-- normalize-then-store path (observationLedger + captureService) stamps the
-- resulting `controller` value onto each observation BEFORE cloud-batch sync.
--
-- These columns are additive + nullable (mirrors migration 022's posture). No
-- column-level DEFAULT of 'human' — the local layer is the single decider of
-- the value (null-until-known, like every other observation field), rather than
-- defaulting at the DB. NOT YET APPLIED — staged for the cloud-batch increment.
-- ============================================================

ALTER TABLE tabatha.cortex_observations
  ADD COLUMN IF NOT EXISTS controller TEXT
    CHECK (controller IN ('human', 'ai-agent', 'unknown')),
  ADD COLUMN IF NOT EXISTS controller_confidence TEXT,
  ADD COLUMN IF NOT EXISTS controller_provenance TEXT;
