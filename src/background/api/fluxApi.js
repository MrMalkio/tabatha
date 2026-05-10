import { handleMessage as handleBlockgateMessage } from '../services/blockgateService.js';
import { handleMessage as handleCategoryMessage } from '../services/categoryService.js';
import { handleMessage as handleClockMessage } from '../services/clockService.js';
import { handleMessage as handleFocusMessage } from '../services/focusService.js';
import { handleMessage as handleGroupMessage } from '../services/groupService.js';
import { handleMessage as handleNotificationMessage } from '../services/notificationService.js';
import { handleMessage as handleSessionMessage } from '../services/sessionService.js';
import { handleMessage as handleSettingsMessage } from '../services/settingsService.js';
import { handleMessage as handleTabMessage } from '../services/tabService.js';
import { handleMessage as handleTabTrackingMessage } from '../services/tabTrackingService.js';
import { handleMessage as handleTaskMessage } from '../services/taskService.js';

export const serviceHandlers = [
  handleNotificationMessage,
  handleSettingsMessage,
  handleCategoryMessage,
  handleClockMessage,
  handleGroupMessage,
  handleSessionMessage,
  handleTaskMessage,
  handleTabMessage,
  handleTabTrackingMessage,
  handleFocusMessage,
  handleBlockgateMessage,
];

export async function handleMessage(type, message = {}, sender = {}) {
  for (const service of serviceHandlers) {
    const response = await service(type, message, sender);
    if (response) return response;
  }
  return null;
}
