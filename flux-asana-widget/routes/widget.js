const express = require("express");
const router = express.Router();
const { getSupabase } = require("../services/supabase");
const {
  formatDuration,
  formatTime,
  aggregateByUser,
  sumDurations,
  getLastEntry,
} = require("../services/time");
const { ICONS } = require("../config/constants");

/**
 * GET /widget
 * 
 * Called by Asana whenever a user opens a task with an attached Flux resource URL.
 * Returns a `summary_with_details_v0` widget showing time tracking status.
 * 
 * Query params from Asana:
 *   - resource_url: The URL of the attachment
 *   - workspace: Workspace GID
 *   - task: Task GID
 *   - user: Current user GID
 *   - attachment: Attachment GID
 *   - expires_at: Request expiry
 */
router.get("/", async (req, res) => {
  try {
    const { task, user } = req.query;

    if (!task) {
      return res.status(400).json({ error: "Missing task parameter" });
    }

    console.log(`[Widget] Rendering for task=${task}, user=${user}`);

    // 1. Fetch all time entries for this task
    const supabase = getSupabase();
    let entries = [];

    if (supabase) {
      const { data, error } = await supabase
        .from("flux_time_entries")
        .select("*")
        .eq("task_gid", task)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("[Widget] Supabase error:", error);
        return res.status(500).json({ error: "Database error" });
      }
      entries = data || [];
    } else {
      console.log("[Widget] No DB — returning empty state");
    }

    // 2. No entries yet — show empty state
    if (!entries || entries.length === 0) {
      return res.json({
        template: "summary_with_details_v0",
        metadata: {
          title: "⏱ Flux Time Tracker",
          subtitle: "No time tracked yet",
          subicon_url: ICONS.FLUX,
          fields: [
            {
              name: "Status",
              type: "pill",
              text: "No entries",
              color: "none",
            },
            {
              name: "Tip",
              type: "text_with_icon",
              text: "Use the entry point to start tracking time",
            },
          ],
          footer: {
            footer_type: "custom_text",
            text: "Flux Time Tracker v1",
            icon_url: ICONS.FLUX,
          },
        },
      });
    }

    // 3. Check for active timer (current user)
    const activeEntry = entries.find(
      (e) => e.user_gid === user && !e.stopped_at
    );

    // 4. Check for ANY active timer (any user)
    const anyActive = entries.filter((e) => !e.stopped_at);

    // 5. Aggregate stats
    const userTotals = aggregateByUser(entries);
    const teamTotal = sumDurations(entries);
    const uniqueUsers = Object.keys(userTotals);
    const lastEntry = getLastEntry(entries);

    // 6. Build fields array
    const fields = [];

    // Status pill
    if (activeEntry) {
      fields.push({
        name: "Status",
        type: "pill",
        text: "● Tracking",
        color: "green",
      });
      fields.push({
        name: "Active Timer",
        type: "text_with_icon",
        text: `You — since ${formatTime(activeEntry.started_at)}`,
        icon_url: ICONS.TIMER,
      });
    } else if (anyActive.length > 0) {
      fields.push({
        name: "Status",
        type: "pill",
        text: `● ${anyActive.length} active`,
        color: "yellow",
      });
    } else {
      fields.push({
        name: "Status",
        type: "pill",
        text: "Idle",
        color: "cool-gray",
      });
    }

    // Team total
    fields.push({
      name: "Team Total",
      type: "text_with_icon",
      text: formatDuration(teamTotal),
      icon_url: ICONS.TEAM,
    });

    // Per-user breakdown (top 5 contributors)
    const sortedUsers = Object.entries(userTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    for (const [userName, total] of sortedUsers) {
      fields.push({
        name: userName,
        type: "text_with_icon",
        text: formatDuration(total),
        icon_url: ICONS.PERSON,
      });
    }

    // Show overflow count if more than 5 contributors
    if (uniqueUsers.length > 5) {
      fields.push({
        name: "Others",
        type: "text_with_icon",
        text: `+${uniqueUsers.length - 5} more contributors`,
      });
    }

    // Last entry datetime
    if (lastEntry) {
      fields.push({
        name: "Last Entry",
        type: "datetime_with_icon",
        datetime: lastEntry.stopped_at || lastEntry.started_at,
        icon_url: ICONS.CLOCK,
      });
    }

    // 7. Return widget response
    res.json({
      template: "summary_with_details_v0",
      metadata: {
        title: "⏱ Flux Time Tracker",
        subtitle: `Total: ${formatDuration(teamTotal)} across ${uniqueUsers.length} ${uniqueUsers.length === 1 ? "person" : "people"}`,
        subicon_url: ICONS.FLUX,
        fields,
        footer: {
          footer_type: "custom_text",
          text: "Synced just now",
          icon_url: ICONS.FLUX,
        },
      },
    });
  } catch (err) {
    console.error("[Widget] Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
