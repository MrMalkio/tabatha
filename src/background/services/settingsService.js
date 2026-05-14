import { DEFAULT_SETTINGS, getSettings, setStorage } from './storageService.js';

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

  const settings = await getSettings();
  const nextSettings = {
    ...settings,
    ...updates,
    storage: validation.storage ? { ...settings.storage, ...validation.storage } : settings.storage
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
