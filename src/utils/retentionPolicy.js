// ============================================================
// Pure retention planner (Cortex C3 — Storage & Retention).
// Computes a deterministic, side-effect-free deletion plan from an
// inventory of stored items and a retention policy. No chrome / supabase /
// DOM dependencies — unit-tested in isolation. Inputs are never mutated.
// ============================================================

const DAY_MS = 86400000;
const PARTITIONS = ['personal', 'org'];

/**
 * Plan which stored items to delete to satisfy a retention policy.
 *
 * Three rules are applied in order (each purely functional):
 *   1. Age prune, per partition — drop items older than `maxAgeDays`.
 *   2. Space cap, per partition — if survivors exceed `maxBytes`, drop the
 *      oldest first (smallest ts) until the partition fits.
 *   3. Global min-free-disk — if `freeBytes + freedSoFar < minFreeBytes`,
 *      drop the oldest remaining items across ALL partitions until satisfied.
 *
 * @param {Array<{id:*, ts:number, bytes:number, partition:('personal'|'org')}>} inventory
 * @param {{personal?:{maxAgeDays?:number, maxBytes?:number},
 *          org?:{maxAgeDays?:number, maxBytes?:number},
 *          minFreeBytes?:number}} policy
 * @param {{now:number, freeBytes:number}} ctx
 * @returns {{toDelete:Array, keptBytes:number, freedBytes:number}}
 */
export function planRetention(inventory = [], policy = {}, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const freeBytes = ctx.freeBytes ?? 0;

  // Ids marked for deletion (Set keeps each id at most once).
  const doomed = new Set();
  const byId = new Map(inventory.map((item) => [item.id, item]));

  const isAlive = (item) => !doomed.has(item.id);

  // ── Rule 1 + 2: per-partition age prune, then space cap ──────────
  for (const partition of PARTITIONS) {
    const rules = policy[partition];
    if (!rules) continue;

    const items = inventory.filter((i) => i.partition === partition);

    // 1. Age prune.
    if (typeof rules.maxAgeDays === 'number') {
      const maxAgeMs = rules.maxAgeDays * DAY_MS;
      for (const item of items) {
        if (now - item.ts > maxAgeMs) doomed.add(item.id);
      }
    }

    // 2. Space cap on the survivors, oldest-first.
    if (typeof rules.maxBytes === 'number') {
      const survivors = items.filter(isAlive);
      let sum = survivors.reduce((s, i) => s + i.bytes, 0);
      if (sum > rules.maxBytes) {
        // Oldest (smallest ts) deleted first.
        const oldestFirst = [...survivors].sort((a, b) => a.ts - b.ts);
        for (const item of oldestFirst) {
          if (sum <= rules.maxBytes) break;
          doomed.add(item.id);
          sum -= item.bytes;
        }
      }
    }
  }

  // Bytes freed so far by rules 1 + 2.
  const freedSoFar = () =>
    [...doomed].reduce((s, id) => s + (byId.get(id)?.bytes ?? 0), 0);

  // ── Rule 3: global min-free-disk, oldest-first across all partitions ──
  if (typeof policy.minFreeBytes === 'number') {
    let effectiveFree = freeBytes + freedSoFar();
    if (effectiveFree < policy.minFreeBytes) {
      const remaining = inventory
        .filter(isAlive)
        .sort((a, b) => a.ts - b.ts); // oldest first
      for (const item of remaining) {
        if (effectiveFree >= policy.minFreeBytes) break;
        doomed.add(item.id);
        effectiveFree += item.bytes;
      }
    }
  }

  const toDelete = inventory.filter((i) => doomed.has(i.id)).map((i) => i.id);
  const freedBytes = inventory
    .filter((i) => doomed.has(i.id))
    .reduce((s, i) => s + i.bytes, 0);
  const keptBytes = inventory
    .filter((i) => !doomed.has(i.id))
    .reduce((s, i) => s + i.bytes, 0);

  return { toDelete, keptBytes, freedBytes };
}
