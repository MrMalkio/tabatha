// ════════════════════════════════════════════
// Tabatha — Archive Service
// Routes about-to-be-dropped entries to a destination before they vanish.
// Backstops the FIFO caps enforced by storageService.enforceArrayCap.
// Callers wire up in Plan 023 Task 03.
// ════════════════════════════════════════════

import { getStorage, setStorage } from './storageService.js';

function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Append dropped entries to `_archive_<key>` keyed by `yyyy-mm`. We use a
// single object-shaped key per source so the surface area in chrome.storage
// stays small — a future migration to IndexedDB can read this rolling key
// and split it out.
async function writeLocalArchive(key, droppedEntries) {
  if (!droppedEntries.length) return { archived: 0 };
  const archiveKey = `_archive_${key}`;
  const raw = await getStorage(archiveKey);
  const archive = raw?.[archiveKey] && typeof raw[archiveKey] === 'object' ? raw[archiveKey] : {};
  const bucket = monthKey();
  archive[bucket] = (archive[bucket] || []).concat(droppedEntries);
  await setStorage({ [archiveKey]: archive });
  return { archived: droppedEntries.length, bucket, archiveKey };
}

function broadcastWarn(key, count) {
  try {
    chrome.runtime.sendMessage({ type: 'STORAGE_CAP_WARNING', key, count }).catch(() => {});
  } catch { /* extension context may be tearing down */ }
}

// destination: 'localArchive' | 'supabase' | 'warn'
export async function archiveBeforeCap(key, droppedEntries, destination = 'localArchive') {
  if (!Array.isArray(droppedEntries) || droppedEntries.length === 0) {
    return { archived: 0, destination };
  }

  switch (destination) {
    case 'localArchive':
      return { ...(await writeLocalArchive(key, droppedEntries)), destination };

    case 'supabase':
      // Wired up alongside Supabase sync in a later task. For now, fall back
      // to localArchive so we never silently lose data.
      console.warn(`[Tabatha:archive] supabase destination not yet implemented; falling back to localArchive for "${key}"`);
      return { ...(await writeLocalArchive(key, droppedEntries)), destination: 'localArchive', requested: 'supabase' };

    case 'warn':
      broadcastWarn(key, droppedEntries.length);
      return { archived: 0, destination, warned: true };

    default:
      console.warn(`[Tabatha:archive] unknown destination "${destination}"; falling back to localArchive`);
      return { ...(await writeLocalArchive(key, droppedEntries)), destination: 'localArchive', requested: destination };
  }
}
