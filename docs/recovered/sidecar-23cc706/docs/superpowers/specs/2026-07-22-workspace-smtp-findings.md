# Workspace SMTP for Branded Auth Emails — Findings & Decision Record

**Status:** DECISION RECORD — settles the SMTP path so it isn't re-litigated
**Author:** Soren (Opus persona) · **Date:** 2026-07-22
**Context:** Supabase Auth (Cloud Sync backend) currently sends auth emails from a
default/shared sender. Branded auth emails (from an `@duckandshark.com` address) need a
**custom SMTP** config, which Rook's plan identified as the blocker. This record documents what
was verified tonight, what is blocked and why, the option that is dead, and the exact clicks
that remain for Malkio.

---

## 1. The reality check (headline)

Supabase custom SMTP needs four values: **host, port, username, password.** It works by
Supabase's *own Auth infrastructure* opening an outbound SMTP connection to the host you give
it, authenticating with the username/password you give it. ([Supabase custom-SMTP
docs](https://supabase.com/docs/guides/auth/auth-smtp).)

The clean, documented path is therefore:

| Field | Value |
|---|---|
| Host | `smtp.gmail.com` (or `smtp-relay.gmail.com` — see §3) |
| Port | `587` (STARTTLS) |
| Username | a **Google Workspace account** in `duckandshark.com` (the sending identity) |
| Password | a **Google App Password** minted on that account |

The load-bearing constraint: **App Passwords are per-user.** They are created by the account
owner at `myaccount.google.com/apppasswords`, and that page only appears once **2-Step
Verification is ON** for that account. **An admin CANNOT create an app password for another
user from the admin console.** So no amount of admin-console work produces the password — it is
an owner action on the chosen account, and the credential never touches an agent (standing
safety rule: passwords/app-passwords are Malkio-only).

---

## 2. What was verified tonight, and what is blocked

Attempted via Malkio's authenticated Chrome (claude-in-chrome) and the installed `gws` CLI.

**Blocked — could not verify in-console:**
- **admin.google.com is unreadable to the extension.** Every screenshot / text read on
  `admin.google.com` returns *"Cannot access contents of the page. Extension manifest must
  request permission to access the respective host."* The claude-in-chrome extension has **no
  host permission for admin.google.com**, so admin pages can be navigated but not observed
  (no screenshot, no DOM, no text). → *Malkio action: grant the extension host access to
  admin.google.com if agent-side admin reads are ever wanted.*
- **Sensitive admin areas force a password re-challenge.** Navigating to
  `admin.google.com/ac/apps/gmail/routing` (where the SMTP relay service lives) bounced to
  `accounts.google.com/v3/signin/challenge/pwd` — a fresh password reauth wall. Passwords are
  Malkio-only; the agent stopped here and did not enter anything.
- **The `gws` CLI token lacks scope.** `gws admin:directory_v1 …` is not wired (unlisted API),
  and even `gws gmail users getProfile` returns `403 insufficient authentication scopes`. So
  the Directory API could not be used to list users/groups either.

**Net:** whether `tabatha@duckandshark.com` exists as a **user** or a **group** could **not** be
verified tonight — both the console (host-block + reauth) and the API (scope) paths are walled by
things only Malkio can pass. This is a Malkio check (§4), not an agent one.

---

## 3. The dead option — killed in writing

**Idea:** configure Google Workspace **SMTP relay** to *"only accept mail from these IP
addresses,"* with TLS but **no authentication**, so Supabase could relay without an app password.

**This does not work. Two independent reasons, either one fatal:**

1. **Supabase does not have pin-able egress IPs.** Supabase's Auth server makes the outbound
   SMTP connection from *its own infrastructure*; Supabase does **not** publish a stable/static
   set of egress IPs for that sender. You cannot IP-allowlist a sender whose IPs you cannot
   pin, so the relay's "accept from these IPs" mode has nothing safe to list. (Confirmed against
   [Supabase's SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp) — the connection
   originates from Supabase, and no stable egress-IP range is documented.)
2. **Supabase's SMTP config has no no-auth mode.** The custom-SMTP form *requires* username +
   password; Supabase will always attempt authenticated submission. A relay configured for
   "no auth, IP-allowlist only" doesn't match Supabase's connection model at all.

**Conclusion: the IP-allowlist / no-auth relay path is dead. Do not revisit it.** Every viable
path requires an authenticated sender = a Workspace account + app password. The relay
(`smtp-relay.gmail.com`) is still *usable* — but only in its **"Require SMTP Authentication"**
mode, which needs the same app password as the plain `smtp.gmail.com` path and adds nothing that
removes the credential requirement. Its only advantage (sending as arbitrary domain addresses /
higher volume) is not needed for auth-email volumes, so **plain `smtp.gmail.com:587` + app
password is the recommended path.**

---

## 4. Exactly what remains for Malkio (ideally one app-password link)

Two decisions, then two clicks:

1. **Choose the sending account** (this is the only real decision):
   - **Recommended:** use an existing Workspace user (e.g. `caspera@duckandshark.com`) as the
     sender — zero cost, works immediately. The "From" address can be branded in Supabase's
     sender-name/sender-email fields independently of the SMTP login, subject to Workspace's
     send-as rules.
   - If a dedicated `tabatha@duckandshark.com` sender is wanted: **first check whether it already
     exists** (Admin console → Directory → Users, search "tabatha"; and → Directory → Groups).
     - If it exists as a **user** → use it.
     - If it exists as a **group** → a group can be a *From* address via send-as/relay but
       **cannot hold an app password** (groups don't authenticate); the SMTP *login* still has to
       be a real user account.
     - If it does **not** exist → creating a new **licensed user costs money → MORNING-QUESTION,
       not done by an agent.** Prefer reusing an existing user instead.

2. **On the chosen account, do the two owner-only clicks** (credentials never touch an agent):
   - Enable **2-Step Verification**: `myaccount.google.com/security` → 2-Step Verification → turn on.
   - Mint an **App Password**: **`https://myaccount.google.com/apppasswords`** → name it
     "Supabase Auth" → copy the 16-char password.

3. **Paste into Supabase** (Cloud Sync) → Auth → SMTP Settings: host `smtp.gmail.com`, port `587`,
   username = the chosen account, password = the app password, sender email/name = the branded
   values. Send a test.

**The single link that unblocks everything:** `https://myaccount.google.com/apppasswords`
(after 2SV is on for the chosen account).

---

## 5. Related state captured tonight (CWS / force-install — Priority 2)

Same admin-console walls (host-block + potential reauth) mean the Workspace force-install page
could not be observed, and a blind add-by-ID click (with no ability to read the result) was
**not** attempted — attempting an unobservable config change in Workspace admin would violate
verify-reachability and is not in-pattern. What *was* verifiable, via the read-only CWS API
(`scripts/cws-publish.mjs` creds, GET only):

- **CWS item `piopncjacohahbkkmockjnpenhdbmmbc` exists** with an uploaded package,
  `crxVersion: 6.7.47`. The API's `items.get` does **not** expose review/publish state
  (`uploadState=NOT_FOUND` under DRAFT projection is the API's quirk for "no *new* draft
  pending," not a review verdict) — publish/review status is **dashboard-only**, and the
  dashboard is host-blocked to the extension.
- The self-hosted fleet CRX channel (jbdka line) is ahead at 6.7.50+ (per OPERATIONS §2.2b);
  the CWS store copy trails at 6.7.47.

**Remaining for Malkio (Priority 2), on the admin console he can see:**
- Devices → Chrome → Apps & extensions: confirm the `jbdka…` entry reports the recent fleet
  version (6.7.50+).
- Try add-by-ID `piopncjacohahbkkmockjnpenhdbmmbc` **once**: if the CWS item cleared review it
  succeeds → set **Force install**, keep the `jbdka…` entry in place (don't remove it). If it
  errors "Failed to add app," it's still in review → cancel cleanly, leave the self-hosted
  channel as the live path.

---

## 6. One-line summary

Branded auth email = Supabase custom SMTP = `smtp.gmail.com:587` + a Workspace account + an app
password that only Malkio can mint (2SV → `myaccount.google.com/apppasswords`); the IP-allowlist
no-auth relay is dead (no pin-able Supabase egress IPs, and Supabase has no no-auth mode); the
admin-console verifications (identity existence, force-install state) are walled tonight by a
host-permission block and a password reauth that only Malkio can clear.
