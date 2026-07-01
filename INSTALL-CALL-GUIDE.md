# Tabatha Install Call — Guide for Malkio

A companion script for the live install call with Reggie & Po. Goal: watch them install
end-to-end, catch friction in real time, and leave the call with both of them clocked in
and synced.

## Before the call
- [ ] Have `Tabatha-Desktop-Companion_0.1.0.msi` ready to send (or a shared-drive link).
- [ ] Confirm their accounts are pre-created under the org (or, if not yet done, have an
      invite link ready from Settings → redeem so they can join on the spot).
- [ ] Have `TEAM-ONBOARDING.md` open to share/paste if they want to read ahead.
- [ ] Know the one likely gotcha (see Troubleshooting): after installing, Chrome may show
      a "Developer mode extensions are disabled" banner on `chrome://extensions` — that's
      expected for unpacked installs and just needs one click.

## What to expect, step by step
1. **Send the `.msi`.** They double-click it, install (a few seconds), and it launches
   into the system tray automatically. It also now **starts itself on every boot**.
2. **First-run guide appears** in the companion window: a "Copy extension-folder path"
   button, an "Open chrome://extensions" button, and numbered steps (Developer Mode →
   Load unpacked → paste path → Enter). Watch them do this once — it's the only manual
   step ever required.
3. **Extension loads.** The companion's guide flips to "✅ installed" automatically when
   it detects the connection (usually within a couple seconds).
4. **Sign in.** New tab → Tabatha home appears → Sign in with Google (or request a
   magic-link). If their account was pre-created under the org, this should just work; if
   not yet, they may need to paste an invite code in Settings.
5. **Clock in.** Point out the clock control and the sidebar "Synced … ago" chip — confirm
   it goes green within a few minutes.
6. **Done.** Let them poke around for a minute; ask what felt confusing.

## Troubleshooting (things we've actually hit)
- **"Developer mode extensions are disabled" banner** — Chrome sometimes shows this on
  first load of an unpacked extension (or after any Chrome restart later). One click on
  the banner ("Turn back on" / "Keep") fixes it. This is a real Chrome safety behavior,
  not a bug in Tabatha — mention it up front so it doesn't alarm them mid-call.
- **Companion not in the tray after a restart, later on** — should no longer happen; it's
  now set to auto-start on boot. If it ever does, they can just relaunch the installed
  app from the Start Menu.
- **Extension shows disconnected from the companion** — usually means the companion isn't
  running; check the tray icon.
- **Sync chip stuck on "never"** — needs them to be signed in AND to have redeemed an
  invite (joins them to the org so data attributes correctly). Signed-in-but-not-joined
  will still sync, just without org attribution.

## After the call
- [ ] Confirm both show up with fresh clock/intent data (owner Supabase view or dashboard).
- [ ] Ask them to try the in-app 💬 Feedback button once, so we confirm that pipe live.
- [ ] Note anything confusing in the Asana hub task so it feeds the next fix cycle.
