// ════════════════════════════════════════════
// Tabatha — Activity Audit Service (Plan 031 Phase 4)
// Structured audit trail for focus lifecycle events.
// Appends entries to chrome.storage.local 'activityAuditLog' (FIFO, capped at 500).
// ════════════════════════════════════════════

const AUDIT_KEY = 'activityAuditLog';
const MAX_ENTRIES = 500;

/**
 * Log a structured audit entry.
 * @param {string} action - e.g. 'START_FOCUS', 'PAUSE_FOCUS', 'COMPLETE_FOCUS', 'EXTEND_TIMER', 'LET_ME_COOK', 'BACKBURNER'
 * @param {object} details - { focusId, focusLabel, previousState, newState, activeTabUrl, activeTabTitle, metadata }
 */
export async function logAudit(action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    focusId: details.focusId || null,
    focusLabel: details.focusLabel || null,
    previousState: details.previousState || null,
    newState: details.newState || null,
    activeTabUrl: details.activeTabUrl || null,
    activeTabTitle: details.activeTabTitle || null,
    metadata: details.metadata || {},
  };

  try {
    const result = await chrome.storage.local.get(AUDIT_KEY);
    const log = result[AUDIT_KEY] || [];
    log.push(entry);

    // FIFO cap
    while (log.length > MAX_ENTRIES) log.shift();

    await chrome.storage.local.set({ [AUDIT_KEY]: log });
  } catch (err) {
    console.warn('[activityAudit] failed to log:', action, err);
  }
}

/**
 * Get the full audit log.
 * @returns {Promise<Array>}
 */
export async function getAuditLog() {
  try {
    const result = await chrome.storage.local.get(AUDIT_KEY);
    return result[AUDIT_KEY] || [];
  } catch {
    return [];
  }
}

/**
 * Clear the audit log.
 */
export async function clearAuditLog() {
  await chrome.storage.local.remove(AUDIT_KEY);
}
