# Asana integration source recovery

Canonical preserved history: `claude/tabatha-ai-integration-layer-91903b` at 58eb001, also `origin/rescue/ai-integration-widget-work-20260718`. Earlier `Koda/asana-widget-pre-rebase` contains duplicate implementations; do not apply both.

Potential integration sequence: a53aa48, d4da05f, 5dd1c4c, 7f1bccb, 58eb001. Skip 870c195's old baseline restoration and 3fc0261's already-represented companion manifest update. Root/router/settings changes require integration against the current per-profile Asana connection model.

The enclosed backend files and migration are historical recovered source, outside deployable paths. Public GET/OPTIONS checks on 2026-09-23 confirm widget/action endpoints exist, but do not establish their deployed source revision. Supabase management authentication failed (401), so migration state and ACLs remain unverified. Never apply this historical migration blindly.

## Release hold

The rescued `asana-task-action` authenticates a Supabase user but executes caller-selected task/workspace/project operations using one global ASANA_PAT. It does not bind those resources to the authenticated caller. Activating its extension controls would expose that permission gap. Resolve it using the current per-profile Vault PAT ownership model and add cross-user authorization tests before activation. Preserve native widget source/tests for independent review. Existing live services were not changed.
