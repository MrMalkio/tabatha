# Asana Integration Guide

> Track human or agent attention directly from an Asana task, create lightweight Tabatha task context, and roll subtask time into parent totals without turning Tabatha into a project manager.

## Native Asana App Component

The primary integration is Asana app `1214413273944527`, configured for the restricted `gnge.co` workspace.

- **Entry Point:** On, with the task action **Track attention**
- **Modal Form:** On; starts or stops human attention or a named agent's attention
- **Widget:** On; displays active state, direct attention, nested rollup, agent attention, and per-actor totals
- **Lookup and Rule Actions:** Off; they are not needed for this focused task-context workflow

The deployed service is `supabase/functions/asana-widget/index.ts`:

- Modal Form metadata: `https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/asana-widget/form/metadata`
- Widget metadata: `https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/asana-widget/widget`
- Attachment URLs: `https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/asana-widget/task/{task_gid}`

Requests are authenticated with Asana's exact-body HMAC signature and require a valid `expires_at`. The Asana client secret and Supabase service role remain server-side.

## Parent and Subtask Time

Every stint is stored once against the task where it began. The row also carries every parent GID Tabatha knows:

- The subtask reports the stint as direct time.
- Each parent reports the same row as rolled-up descendant time.
- A single parent's total never counts that row twice.
- Human and agent totals remain separate at every level.

Asana exposes the immediate parent in task context. As more levels are visited or attached, Tabatha's relation map completes the ancestor chain for deeper nesting.

## Storage and Sync

The native App Component writes attention stints to `public.flux_time_entries`. Migration `029_asana_attention_attribution.sql` adds:

- `source_task_gid`, `parent_task_gid`, and `ancestor_task_gids`
- `controller` (`human` or `ai-agent`) and `agent_name`
- `tabatha_focus_id` and structured `metadata`

The Widget includes direct rows plus descendant rows whose ancestor chain contains the task. It surfaces nested-task and agent-attention totals when present.

## Supporting Browser-Extension Work

The isolated post-v6.7.22 branch also contains optional page controls. They are unmerged and unreleased; the native Asana app is the priority. If that branch is explicitly installed for testing:

- **Set focus** creates or reuses a Tabatha focus linked to the task.
- **My time** starts a human-attention stint.
- **Agent time** starts a named-agent stint and matching tab-scoped agent-controller span.
- `?focus=true` and `/f` task URLs update the InBar to the visible task title.
- Visiting a task upserts lightweight `contextOnly` task data without importing Asana project-management fields.

## Legacy Local Widget Server

`flux-asana-widget/` is retained as the original local-development/reference implementation. Production App Components use the deployed `supabase/functions/asana-widget/` service above.

1. Install its dependencies with `npm install` in that directory.
2. Configure its ignored local environment file.
3. Provide HTTPS for any temporary App Component registration; HTTP is suitable only for local route testing.
4. Start it with `npm start` and verify `/health`.
5. Do not replace the production App Component URLs with this service unless intentionally testing a separate development app.

## Verification

Live validation changes Asana project state and creates attention data, so it requires separate approval.

1. Install Tabatha from the `gnge.co` Asana app gallery into a test project.
2. Open an Asana task and select **Track attention**.
3. Start human attention, submit the form, and confirm the Tabatha attachment and Widget appear.
4. Reopen **Track attention**, stop human attention, and confirm the Widget total updates.
5. Start and stop a named agent's attention and confirm separate agent/per-actor totals.
6. Repeat on a subtask and confirm the parent Widget includes the descendant rollup exactly once.
7. Resolve linked context in Tabatha and verify that completing the Asana source remains an explicit, separate choice.

## Troubleshooting

| Issue | Check |
|---|---|
| **Track attention** is missing | Confirm the Tabatha app is installed for the task's project and the workspace is `gnge.co`. |
| Modal Form fails to open | Confirm the metadata endpoint is healthy and the app's Modal Form component remains On. |
| Widget does not appear after submission | Confirm the attachment URL matches the registered `/asana-widget/task/[0-9]+` pattern. |
| Widget is empty | Confirm migration 029 is applied and the deployed Edge Function can read `flux_time_entries`. |
| Parent total omits a subtask | Open or attach the relevant parent/subtask context so the ancestor GID chain is known. |
