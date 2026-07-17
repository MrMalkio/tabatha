export const DEFAULT_ANASA_BASE_URL = 'https://anasa.duckandshark.com';

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_ANASA_BASE_URL).trim().replace(/\/+$/, '');
}

export function asanaTaskHref(task = {}) {
  const external = task.externalContext?.provider === 'asana' ? task.externalContext : null;
  if (external?.url) return external.url;
  const gid = external?.externalId || task.asanaTaskGid || task.asanaGid;
  return /^\d+$/.test(String(gid || ''))
    ? `https://app.asana.com/0/0/${gid}/f`
    : null;
}

export function anasaTaskHref(task = {}, baseUrl = DEFAULT_ANASA_BASE_URL) {
  const external = task.externalContext?.provider === 'asana' ? task.externalContext : null;
  if (external?.anasaUrl) return external.anasaUrl;
  const tasksUrl = `${normalizeBaseUrl(baseUrl)}/tasks`;
  if (external?.anasaTaskId) {
    return `${tasksUrl}/${encodeURIComponent(external.anasaTaskId)}`;
  }
  const name = String(task.name || '').trim();
  return name ? `${tasksUrl}?search=${encodeURIComponent(name)}` : tasksUrl;
}

export function hasAsanaTask(task = {}) {
  return Boolean(asanaTaskHref(task));
}
