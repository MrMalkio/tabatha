import { getSubGroups, getTabData, PRIORITY_LEVELS, setStorage } from './storageService.js';

let dependencies = {
  setTabData: async (tabs) => setStorage({ tabs }),
};

export function configureGroupService(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
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
