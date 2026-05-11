import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * useOrgData — React hook for the Organization Hierarchy & Persistent Registry.
 * 
 * Hierarchy:
 *   Operation (the business/org)
 *     └─ Initiative (department / line of business)
 *          └─ Client
 *               └─ Project
 *                    └─ Task
 *
 * Data is stored in chrome.storage.local under 'tabathaOrg'.
 * Each entity has: id, name, parentId, type, createdAt, archived.
 */

const EMPTY_ORG = {
  operations: {},   // id → { id, name, createdAt, archived }
  initiatives: {},  // id → { id, name, operationId, createdAt, archived }
  clients: {},      // id → { id, name, initiativeId?, createdAt, archived }
  projects: {},     // id → { id, name, clientId?, createdAt, archived }
  tasks: {},        // id → { id, name, projectId?, clientId?, status, createdAt, archived }
};

const genId = () => `org_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function getStorage(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => resolve(result[key] || null));
  });
}

function setStorage(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

export function useOrgData() {
  const [org, setOrg] = useState(EMPTY_ORG);

  // Load on mount
  useEffect(() => {
    getStorage('tabathaOrg').then(data => {
      if (data) setOrg({ ...EMPTY_ORG, ...data });
    });
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const listener = (changes, areaName) => {
      if (areaName === 'local' && changes.tabathaOrg?.newValue) {
        setOrg({ ...EMPTY_ORG, ...changes.tabathaOrg.newValue });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const save = useCallback(async (updated) => {
    setOrg(updated);
    await setStorage('tabathaOrg', updated);
  }, []);

  // ── CRUD Operations ──

  const addOperation = useCallback(async (name) => {
    const id = genId();
    const updated = { ...org, operations: { ...org.operations, [id]: { id, name, createdAt: new Date().toISOString(), archived: false } } };
    await save(updated);
    return id;
  }, [org, save]);

  const addInitiative = useCallback(async (name, operationId = null) => {
    const id = genId();
    const updated = { ...org, initiatives: { ...org.initiatives, [id]: { id, name, operationId, createdAt: new Date().toISOString(), archived: false } } };
    await save(updated);
    return id;
  }, [org, save]);

  const addClient = useCallback(async (name, initiativeId = null) => {
    const id = genId();
    const updated = { ...org, clients: { ...org.clients, [id]: { id, name, initiativeId, createdAt: new Date().toISOString(), archived: false } } };
    await save(updated);
    return id;
  }, [org, save]);

  const addProject = useCallback(async (name, clientId = null) => {
    const id = genId();
    const updated = { ...org, projects: { ...org.projects, [id]: { id, name, clientId, createdAt: new Date().toISOString(), archived: false } } };
    await save(updated);
    return id;
  }, [org, save]);

  const addTask = useCallback(async (name, projectId = null, clientId = null) => {
    const id = genId();
    const updated = { ...org, tasks: { ...org.tasks, [id]: { id, name, projectId, clientId, status: 'open', createdAt: new Date().toISOString(), archived: false } } };
    await save(updated);
    return id;
  }, [org, save]);

  const updateEntity = useCallback(async (type, id, updates) => {
    const collection = org[type];
    if (!collection || !collection[id]) return;
    const updated = { ...org, [type]: { ...collection, [id]: { ...collection[id], ...updates } } };
    await save(updated);
  }, [org, save]);

  const archiveEntity = useCallback(async (type, id) => {
    await updateEntity(type, id, { archived: true });
  }, [updateEntity]);

  // ── Lookups ──

  const clientList = useMemo(() =>
    Object.values(org.clients).filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [org.clients]
  );

  const projectList = useMemo(() =>
    Object.values(org.projects).filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [org.projects]
  );

  const taskList = useMemo(() =>
    Object.values(org.tasks).filter(t => !t.archived).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [org.tasks]
  );

  const operationList = useMemo(() =>
    Object.values(org.operations).filter(o => !o.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [org.operations]
  );

  const initiativeList = useMemo(() =>
    Object.values(org.initiatives).filter(i => !i.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [org.initiatives]
  );

  // Get projects for a specific client
  const getProjectsForClient = useCallback((clientId) => {
    return projectList.filter(p => p.clientId === clientId);
  }, [projectList]);

  // Get tasks for a specific project
  const getTasksForProject = useCallback((projectId) => {
    return taskList.filter(t => t.projectId === projectId);
  }, [taskList]);

  // Get client for a project (cascade lookup)
  const getClientForProject = useCallback((projectId) => {
    const project = org.projects[projectId];
    if (!project?.clientId) return null;
    return org.clients[project.clientId] || null;
  }, [org.projects, org.clients]);

  // Find or create — for inline "add" flows in FocusInput/TagPicker
  const findOrCreateClient = useCallback(async (name) => {
    const existing = clientList.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    return addClient(name);
  }, [clientList, addClient]);

  const findOrCreateProject = useCallback(async (name, clientId = null) => {
    const existing = projectList.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    return addProject(name, clientId);
  }, [projectList, addProject]);

  const findOrCreateTask = useCallback(async (name, projectId = null, clientId = null) => {
    const existing = taskList.find(t => t.name.toLowerCase() === name.toLowerCase() && t.status !== 'complete');
    if (existing) return existing.id;
    return addTask(name, projectId, clientId);
  }, [taskList, addTask]);

  // Name lookups (for display — given an ID, return the name)
  const getClientName = useCallback((id) => org.clients[id]?.name || '', [org.clients]);
  const getProjectName = useCallback((id) => org.projects[id]?.name || '', [org.projects]);
  const getTaskName = useCallback((id) => org.tasks[id]?.name || '', [org.tasks]);

  return {
    org,
    // Lists
    clientList, projectList, taskList, operationList, initiativeList,
    // CRUD
    addOperation, addInitiative, addClient, addProject, addTask,
    updateEntity, archiveEntity,
    // Lookups
    getProjectsForClient, getTasksForProject, getClientForProject,
    getClientName, getProjectName, getTaskName,
    // Find-or-create (for inline flows)
    findOrCreateClient, findOrCreateProject, findOrCreateTask,
  };
}
