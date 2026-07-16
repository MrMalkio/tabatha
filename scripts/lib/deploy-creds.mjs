// Tabatha deploy-creds.local reader/writer — pure helpers, no network/fs side
// effects except the two explicit read/write entry points at the bottom.
//
// Format: KEY=value lines. Blank lines and lines starting with `#` are
// comments and are preserved verbatim (order-stable) on write. Values are
// NOT quoted or escaped — this file is gitignored (`*.local`) and never
// printed; keep it that simple.
//
// SECURITY: never log parsed values. Callers should only ever log booleans
// or lengths derived from these values (see docs/cws-api-release.md).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Parse KEY=value text into an ordered structure that preserves every line
 * (comments, blanks, and key lines) so a later `serializeCreds` round-trips
 * anything the parser doesn't touch.
 * @param {string} text
 * @returns {{ lines: Array<{raw: string, key: string|null}>, values: Record<string,string> }}
 */
export function parseCreds(text) {
  const lines = [];
  const values = {};
  const src = text ?? '';
  for (const raw of src.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      lines.push({ raw, key: null });
      continue;
    }
    const eq = raw.indexOf('=');
    if (eq === -1) {
      lines.push({ raw, key: null });
      continue;
    }
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1);
    lines.push({ raw, key });
    values[key] = value;
  }
  return { lines, values };
}

/**
 * Merge `updates` (key -> value) into a previously-parsed creds structure.
 * Existing keys are updated IN PLACE (same line position); new keys are
 * appended at the end, each on its own line. Returns the new full text.
 * @param {{lines: Array<{raw:string,key:string|null}>}} parsed
 * @param {Record<string,string>} updates
 * @returns {string}
 */
export function mergeCreds(parsed, updates) {
  const remaining = new Map(Object.entries(updates));
  const outLines = parsed.lines.map((line) => {
    if (line.key !== null && remaining.has(line.key)) {
      const value = remaining.get(line.key);
      remaining.delete(line.key);
      return `${line.key}=${value}`;
    }
    return line.raw;
  });
  // trim a single trailing blank line so appended keys don't double up gaps
  while (outLines.length && outLines[outLines.length - 1] === '') outLines.pop();
  for (const [key, value] of remaining) {
    outLines.push(`${key}=${value}`);
  }
  return `${outLines.join('\n')}\n`;
}

/**
 * Read and parse a deploy-creds.local file. Returns `{}` values if the file
 * does not exist yet (first-run case for cws-auth.mjs).
 * @param {string} path
 */
export function readCreds(path) {
  if (!existsSync(path)) return { lines: [], values: {} };
  return parseCreds(readFileSync(path, 'utf8'));
}

/**
 * Update (or create) a deploy-creds.local file, preserving existing keys,
 * comments, and ordering, updating/appending only the given keys.
 * @param {string} path
 * @param {Record<string,string>} updates
 */
export function writeCredsUpdate(path, updates) {
  const parsed = readCreds(path);
  const text = mergeCreds(parsed, updates);
  writeFileSync(path, text);
  return text;
}

/**
 * Convenience: read creds and return only the plain values map.
 * @param {string} path
 */
export function readCredsValues(path) {
  return readCreds(path).values;
}
