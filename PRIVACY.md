# Tabatha Privacy Policy

**Effective date: 2026-07-15**

Tabatha is a context and focus manager for your browser, built by Duck & Shark as part
of the Flux ecosystem. This policy explains, in plain language, what Tabatha collects,
what it never collects, where your data lives, and who can see it.

## What Tabatha collects

Tabatha collects **browsing metadata only** — enough to show you where your time and
attention go, and nothing more:

- **Tab URLs and titles** of the pages you visit
- **Timestamps and session durations** (when a focus session or clock-in started and
  ended, and how long you spent)
- **The Context and Intent labels you type in yourself** (e.g. "Q1 Report",
  "researching flights")
- **Focus and clock in/out session state**

## What Tabatha explicitly does NOT collect

- **No screenshots** of your pages
- **No keystrokes** or keylogging of any kind
- **No page content** — form field values, message text, page body text, documents,
  or anything you read or write inside a page is never captured or transmitted

In short: Tabatha knows *which* site you were on and *for how long*, and *why you said
you were there* — never *what you did on the page*.

## Where your data is stored

Your data is stored locally in your browser (`chrome.storage`) and synced to our cloud
backend (a managed Postgres database) roughly every 5 minutes and on changes, tied to
your account so it follows you across machines.

Access is scoped with row-level security: **each user can only read their own rows.**
For team/organization accounts, an organization owner sees only **aggregated,
non-identifying team views** (e.g. daily clock totals) — never raw per-user row access
through those views.

## Selling and sharing: none

- Your data is **never sold**.
- Your data is **never shared with third parties**.
- There is **no advertising use and no analytics resale**.
- Data is used solely to provide Tabatha's own functionality: context and time
  tracking, cross-device sync, and — for organization accounts — aggregated team
  reporting to your own organization's owner.

## Your account and control

Your data is tied to your sign-in identity so it can be recovered on a new machine or
after a fresh install. You can stop collection at any time by signing out or removing
the extension.

## Contact

Questions, or a request about your data (access, correction, deletion):

**caspera@duckandshark.com** (Duck & Shark — organization contact)

---

*This policy covers the Tabatha browser extension. If our practices change, this page
and its effective date will be updated before the change takes effect.*
