# Tabatha Privacy Policy

**Effective date: 2026-07-16**

Tabatha is a context and focus manager for your browser, built by Duck & Shark as part
of the Flux ecosystem. This policy explains, in plain language, what Tabatha collects,
what it never collects, where your data lives, and who can see it.

## What changed on 2026-07-16

An earlier version of this policy said Tabatha takes **no screenshots, ever**. That is
no longer accurate, and we would rather say so plainly than quietly edit the page.

Tabatha now includes an **optional** screen capture feature. It is **off by default**,
you have to turn it on yourself, and when it is on the images are written **to your own
machine and are never uploaded to us**. The section below describes it honestly. If you
never turn it on, nothing about your data has changed.

## What Tabatha collects by default

With a fresh install and nothing turned on, Tabatha collects **browsing metadata only**
— enough to show you where your time and attention go, and nothing more:

- **Tab URLs and titles** of the pages you visit
- **Timestamps and session durations** (when a focus session or clock-in started and
  ended, and how long you spent)
- **The Context and Intent labels you type in yourself** (e.g. "Q1 Report",
  "researching flights")
- **Focus and clock in/out session state**

## What Tabatha never collects

- **No keystrokes** or keylogging of any kind
- **No page content** — form field values, message text, page body text, documents,
  or anything you read or write inside a page is never captured as text or transmitted

## Screen capture: off unless you turn it on

Tabatha can optionally take periodic snapshots of the tab you are looking at, so that
you (or an AI assistant you run yourself) can reconstruct what you were working on.
This feature is **opt-in and disabled by default**. Here are the exact terms:

- **It is off until you switch it on.** The setting lives in Settings under Privacy &
  Capture. A brand-new install captures nothing.
- **Frames are redacted before they are saved.** Sensitive regions are blacked out (or
  blurred, if you prefer) by a redaction pass that **fails closed** — if redaction
  cannot be applied, the frame is discarded rather than saved unredacted.
- **Frames stay on your machine.** They are written to a folder on your own computer by
  the Tabatha desktop companion, or into your browser's private storage if the
  companion is not running. **They are not uploaded to us, to any AI service, or to
  anyone else.** No part of Tabatha sends image data off your device.
- **They expire on their own.** Frames are automatically deleted after 30 days by
  default. Frames recorded while you were clocked in for an organization are kept for
  90 days.
- **You can stop it and delete them at any time.** Turning the setting off stops
  capture immediately, and the files are ordinary files in a folder you own — you can
  delete them yourself, whenever you like, without asking us.

Only a **file path** referencing a frame is recorded alongside your metadata. The
image itself never travels with it.

## The desktop companion

The optional Tabatha desktop companion tracks which application you are using when
your browser is not in front, so your time is not lost when you switch to another app.
It can also capture your screen at the operating-system level — under **exactly the
same terms as above**: off unless you turn it on, redacted, written to your own disk,
never uploaded, auto-deleted on the same schedule. Sensitive-window rules can suppress
or redact specific regions, and that redaction also fails closed. The companion is
Windows-only today.

## AI features

Tabatha is built to work with AI assistants. It is important to be precise about what
that does and does not mean today:

- **By default, Tabatha sends nothing to any AI service.** The default mode writes a
  local file describing your day to your own disk. If an AI assistant reads it, that is
  an assistant *you* run on *your* machine, under your own arrangement with whoever
  provides it — Tabatha is not the one sending it.
- Tabatha has **optional** modes that would send a *text* summary of your day — the
  metadata described above, including tab titles, plus any voice notes you record — to
  an AI service. These modes are **not enabled and not currently selectable**, and they
  require you to sign in or supply your own AI provider details. **No screen captures
  or images are ever included in these — they are text-only by design.**
- If we turn any of those modes on, we will update this policy and its effective date
  before the change takes effect.

## Where your data is stored

Your metadata is stored locally in your browser (`chrome.storage`) and synced to our
cloud backend (a managed Postgres database) roughly every 5 minutes and on changes,
tied to your account so it follows you across machines. **Screen captures are not part
of this sync and are never sent to our backend.**

Access is scoped with row-level security: **each user can only read their own rows.**
For team/organization accounts, an organization owner sees only **aggregated,
non-identifying team views** (e.g. daily clock totals) — never raw per-user row access
through those views, and never your screen captures.

## Organization accounts

We are building the ability for an organization to set a capture policy for its
members. **It is not in effect today.** As Tabatha currently ships, the capture setting
is **yours alone**: it is read only from your own device, and **no administrator, owner,
or employer can switch capture on, change its mode, or change how long frames are kept
on your machine.** If that ever changes, it will be announced here, with an effective
date, before it takes effect.

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

## The waitlist on our website

Tabatha is not released yet. The only thing our website asks for is an email address,
so we can tell you when it is.

- We store **the address you type, the date you submitted it, and which page it came
  from.** That is the whole record.
- We use it for **exactly one thing**: to email you about Tabatha becoming available.
  No newsletter, no marketing sequence, no sharing, no selling.
- It is **not linked to any browsing data.** The waitlist has no connection to the
  extension's data, because if you are on the waitlist you do not have the extension
  yet.
- The list is **not publicly readable** and our own website cannot read it back. The
  signup form can only add to it.
- **Ask us and we will remove you**, at the contact address below. You do not need an
  account to be forgotten, since the waitlist does not create one.

## Contact

Questions, or a request about your data (access, correction, deletion):

**caspera@duckandshark.com** (Duck & Shark — organization contact)

---

*This policy covers the Tabatha browser extension, the Tabatha desktop companion, and
the waitlist on the Tabatha website. If our practices change, this page and its
effective date will be updated before the change takes effect.*
