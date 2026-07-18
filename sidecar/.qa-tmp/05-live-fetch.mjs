// Sidecar v0.3.0 QA blitz — Test matrix item 3 (static/runtime): live fetch checks.
const BASE = 'https://tabatha.pondocean.co/sidecar';
const results = [];
function record(area, pass, detail) {
  results.push({ area, pass, detail });
  console.log(pass ? 'PASS' : 'FAIL', area, '-', detail);
}

async function check(path, opts = {}) {
  const url = `${BASE}${path}`;
  const resp = await fetch(url, opts);
  return resp;
}

async function main() {
  const root = await check('/');
  const rootText = await root.text();
  record('/sidecar/ -> 200', root.status === 200, `status=${root.status}`);
  record('/sidecar/ -> has <title>', /<title>[^<]+<\/title>/i.test(rootText), (rootText.match(/<title>[^<]*<\/title>/i) || ['no title'])[0]);

  const sw = await check('/sw.js');
  record('/sidecar/sw.js -> 200', sw.status === 200, `status=${sw.status} content-type=${sw.headers.get('content-type')}`);

  const manifest = await check('/manifest.webmanifest');
  const manifestStatus = manifest.status;
  let manifestJson = null;
  if (manifestStatus === 200) {
    try {
      manifestJson = await manifest.json();
    } catch {
      /* ignore */
    }
  }
  record('/sidecar/manifest.webmanifest -> 200', manifestStatus === 200, `status=${manifestStatus}`);
  record('manifest.webmanifest -> valid JSON with icons[]', Array.isArray(manifestJson?.icons) && manifestJson.icons.length > 0, JSON.stringify(manifestJson?.icons?.map((i) => i.src)));

  const iconPaths = manifestJson?.icons?.map((i) => i.src) || ['/icons/icon-192.png', '/icons/icon-512.png'];
  for (const iconPath of iconPaths.slice(0, 4)) {
    const p = iconPath.startsWith('/sidecar') ? iconPath.replace('/sidecar', '') : iconPath.startsWith('/') ? iconPath : `/${iconPath}`;
    const iconResp = await check(p);
    record(`icon ${p} -> 200`, iconResp.status === 200, `status=${iconResp.status} content-type=${iconResp.headers.get('content-type')}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('=== SUMMARY ===', `${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
