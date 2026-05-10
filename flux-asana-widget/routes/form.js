const express = require("express");
const router = express.Router();
const { getSupabase } = require("../services/supabase");
const { formatTime, elapsedSince, formatDuration } = require("../services/time");

const BASE_URL = process.env.BASE_URL || "https://localhost:8000";

/**
 * GET /form/metadata
 * 
 * Called when user clicks the entry point button.
 * Returns a form to start or stop the timer depending on current state.
 */
router.get("/metadata", async (req, res) => {
  try {
    const { task, user } = req.query;

    if (!task || !user) {
      return res.status(400).json({ error: "Missing task or user" });
    }

    console.log(`[Form] Metadata request for task=${task}, user=${user}`);

    // Check if user has an active timer on this task
    const supabase = getSupabase();
    let activeEntry = null;

    if (supabase) {
      const { data: activeEntries } = await supabase
        .from("flux_time_entries")
        .select("*")
        .eq("task_gid", task)
        .eq("user_gid", user)
        .is("stopped_at", null)
        .limit(1);
      activeEntry = activeEntries?.[0] || null;
    }

    if (activeEntry) {
      // --- STOP TIMER FORM ---
      const elapsed = elapsedSince(activeEntry.started_at);
      return res.json({
        template: "form_metadata_v0",
        metadata: {
          title: "⏱ Stop Timer",
          submit_button_text: "Stop Timer",
          on_submit_callback: `${BASE_URL}/form/submit`,
          fields: [
            {
              type: "static_text",
              id: "info",
              name: `Timer running since ${formatTime(activeEntry.started_at)} (${formatDuration(elapsed)} elapsed)`,
            },
            {
              name: "Notes (optional)",
              type: "single_line_text",
              id: "description",
              is_required: false,
              placeholder: "Add notes about this session",
              width: "full",
            },
          ],
        },
      });
    }

    // --- START TIMER FORM ---
    res.json({
      template: "form_metadata_v0",
      metadata: {
        title: "⏱ Start Time Tracking",
        submit_button_text: "Start Timer",
        on_submit_callback: `${BASE_URL}/form/submit`,
        fields: [
          {
            type: "static_text",
            id: "info",
            name: "Start tracking time for this task. The timer will run until you stop it.",
          },
          {
            name: "Description (optional)",
            type: "single_line_text",
            id: "description",
            is_required: false,
            placeholder: "What are you working on?",
            width: "full",
          },
        ],
      },
    });
  } catch (err) {
    console.error("[Form] Metadata error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /form/submit
 * 
 * Called when the user submits the start/stop form.
 * Either creates a new entry (start) or sets stopped_at (stop).
 */
router.post("/submit", async (req, res) => {
  try {
    const { task, user, workspace } = req.body?.values
      ? req.body
      : { task: req.query.task, user: req.query.user, workspace: req.query.workspace };

    // Extract form values
    const formValues = req.body?.values || {};
    const description = formValues.description || null;

    // Also grab from top-level body (Asana sends task/user/workspace at body root)
    const taskGid = task || req.body?.task;
    const userGid = user || req.body?.user;
    const workspaceGid = workspace || req.body?.workspace;

    console.log(`[Form] Submit for task=${taskGid}, user=${userGid}`);

    if (!taskGid || !userGid) {
      return res.status(400).json({ error: "Missing task or user" });
    }

    // Check for active timer
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ error: "Database not configured" });
    }

    const { data: activeEntries } = await supabase
      .from("flux_time_entries")
      .select("*")
      .eq("task_gid", taskGid)
      .eq("user_gid", userGid)
      .is("stopped_at", null)
      .limit(1);

    const activeEntry = activeEntries?.[0];

    if (activeEntry) {
      // --- STOP the timer ---
      const { error } = await supabase
        .from("flux_time_entries")
        .update({
          stopped_at: new Date().toISOString(),
          description: description || activeEntry.description,
        })
        .eq("id", activeEntry.id);

      if (error) {
        console.error("[Form] Stop timer error:", error);
        return res.status(500).json({ error: "Failed to stop timer" });
      }

      console.log(`[Form] Timer stopped for entry ${activeEntry.id}`);
    } else {
      // --- START a new timer ---

      // Get user name from Asana (we cache it)
      // For v1, we'll use the user GID — in production, resolve via Asana API
      const userName = `User ${userGid.slice(-4)}`;

      const { error } = await supabase.from("flux_time_entries").insert({
        task_gid: taskGid,
        workspace_gid: workspaceGid || "unknown",
        user_gid: userGid,
        user_name: userName,
        started_at: new Date().toISOString(),
        description,
      });

      if (error) {
        console.error("[Form] Start timer error:", error);
        return res.status(500).json({ error: "Failed to start timer" });
      }

      console.log(`[Form] Timer started for task=${taskGid}`);
    }

    // Return an attachment response so the widget refreshes
    res.json({
      resource_name: "Flux Time Tracker",
      resource_url: `${BASE_URL}/task/${taskGid}`,
    });
  } catch (err) {
    console.error("[Form] Submit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
