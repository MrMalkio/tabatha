// ════════════════════════════════════════════
// Tabatha — Unified Task URL Resolver
// Parses Asana (V0 + V1) and ClickUp URLs
// ════════════════════════════════════════════

/**
 * Parse an Asana URL into structured data
 * Supports both V0 (legacy) and V1 (new) URL formats
 */
export function parseAsanaUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('asana.com')) return null;
    const path = u.pathname;
    const focusMode = u.searchParams.get('focus') === 'true' || /\/f\/?$/.test(path);
    let m;

    // V1: /1/{workspace_gid}/task/{task_gid}
    m = path.match(/^\/1\/(\d+)\/task\/(\d+)/);
    if (m) return { platform: 'asana', workspaceGid: m[1], taskGid: m[2], type: 'task', focusMode };

    // V1: /1/{workspace_gid}/project/{project_gid}
    m = path.match(/^\/1\/(\d+)\/project\/(\d+)/);
    if (m) return { platform: 'asana', workspaceGid: m[1], projectGid: m[2], type: 'project' };

    // V1: /1/{workspace_gid}/goal/{goal_gid}
    m = path.match(/^\/1\/(\d+)\/goal\/(\d+)/);
    if (m) return { platform: 'asana', workspaceGid: m[1], goalGid: m[2], type: 'goal' };

    // V1: /1/{workspace_gid}/portfolio/{portfolio_gid}
    m = path.match(/^\/1\/(\d+)\/portfolio\/(\d+)/);
    if (m) return { platform: 'asana', workspaceGid: m[1], portfolioGid: m[2], type: 'portfolio' };

    // V0: /0/search/{project_gid}/{task_gid}
    m = path.match(/^\/0\/search\/(\d+)\/(\d+)/);
    if (m) return { platform: 'asana', projectGid: m[1], taskGid: m[2], type: 'task', focusMode };

    // V0: /0/0/{task_gid} (standalone task)
    m = path.match(/^\/0\/0\/(\d+)/);
    if (m) return { platform: 'asana', taskGid: m[1], type: 'task', focusMode };

    // V0: /0/{project_gid}/{task_gid} (task in project)
    m = path.match(/^\/0\/(\d+)\/(\d+)/);
    if (m) return { platform: 'asana', projectGid: m[1], taskGid: m[2], type: 'task', focusMode };

    // V0: /0/inbox/{notification_gid}
    m = path.match(/^\/0\/inbox\/(\d+)/);
    if (m) return { platform: 'asana', type: 'inbox' };

    // V0: /0/home or .../list (my tasks)
    if (path.match(/^\/0\/home/) || path.match(/\/list$/)) {
      return { platform: 'asana', type: 'my_tasks' };
    }

    // V0: /0/{project_gid} (project view)
    m = path.match(/^\/0\/(\d+)$/);
    if (m) return { platform: 'asana', projectGid: m[1], type: 'project' };

    return { platform: 'asana', type: 'other', path };
  } catch (e) { return null; }
}

/**
 * Parse a ClickUp URL into structured data
 * Supports all known ClickUp URL patterns
 */
