// ============================================================
// Tabatha — Install Identity (Phase A: multi-profile awareness)
// Owns _browserProfile in chrome.storage.local: a per-install identity
// (browser profile, on this machine) that survives across reloads but
// is distinct across Chrome profiles and across machines.
//
// localId is generated once on first access and never reset. supabaseId
// is filled in by syncService after the first successful browser_profiles
// upsert. Both are needed: localId names the install before any sign-in;
// supabaseId is the FK we stamp on every synced row.
// ============================================================

const STORAGE_KEY = '_browserProfile';

const VALID_CLASSIFICATIONS = ['business', 'professional', 'work', 'personal'];

const DEFAULT_IDENTITY = {
  localId: null,
  supabaseId: null,
  classification: 'professional',
  profileName: '',
  createdAt: null,
  lastSeenAt: null
};

function safeRandomUUID() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  // Fallback — MV3 service worker and modern Chrome page contexts always have
  // crypto.randomUUID, so this is purely defensive.
  return 'tba-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

async function readRaw() {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  return got?.[STORAGE_KEY] || null;
}

async function writeRaw(identity) {
  await chrome.storage.local.set({ [STORAGE_KEY]: identity });
  return identity;
}

// Returns the current identity, initialising localId + createdAt on first
// call so even a not-yet-signed-in install has a stable handle.
export async function getInstallIdentity() {
  const existing = await readRaw();
  if (existing && existing.localId) return existing;

  const now = new Date().toISOString();
  const fresh = {
    ...DEFAULT_IDENTITY,
    ...(existing || {}),
    localId: existing?.localId || safeRandomUUID(),
    createdAt: existing?.createdAt || now
  };
  return writeRaw(fresh);
}

export async function patchInstallIdentity(patch) {
  const current = await getInstallIdentity();
  const next = { ...current, ...patch };
  return writeRaw(next);
}

export async function setClassification(classification) {
  if (!VALID_CLASSIFICATIONS.includes(classification)) {
    throw new Error(`Invalid classification: ${classification}. Must be one of ${VALID_CLASSIFICATIONS.join(', ')}.`);
  }
  return patchInstallIdentity({ classification });
}

export async function setProfileName(profileName) {
  return patchInstallIdentity({ profileName: String(profileName || '').slice(0, 200) });
}

export async function recordSupabaseId(supabaseId) {
  return patchInstallIdentity({ supabaseId, lastSeenAt: new Date().toISOString() });
}

export async function touchLastSeen() {
  return patchInstallIdentity({ lastSeenAt: new Date().toISOString() });
}

export { VALID_CLASSIFICATIONS, STORAGE_KEY as INSTALL_IDENTITY_KEY };
