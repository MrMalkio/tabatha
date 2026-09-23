# Tabatha Atlas

Instance of [Atlas](https://github.com/MrMalkio/Atlas) (engine v0.0.8).

- Populate `atlas-data.json` (use the atlas-generate skill for a full multi-agent sweep).
- `node sync-data.js` after every edit — validates, injects, snapshots history.
- Publish `atlas.html` at a stable URL; record that URL here:
  **URL:** https://claude.ai/code/artifact/4ad67ef5-a1e2-429d-a66e-2edcf24582d1

  First published 2026-08-01 — 128 nodes, 201 edges, 9 clusters (v0.1.0).

  **Note on `package.json` in this directory:** the parent Tabatha repo declares
  `"type": "module"`, which breaks the CommonJS `sync-data.js` that Atlas
  `init-instance.mjs` scaffolds. The local `package.json` re-scopes only this
  directory back to CommonJS so `node sync-data.js` runs. Do not add
  dependencies to it.
- Registry task (sys-atlas): https://app.asana.com/1/9526911872029/project/1217082820115584/task/1217091677341759
- Pull engine upgrades with: `node <atlas-repo>/scripts/update-instance.mjs .`
