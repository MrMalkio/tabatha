// Helpers for locating and parsing a downloaded Google OAuth "Desktop app"
// client_secret_*.json file. Pure/testable pieces are separated from the
// real filesystem walk so tests never need to touch a real Downloads dir.

/**
 * Pick the newest matching client_secret file from a directory listing.
 * @param {Array<{name: string, mtimeMs: number}>} entries
 * @param {{ preferredFragment?: string }} [opts]
 * @returns {{name: string, mtimeMs: number}|null}
 */
export function pickNewestClientSecret(entries, opts = {}) {
  const { preferredFragment } = opts;
  const candidates = entries.filter((e) => /^client_secret_.*\.json$/i.test(e.name));
  if (candidates.length === 0) return null;

  const preferred = preferredFragment
    ? candidates.filter((e) => e.name.includes(preferredFragment))
    : [];
  const pool = preferred.length > 0 ? preferred : candidates;

  return pool.slice().sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/**
 * Parse a Google "Desktop app" OAuth client_secret JSON payload.
 * @param {string} jsonText
 * @returns {{ clientId: string, clientSecret: string }}
 */
export function parseClientSecretJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`client_secret file is not valid JSON: ${e.message}`);
  }
  const block = parsed.installed ?? parsed.web;
  if (!block) {
    throw new Error('client_secret JSON has neither "installed" nor "web" block');
  }
  const { client_id: clientId, client_secret: clientSecret } = block;
  if (!clientId || !clientSecret) {
    throw new Error('client_secret JSON is missing client_id/client_secret');
  }
  return { clientId, clientSecret };
}

/**
 * Real-filesystem lookup: newest client_secret_*1006989794983* in
 * downloadsDir, falling back to newest client_secret_*.json.
 * @param {string} downloadsDir
 * @param {{ readdirSync: Function, statSync: Function }} fsImpl
 * @param {{ preferredFragment?: string }} [opts]
 * @returns {string|null} absolute path, or null if none found
 */
export function findNewestClientSecretPath(downloadsDir, fsImpl, opts = {}) {
  const { readdirSync, statSync } = fsImpl;
  let names;
  try {
    names = readdirSync(downloadsDir);
  } catch {
    return null;
  }
  const entries = names.map((name) => {
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(`${downloadsDir}/${name}`).mtimeMs;
    } catch {
      /* skip unreadable entries */
    }
    return { name, mtimeMs };
  });
  const picked = pickNewestClientSecret(entries, opts);
  return picked ? `${downloadsDir}/${picked.name}` : null;
}
