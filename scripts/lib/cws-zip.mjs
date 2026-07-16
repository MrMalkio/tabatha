// Pure path-resolution helper for the CWS store zip. No I/O — callers pass
// in existsSync so tests can stub filesystem presence.

/**
 * Resolve the store-assets zip path for the given manifest version, and
 * report whether the caller still needs to build it first.
 * @param {string} root repo root (absolute)
 * @param {string} version e.g. "6.7.17"
 * @param {(p: string) => boolean} existsSyncImpl
 * @returns {{ zipPath: string, exists: boolean }}
 */
export function resolveStoreZipPath(root, version, existsSyncImpl) {
  if (!version || !/^\d+(\.\d+){1,3}$/.test(version)) {
    throw new Error(`invalid version "${version}"`);
  }
  const zipPath = `${root.replace(/[\\/]+$/, '')}/store-assets/tabatha-store-v${version}.zip`;
  return { zipPath, exists: existsSyncImpl(zipPath) };
}
