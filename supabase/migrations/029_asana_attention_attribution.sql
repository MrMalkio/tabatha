-- Tabatha v6.8.0 — Asana human/agent attention attribution and hierarchy rollups.
-- The original widget table remains backwards-compatible: Asana-originated
-- rows may leave all new columns NULL, while Tabatha-originated rows stamp the
-- source task, every known ancestor, and the human/agent controller.

ALTER TABLE public.flux_time_entries
  ADD COLUMN IF NOT EXISTS source_task_gid TEXT,
  ADD COLUMN IF NOT EXISTS parent_task_gid TEXT,
  ADD COLUMN IF NOT EXISTS ancestor_task_gids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS controller TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS tabatha_focus_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.flux_time_entries
SET source_task_gid = task_gid
WHERE source_task_gid IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flux_time_entries_controller_check'
  ) THEN
    ALTER TABLE public.flux_time_entries
      ADD CONSTRAINT flux_time_entries_controller_check
      CHECK (controller IN ('human', 'ai-agent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_flux_time_parent
  ON public.flux_time_entries(parent_task_gid);

CREATE INDEX IF NOT EXISTS idx_flux_time_ancestors
  ON public.flux_time_entries USING GIN(ancestor_task_gids);

CREATE INDEX IF NOT EXISTS idx_flux_time_controller
  ON public.flux_time_entries(controller, agent_name);
