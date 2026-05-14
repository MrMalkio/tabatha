import { DEFAULT_SETTINGS, getSettings, setStorage } from './storageService.js';
import { scheduleSessionSnapshotAlarm } from '../bootstrap.js';

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_SETTINGS':
      return { settings: await getSettings() };

    case 'UPDATE_SETTINGS':
      return updateSettings(message);

    default:
      return undefined;
  }
}

async function updateSettings(message) {
  const updates = message.settings ?? message.updates ?? {};
  const validation = validateStorageSettings(updates.storage);
  if (validation.error) return { error: validation.error };

  const previous = await getSettings();
  const nextSettings = {
    ...previous,
    ...updates,
    storage: validation.storage ? { ...previous.storage, ...validation.storage } : previous.storage
  };

  await setStorage({ settings: nextSettings });

  if (updates.idleThresholdMinutes) {
    chrome.idle.setDetectionInterval(updates.idleThresholdMinutes * 60);
  }

  if (nextSettings.autoExportEnabled) {
    chrome.alarms.create('auto-export', { periodInMinutes: nextSettings.autoExportIntervalMinutes });
  } else {
    chrome.alarms.clear('auto-export');
  }

  // Re-arm the snapshot alarm if its cadence just changed.
  if (
    validation.storage
    && validation.storage.snapshotIntervalMinutes !== undefined
    && validation.storage.snapshotIntervalMinutes !== previous?.storage?.snapshotIntervalMinutes
  ) {
    await scheduleSessionSnapshotAlarm();
  }

  return { settings: nextSettings };
}

function validateStorageSettings(storage) {
  if (storage === undefined) return {};
  if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
    return { error: 'settings.storage must be an object' };
  }

  const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS.storage));
  const sanitized = {};

  for (const [key, value] of Object.entries(storage)) {
    if (!allowedKeys.has(key)) {
      return { error: `Unknown settings.storage key: ${key}` };
    }
    if (!Number.isFinite(value) || value < 0) {
      return { error: `settings.storage.${key} must be a non-negative number` };
    }
    sanitized[key] = value;
  }

  return { storage: sanitized };
}