export function parseClickUpUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('clickup.com')) return null;
    const path = u.pathname;
    let m;

    // Task: /t/{custom_task_id} or /t/{task_id}
    m = path.match(/^\/t\/([a-z0-9]+)/i);
    if (m) return { platform: 'clickup', taskId: m[1], type: 'task' };

    // Task in workspace: /{team_id}/v/t/{task_id}
    m = path.match(/^\/(\d+)\/v\/t\/([a-z0-9]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], taskId: m[2], type: 'task' };

    // List: /{team_id}/v/l/li/{list_id}
    m = path.match(/^\/(\d+)\/v\/l\/li\/(\d+)/);
    if (m) return { platform: 'clickup', teamId: m[1], listId: m[2], type: 'list' };

    // Board: /{team_id}/v/b/{board_id}
    m = path.match(/^\/(\d+)\/v\/b\/([a-z0-9-]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], boardId: m[2], type: 'board' };

    // Space: /{team_id}/v/s/{space_id}
    m = path.match(/^\/(\d+)\/v\/s\/(\d+)/);
    if (m) return { platform: 'clickup', teamId: m[1], spaceId: m[2], type: 'space' };

    // Folder: /{team_id}/v/f/{folder_id}
    m = path.match(/^\/(\d+)\/v\/f\/(\d+)/);
    if (m) return { platform: 'clickup', teamId: m[1], folderId: m[2], type: 'folder' };

    // Doc: /{team_id}/v/dc/{doc_id}
    m = path.match(/^\/(\d+)\/v\/dc\/([a-z0-9-]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], docId: m[2], type: 'doc' };

    // Dashboard: /{team_id}/v/d/{dashboard_id}
    m = path.match(/^\/(\d+)\/v\/d\/([a-z0-9-]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], dashboardId: m[2], type: 'dashboard' };

    // Goals: /{team_id}/goals/{goal_id}
    m = path.match(/^\/(\d+)\/goals\/(\d+)/);
    if (m) return { platform: 'clickup', teamId: m[1], goalId: m[2], type: 'goal' };

    // Goals list: /{team_id}/goals
    m = path.match(/^\/(\d+)\/goals$/);
    if (m) return { platform: 'clickup', teamId: m[1], type: 'goals_list' };

    // Whiteboard: /{team_id}/v/wb/{id}
    m = path.match(/^\/(\d+)\/v\/wb\/([a-z0-9-]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], whiteboardId: m[2], type: 'whiteboard' };

    // Form: /{team_id}/v/fm/{id}
    m = path.match(/^\/(\d+)\/v\/fm\/([a-z0-9-]+)/i);
    if (m) return { platform: 'clickup', teamId: m[1], formId: m[2], type: 'form' };

    // Home: /{team_id}/home
    m = path.match(/^\/(\d+)\/home/);
    if (m) return { platform: 'clickup', teamId: m[1], type: 'home' };

    // Notifications: /{team_id}/notifications
    m = path.match(/^\/(\d+)\/notifications/);
    if (m) return { platform: 'clickup', teamId: m[1], type: 'notifications' };

    return { platform: 'clickup', type: 'other', path };
  } catch (e) { return null; }
}

/**
 * Unified resolver — tries both Asana and ClickUp
 * Returns null if URL doesn't match any known task platform
 */
export function resolveTaskUrl(url) {
  return parseAsanaUrl(url) || parseClickUpUrl(url);
}

/**
 * Get a human-readable label for a parsed task URL
 */
export function getTaskLabel(parsed) {
  if (!parsed) return null;
  const p = parsed.platform === 'asana' ? 'Asana' : 'ClickUp';
  switch (parsed.type) {
    case 'task': return `${p} Task${parsed.taskGid ? ` #${parsed.taskGid}` : parsed.taskId ? ` #${parsed.taskId}` : ''}`;
    case 'project': return `${p} Project${parsed.projectGid ? ` #${parsed.projectGid}` : ''}`;
    case 'goal': return `${p} Goal`;
    case 'portfolio': return `${p} Portfolio`;
    case 'inbox': return `${p} Inbox`;
    case 'my_tasks': return `${p} My Tasks`;
    case 'list': return `${p} List`;
    case 'board': return `${p} Board`;
    case 'space': return `${p} Space`;
    case 'folder': return `${p} Folder`;
    case 'doc': return `${p} Doc`;
    case 'dashboard': return `${p} Dashboard`;
    case 'goals_list': return `${p} Goals`;
    case 'whiteboard': return `${p} Whiteboard`;
    case 'form': return `${p} Form`;
    case 'home': return `${p} Home`;
    case 'notifications': return `${p} Notifications`;
    default: return `${p} (${parsed.type})`;
  }
}
