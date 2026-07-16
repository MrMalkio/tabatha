// Pure argv parsers for the CWS auth/publish scripts. No I/O.

/**
 * Parse args for scripts/cws-auth.mjs.
 * @param {string[]} argv (process.argv.slice(2))
 */
export function parseAuthArgs(argv) {
  const out = { client: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--client') {
      out.client = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return out;
}

/**
 * Parse args for scripts/cws-publish.mjs.
 * @param {string[]} argv (process.argv.slice(2))
 */
export function parsePublishArgs(argv) {
  const out = {
    upload: argv.includes('--upload'),
    isNew: argv.includes('--new'),
    publish: argv.includes('--publish'),
    status: argv.includes('--status'),
    target: 'trustedTesters',
  };
  const targetIdx = argv.indexOf('--target');
  if (targetIdx !== -1 && argv[targetIdx + 1]) {
    out.target = argv[targetIdx + 1];
  }
  if (out.target !== 'trustedTesters' && out.target !== 'default') {
    throw new Error(`invalid --target "${out.target}" — must be "trustedTesters" or "default"`);
  }
  if (!out.upload && !out.publish && !out.status) {
    out.help = true;
  }
  return out;
}
