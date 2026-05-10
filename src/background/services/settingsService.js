import { getSettings, setStorage } from './storageService.js';

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_SETTINGS':
      return { settings: await getSettings() };
    case 'UPDATE_SETTINGS':
      return updateSettings(message);
    default:
      return null;
  }
}

async function updateSettings(message) {
  const settings = await getSettings();
  Object.assign(settings, message.settings);
  await setStorage({ settings });

  // Update idle detection interval.
  if (message.settings.idleThresholdMinutes) {
    chrome.idle.setDetectionInterval(message.settings.idleThresholdMinutes * 60);
  }

  // Setup or clear auto-export.
  if (settings.autoExportEnabled) {
    chrome.alarms.create('auto-export', { periodInMinutes: settings.autoExportIntervalMinutes });
  } else {
    chrome.alarms.clear('auto-export');
  }

  return { settings };
}
