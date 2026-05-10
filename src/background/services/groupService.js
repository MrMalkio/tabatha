import { getSubGroups, getTabData, PRIORITY_LEVELS, setStorage } from './storageService.js';
import { broadcastMessage } from './notificationService.js';

let dependencies = {
  setTabData: async (tabs) => setStorage({ tabs }),
};

let listenersRegistered = false;

export function configureGroupService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function registerGroupListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  chrome.tabGroups.onUpdated.addListener(handleChromeGroupUpdated);
  chrome.tabGroups.onRemoved.addListener(handleChromeGroupRemoved);
  chrome.tabs.onUpdated.addListener(handleTabGroupChanged);
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_SAVED_GROUPS':
      return getSavedGroups();
    case 'CREATE_GROUP': {
      const groupId = await createOrUpdateGroup(message.tabIds, message.name, message.priority);
      return { groupId };
    }
    case 'CREATE_SUB_GROUP': {
      const id = await createSubGroup(message.name);
      return { id };
    }
    case 'GET_SUB_GROUPS':
      return { subGroups: await getSubGroups() };
    default:
      return null;
  }
}

async function getSavedGroups() {
  try {
    const allGroups = await chrome.tabGroups.query({});
    const tabs = await getTabData();
    const savedGroups = {};
    for (const group of allGroups) {
      const groupTabs = await chrome.tabs.query({ groupId: group.id });
      savedGroups[group.id] = {
        id: group.id,
        title: group.title || 'Untitled Group',
        color: group.color,
        collapsed: group.collapsed,
        tabIds: groupTabs.map(t => t.id),
        tabCount: groupTabs.length,
      };
    }
    void tabs;
    return { savedGroups };
  } catch (e) {
    return { savedGroups: {} };
  }
}

async function createOrUpdateGroup(tabIds, groupName, priority) {
  const { setTabData } = dependencies;
  const color = PRIORITY_LEVELS[priority]?.color || 'grey';

  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: groupName,
    color,
    collapsed: false
  });

  // Update tab data with group ID.
  const tabs = await getTabData();
  for (const tabId of tabIds) {
    if (tabs[tabId]) {
      tabs[tabId].groupId = groupId;
    }
  }
  await setTabData(tabs);

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

async function handleChromeGroupUpdated(group) {
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
      await dependencies.setTabData(tabs);
      broadcastMessage({ type: 'GROUPS_UPDATED' });
    }
  } catch (e) { /* group may be stale */ }
}

async function handleChromeGroupRemoved(group) {
  try {
    const tabs = await getTabData();
    let changed = false;

    for (const data of Object.values(tabs)) {
      if (data.groupId === group.id) {
        data.groupId = null;
        data.groupTitle = null;
        data.groupColor = null;
        changed = true;
      }
    }

    if (changed) {
      await dependencies.setTabData(tabs);
      broadcastMessage({ type: 'GROUPS_UPDATED' });
    }
  } catch (e) { /* ignore */ }
}

async function handleTabGroupChanged(tabId, changeInfo) {
  if (changeInfo.groupId === undefined) return;

  const tabs = await getTabData();
  if (!tabs[tabId]) return;

  const noGroup = changeInfo.groupId === chrome.tabGroups?.TAB_GROUP_ID_NONE || changeInfo.groupId === -1;
  tabs[tabId].groupId = noGroup ? null : changeInfo.groupId;

  if (noGroup) {
    tabs[tabId].groupTitle = null;
    tabs[tabId].groupColor = null;
  } else {
    try {
      const group = await chrome.tabGroups.get(changeInfo.groupId);
      tabs[tabId].groupTitle = group.title || null;
      tabs[tabId].groupColor = group.color || null;
    } catch (e) { /* group may not exist yet */ }
  }

  await dependencies.setTabData(tabs);
  broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
}
