/**
 * Tabatha Logger Service
 * 
 * Centralized logging for Tabatha. All errors, warnings, and debug events
 * are captured here and stored in chrome.storage for review.
 * 
 * Usage:
 *   import { logger } from '../services/logger';
 *   logger.error('CLOCK_IN', 'Failed to write session', { tabId: 123 });
 *   logger.warn('SYNC', 'No auth session, skipping');
 *   logger.debug('FOCUS', 'Timer extended', { focusId, minutes: 5 });
 *   logger.info('GATEKEEPER', 'Overlay closed via Sugar Box');
 */

const MAX_LOG_ENTRIES = 500;
const isChromeExt = typeof chrome !== 'undefined' && chrome.storage?.local;

/**
 * @typedef {'error'|'warn'|'info'|'debug'} LogLevel
 * @typedef {{ level: LogLevel, source: string, message: string, data?: any, timestamp: string }} LogEntry
 */

async function writeLog(level, source, message, data) {
  const entry = {
    level,
    source,
    message,
    data: data ?? null,
    timestamp: new Date().toISOString(),
  };

  // Always echo to the real console
  const consoleFn = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : level === 'debug' ? console.debug
    : console.log;
  consoleFn(`[Tabatha:${source}] ${message}`, data ?? '');

  // Persist to storage
  if (isChromeExt) {
    try {
      const { tabathaLogs = [] } = await chrome.storage.local.get('tabathaLogs');
      tabathaLogs.push(entry);
      // Keep only the most recent entries
      const trimmed = tabathaLogs.slice(-MAX_LOG_ENTRIES);
      await chrome.storage.local.set({ tabathaLogs: trimmed });
    } catch (e) {
      // Last resort — don't let logging itself crash
      console.error('[Tabatha:Logger] Failed to persist log:', e);
    }
  }
}

export const logger = {
  error: (source, message, data) => writeLog('error', source, message, data),
  warn:  (source, message, data) => writeLog('warn', source, message, data),
  info:  (source, message, data) => writeLog('info', source, message, data),
  debug: (source, message, data) => writeLog('debug', source, message, data),
};

/**
 * Read all stored logs. For UI consumption (settings debug panel).
 */
export async function getLogs(filter) {
  if (!isChromeExt) return [];
  const { tabathaLogs = [] } = await chrome.storage.local.get('tabathaLogs');
  if (!filter) return tabathaLogs;
  return tabathaLogs.filter(e => {
    if (filter.level && e.level !== filter.level) return false;
    if (filter.source && !e.source.toLowerCase().includes(filter.source.toLowerCase())) return false;
    return true;
  });
}

/**
 * Clear all stored logs.
 */
export async function clearLogs() {
  if (isChromeExt) {
    await chrome.storage.local.set({ tabathaLogs: [] });
  }
}
