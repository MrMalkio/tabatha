/**
 * Format seconds into a human-readable duration string.
 * e.g. 5400 → "1h 30m", 90 → "1m", 0 → "0m"
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Format an ISO datetime to a short time string (e.g. "2:14 PM").
 */
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Compute the elapsed seconds for a running timer (no stopped_at).
 */
function elapsedSince(startedAt) {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.floor((now - start) / 1000);
}

/**
 * Aggregate time entries by user.
 * Returns { [user_name]: totalSeconds }
 */
function aggregateByUser(entries) {
  const totals = {};
  for (const entry of entries) {
    const name = entry.user_name || entry.user_gid;
    const duration = entry.stopped_at
      ? entry.duration_s
      : elapsedSince(entry.started_at);
    totals[name] = (totals[name] || 0) + (duration || 0);
  }
  return totals;
}

/**
 * Sum total seconds across all entries.
 */
function sumDurations(entries) {
  return entries.reduce((sum, e) => {
    const d = e.stopped_at ? e.duration_s : elapsedSince(e.started_at);
    return sum + (d || 0);
  }, 0);
}

/**
 * Get the most recent entry (by started_at).
 */
function getLastEntry(entries) {
  if (!entries.length) return null;
  return entries.reduce((latest, e) =>
    new Date(e.started_at) > new Date(latest.started_at) ? e : latest
  );
}

module.exports = {
  formatDuration,
  formatTime,
  elapsedSince,
  aggregateByUser,
  sumDurations,
  getLastEntry,
};
