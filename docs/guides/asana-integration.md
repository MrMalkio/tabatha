# Asana Integration Guide

> Track a human's or agent's attention directly from an Asana task, create a linked Tabatha focus, and roll subtask time into parent totals.

## What Works in the Extension

No separate Asana installation is required for the page controls. With Tabatha v6.8.0 loaded, opening an Asana task shows a compact Tabatha strip above the InBar:

- **Set focus** creates a Tabatha focus linked to the task, or reuses its existing unresolved focus.
- **My time** starts a human-attention stint for the task.
- **Agent time** starts a stint for the name entered in the Agent name field and opens a matching tab-scoped agent-controller span.
- **Stop** closes only that human or named-agent stint. Human and agent stints may overlap intentionally.
- `?focus=true` and `/f` task URLs update the InBar to the visible task title automatically.

Tabatha reads only the current task GID, the visible title, and the visible parent-task breadcrumb. It does not read task descriptions.

## Parent and Subtask Time

Every stint is stored once against the task where it began. The row also carries every parent GID Tabatha knows:

- The subtask reports the stint as direct time.
- Each parent reports the same row as rolled-up descendant time.
- A single parent's total never counts that row twice.
- Human and agent totals remain separate at every level.

Asana exposes the immediate parent in the task UI. As more levels are visited, Tabatha's local relation map completes the ancestor chain for deeper nesting.

## Storage and Sync

Local extension storage is canonical. Starting or stopping a timer succeeds locally even when offline or signed out.

When Tabatha has a working Supabase connection, it also mirrors the stint to `public.flux_time_entries`. Migration `029_asana_attention_attribution.sql` adds:

- `source_task_gid`, `parent_task_gid`, and `ancestor_task_gids`
- `controller` (`human` or `ai-agent`) and `agent_name`
- `tabatha_focus_id` and structured `metadata`

The Flux Asana Widget route includes direct rows plus descendant rows whose ancestor chain contains the task. It surfaces nested-task and agent-attention totals when present.

## Optional Asana Widget Server

The page controls do not require the server. The server is only needed to render a native Flux summary attachment inside Asana.

The server lives in this repository at `flux-asana-widget/`.

1. Install its dependencies with `npm install` in that directory.
2. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ASANA_CLIENT_SECRET`, `PORT`, and `BASE_URL` in its ignored `.env` file.
3. Provide an HTTPS certificate when registering it as an Asana App Component; HTTP is suitable only for local route testing.
4. Start it with `npm start` and verify `/health`.
5. In Tabatha Settings → Integrations, enter the server URL and enable Asana sync.

## Verification

1. Reload the unpacked Tabatha extension after rebuilding it.
2. Open an Asana task, preferably with `?focus=true`.
3. Confirm the InBar title and Tabatha task strip match the task.
4. Click **My time**, wait briefly, then stop it.
5. Enter an agent name, click **Agent time**, and confirm the violet agent-controller state appears; stop it.
6. On a subtask with a visible parent, confirm the strip says that time rolls up to the parent.
7. If the native Asana widget is configured, refresh its attachment and confirm direct/nested and agent totals.

## Troubleshooting

| Issue | Check |
|---|---|
| Task strip does not appear | Reload Tabatha at `chrome://extensions`, then refresh the Asana tab. |
| InBar shows the previous task | Refresh the Asana page once; Tabatha also rechecks SPA navigation every three seconds. |
| Parent is not shown | Open the task's full-screen/focused view so Asana renders the parent breadcrumb. |
| Timer works locally but not in the widget | Confirm Supabase sign-in and that migration 029 is applied. |
| Native widget is empty | Confirm the widget server can reach Supabase and the App Component points to its HTTPS URL. |
