# Feature #223 — First-Login Onboarding: Sign In to Sync / Join an Organization

**Status:** captured — slot into Plan 045 (Growth & Integrations) build order
**Source:** Malkio, 2026-07-21 (CWS listing pass)
**Related:** Plan 045 (invites, quotas, account types), #222 device management,
CWS rollout (store installs land on fresh profiles with no local state)

## The ask

On first login (and first install), invite the user to **sign in to sync** or
**join an organization**. Store-channel installs especially: a teammate whose
admin force-installed Tabatha gets a working local extension but no cloud sync,
no org membership, and no prompt telling them those exist.

## Scope sketch (v1)

- First-run detection (no account signed in + no prior dismissal) → a
  one-time, dismissible onboarding surface (home page card and/or gatekeeper
  first-open interstitial — NOT a nag loop):
  - **Sign in to sync** — cloud sync of contexts/focus/settings across devices
    (existing identity flow).
  - **Have an invite?** — redeem a Demo/Personal/Team invite code
    (`redeem_invite_token`, migrations 042-044) which creates/attaches the
    account, including org join for team invites.
- Signed in but org-less + holding nothing: quiet "join your team" affordance in
  settings (org invite redemption), not a recurring prompt.
- Respect account_type semantics (demo vs standard) from migration 044.

## Notes

- Copy must not name backend infra ("cloud sync", never vendor names).
- Workspace force-install cohort: consider a managed-storage hint later
  (admin-preset org slug) — v2, requires managed schema.
