// ============================================================
// Tabatha — Group Service (Plan 023 Task 05a)
// Owns Chrome tab groups + Tabatha sub-groups: the GET_SAVED_GROUPS,
// CREATE_GROUP, CREATE_SUB_GROUP, GET_SUB_GROUPS message handlers and the
// chrome.tabGroups lifecycle listeners that keep tab data in sync with
// Chrome's grouping state.
// ============================================================

import { PRIORITY_LEVELS } from '../constants.js';
import {
  setStorage,
  getTabData,
  getSubGroups
} from './storageService.js';
import { broadcastAll, broadcastToExtension } from './notificationService.js';

let injectedDeps = {};
let listenersRegistered = false;

export function configureGroupService(deps = {}) {
  injectedDeps = { ...injectedDeps, ...deps };
}

async function persistTabs(tabs) {
  if (injectedDeps.setTabData) return injectedDeps.setTabData(tabs);
  return setStorage({ tabs });
}

export function registerGroupServiceListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  // chrome.tabGroups.onCreated fires before any tabs are necessarily inside
  // the group. Treat it as a UI hint — onUpdated will arrive with the real
  // title/color once Chrome paints them.
  chrome.tabGroups.onCreated.addListener(handleGroupCreated);
  chrome.tabGroups.onUpdated.addListener(handleGroupUpdated);
  chrome.tabGroups.onRemoved.addListener(handleGroupRemoved);
  chrome.tabs.onUpdated.addListener(handleTabGroupChange);
}

async function handleGroupCreated() {
  broadcastToExtension({ type: 'GROUPS_UPDATED' });
}

async function handleGroupUpdated(group) {
  try {
    const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
    const tabs = await getTabData();
    let changed = false;
    for (const tab of tabsInGroup) {
      if (tabs[tab.id]) {
        tabs[tab.id].groupId = group.id;
        tabs[tab.id].groupTitle = group.title || null;
        tabs[tab.id].groupColor = group.color || null;
        changed = true;
      }
    }
    if (changed) {
      await persistTabs(tabs);
      broadcastToExtension({ type: 'GROUPS_UPDATED' });
    }
  } catch { /* group may be stale */ }
}

async function handleGroupRemoved(group) {
  try {
    const tabs = await getTabData();
    let changed = false;
    for (const [, data] of Object.entries(tabs)) {
      if (data.groupId === group.id) {
        data.groupId = null;
        data.groupTitle = null;
        data.groupColor = null;
        changed = true;
      }
    }
    if (changed) {
      await persistTabs(tabs);
      broadcastToExtension({ type: 'GROUPS_UPDATED' });
    }
  } catch { /* ignore */ }
}

async function handleTabGroupChange(tabId, changeInfo) {
  if (changeInfo.groupId === undefined) return;
  const tabs = await getTabData();
  if (!tabs[tabId]) return;

  const noGroup =
    changeInfo.groupId === chrome.tabGroups?.TAB_GROUP_ID_NONE ||
    changeInfo.groupId === -1;
  tabs[tabId].groupId = noGroup ? null : changeInfo.groupId;
  if (noGroup) {
    tabs[tabId].groupTitle = null;
    tabs[tabId].groupColor = null;
  } else {
    try {
      const group = await chrome.tabGroups.get(changeInfo.groupId);
      tabs[tabId].groupTitle = group.title || null;
      tabs[tabId].groupColor = group.color || null;
    } catch { /* group may not exist yet */ }
  }
  await persistTabs(tabs);
  broadcastAll({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_SAVED_GROUPS':
      return getSavedGroups();

    case 'CREATE_GROUP': {
      const groupId = await createOrUpdateGroup(
        message.tabIds,
        message.name,
        message.priority
      );
      return { groupId };
    }

    case 'CREATE_SUB_GROUP': {
      const id = await createSubGroup(message.name);
      return { id };
    }

    case 'GET_SUB_GROUPS':
      return { subGroups: await getSubGroups() };

    default:
      return undefined;
  }
}

async function getSavedGroups() {
  try {
    const allGroups = await chrome.tabGroups.query({});
    const savedGroups = {};
    for (const group of allGroups) {
      const groupTabs = await chrome.tabs.query({ groupId: group.id });
      savedGroups[group.id] = {
        id: group.id,
        title: group.title || 'Untitled Group',
        color: group.color,
        collapsed: group.collapsed,
        tabIds: groupTabs.map(t => t.id),
        tabCount: groupTabs.length
      };
    }
    return { savedGroups };
  } catch {
    return { savedGroups: {} };
  }
}

async function createOrUpdateGroup(tabIds, groupName, priority) {
  const color = PRIORITY_LEVELS[priority]?.color || 'grey';
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: groupName,
    color,
    collapsed: false
  });

  const tabs = await getTabData();
  for (const tabId of tabIds) {
    if (tabs[tabId]) tabs[tabId].groupId = groupId;
  }
  await persistTabs(tabs);
  return groupId;
}

async function createSubGroup(name, chromeGroupIds = [], projectId = null, settings = {}) {
  const subGroups = await getSubGroups();
  const id = `sg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  subGroups[id] = {
    name,
    projectId,
    chromeGroupIds,
    settings: {
      timersEnabled: true,
      autoContext: true,
      lockingEnabled: true,
      ...settings
    }
  };
  await setStorage({ subGroups });
  return id;
}
