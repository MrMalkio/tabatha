// ============================================================
// Tabatha test util — in-memory Supabase client fake.
//
// Mirrors the slice of the supabase-js builder API the sync /
// attribution / rehydrate code paths actually use:
//
//   client.schema('tabatha').from(table)
//     .select(cols).eq(col, val).maybeSingle() / .single() / .order().limit()
//     .upsert(rows, { onConflict })
//     .insert(rows)
//     .update(payload).eq(col, val)
//   client.rpc(name, params)
//   client.auth.getSession()
//
// It RECORDS every upsert / insert / update payload (with table + options)
// onto `recorded`, and RESOLVES selects from scripted data registered per
// table via `setSelectResult` / the `selects` constructor option.
//
// The builder is a thenable: `await query` resolves to { data, error }.
// Terminal helpers maybeSingle()/single() also return that envelope.
// ============================================================

export function createSupabaseFake({
  session = { user: { id: 'auth-user-1' } },
  selects = {},
  rpc = {},
} = {}) {
  // Recorded write operations, in call order.
  const recorded = {
    upserts: [],   // { table, rows, options }
    inserts: [],   // { table, rows }
    updates: [],   // { table, payload, filters }
    rpcCalls: [],  // { name, params }
  };

  // Scripted SELECT results keyed by table name. A value is either:
  //   - an array of rows (returned for any select on that table), or
  //   - a function (filters, kind) => rows  for filter-aware scripting.
  const selectScripts = { ...selects };

  // Optional error injection keyed by `${op}:${table}` (e.g. 'select:profiles').
  const errors = {};

  function resolveSelectRows(table, filters, kind) {
    const script = selectScripts[table];
    if (typeof script === 'function') return script(filters, kind) || [];
    if (Array.isArray(script)) return script;
    return [];
  }

  function makeBuilder(table) {
    const state = {
      op: 'select',
      cols: '*',
      rows: null,
      payload: null,
      options: null,
      filters: [],
      single: false,
      maybeSingle: false,
    };

    function envelope() {
      const errKey = `${state.op}:${table}`;
      if (errors[errKey]) {
        return { data: null, error: errors[errKey] };
      }

      if (state.op === 'select') {
        const rows = resolveSelectRows(table, state.filters, 'select');
        if (state.maybeSingle) return { data: rows[0] ?? null, error: null };
        if (state.single) {
          if (!rows[0]) return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
          return { data: rows[0], error: null };
        }
        return { data: rows, error: null };
      }

      // Write ops record and return rows (so .select().single() chains work).
      if (state.op === 'insert') {
        recorded.inserts.push({ table, rows: state.rows });
        const rows = resolveSelectRows(table, state.filters, 'insert');
        if (state.single) return { data: rows[0] ?? (Array.isArray(state.rows) ? state.rows[0] : state.rows) ?? null, error: null };
        if (state.maybeSingle) return { data: rows[0] ?? null, error: null };
        return { data: rows.length ? rows : (Array.isArray(state.rows) ? state.rows : [state.rows]), error: null };
      }
      if (state.op === 'upsert') {
        recorded.upserts.push({ table, rows: state.rows, options: state.options });
        const rows = resolveSelectRows(table, state.filters, 'upsert');
        if (state.single) return { data: rows[0] ?? (Array.isArray(state.rows) ? state.rows[0] : state.rows) ?? null, error: null };
        return { data: rows.length ? rows : (Array.isArray(state.rows) ? state.rows : [state.rows]), error: null };
      }
      if (state.op === 'update') {
        recorded.updates.push({ table, payload: state.payload, filters: state.filters });
        const rows = resolveSelectRows(table, state.filters, 'update');
        if (state.single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    }

    const builder = {
      select(cols = '*') { state.op = state.op === 'select' ? 'select' : state.op; state.cols = cols; state._selectCalled = true; return builder; },
      insert(rows) { state.op = 'insert'; state.rows = rows; return builder; },
      upsert(rows, options) { state.op = 'upsert'; state.rows = rows; state.options = options || null; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      delete() { state.op = 'delete'; return builder; },
      eq(col, val) { state.filters.push([col, val]); return builder; },
      neq(col, val) { state.filters.push([col, val, 'neq']); return builder; },
      order() { return builder; },
      limit() { return builder; },
      gt() { return builder; },
      gte() { return builder; },
      lt() { return builder; },
      lte() { return builder; },
      maybeSingle() { state.maybeSingle = true; return Promise.resolve(envelope()); },
      single() { state.single = true; return Promise.resolve(envelope()); },
      then(resolve, reject) { return Promise.resolve(envelope()).then(resolve, reject); },
    };

    // After insert/upsert, supabase-js allows `.select().single()`. Our select()
    // above only flips op back to 'select' if it already was — guard that so a
    // post-write select keeps the write op for recording. Re-wire select to be
    // op-preserving when a write op is active:
    builder.select = (cols = '*') => {
      if (state.op === 'select') state.cols = cols;
      // else: keep the write op so envelope() records it; mark single via .single()
      return builder;
    };

    return builder;
  }

  const client = {
    _recorded: recorded,
    schema() {
      return { from: (table) => makeBuilder(table) };
    },
    from(table) { return makeBuilder(table); },
    rpc(name, params) {
      recorded.rpcCalls.push({ name, params });
      const scripted = rpc[name];
      const data = typeof scripted === 'function' ? scripted(params) : scripted;
      return Promise.resolve({ data: data ?? null, error: null });
    },
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async getUser() { return { data: { user: session?.user ?? null }, error: null }; },
    },
    // Test helpers
    setSelectResult(table, rowsOrFn) { selectScripts[table] = rowsOrFn; },
    setError(op, table, error) { errors[`${op}:${table}`] = error; },
    recorded,
  };

  return client;
}
