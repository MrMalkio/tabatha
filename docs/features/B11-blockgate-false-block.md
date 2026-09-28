# Bug B11 — BlockGate blocks sites that are not on the block list; a reload clears it

> **Status:** 🔍 Root cause identified from source (high confidence), **not yet reproduced live**.
> Reported by Malkio 2026-09-27 on 6.7.83+. Fix direction below is small and self-contained.

## Symptoms

- A normal site is covered by the BlockGate overlay ("This site has been blocked by Tabatha",
  write-a-reason form), although the block list is empty.
- It happens "randomly", on different sites.
- Reloading the page clears it.

## Root cause (from source, `src/content/blockgate.js:5-16`)

BlockGate runs at `document_start` on every page and asks the background service worker whether
the domain is blocked:

```js
try {
  response = await chrome.runtime.sendMessage({ type: 'CHECK_BLOCKED_SITE' });
} catch (e) {
  // Extension context invalidated (or messaging failed) — fail CLOSED.
  response = { blocked: true };
}
```

The decision itself is correct: `checkBlockedSite` (`src/background/services/blockgateService.js`)
returns `{ blocked: false }` for any domain not on `blockedSites`, and for an empty list. **The only
way a non-listed site gets blocked is the `catch` branch.** Since `2495db3` (6.7.57, 2026-07-22) any
failure of that one message is treated as "blocked".

That message fails transiently for reasons that have nothing to do with the block list:

- the MV3 service worker is starting or restarting when the page loads ("Could not establish
  connection. Receiving end does not exist.");
- the worker is torn down mid-reply ("The message port closed before a response was received");
- the extension was just updated or reloaded (context invalidated) — the fleet install
  auto-updates, so this happens on real users' machines.

A reload succeeds because by then the worker is awake — exactly the reported behaviour. Malkio's
install jumped from 6.7.56 straight to 6.7.83 on ~2026-09-24, so this is new behaviour for him.

The sister overlay, InPop (`gatekeeper.js`), handles the same failure the other way: it wraps its
messages in a 2.5 s timeout and **fails open** (tears down and leaves the page usable), per the
6.7.68 Koda review.

## Fix direction

1. **Read the list locally, not over messaging** ← recommended. Content scripts can read
   `chrome.storage.local` directly. Read `blockedSites` and `tempUnblocked` in `blockgate.js`
   and apply the same matching rules as `checkBlockedSite`. No service-worker round-trip, so no
   transient failure mode at all. Keep the matching logic in one shared pure helper with a test —
   bearing in mind that a module imported by two content-script entries becomes a separate chunk
   Chrome can't load in a classic script (see the note at the top of `gatekeeper.js`), so either
   import it from `blockgate.js` only or duplicate it with a parity test.
2. **Fail closed only when the local list says the domain is blocked.** If storage can't be read
   either, fail open — an empty or unreadable list must never block a page.
3. Log the caught error (`console.warn`) so the next occurrence is diagnosable from the page's
   DevTools console.

## How to confirm when it happens again (before the fix)

On the wrongly blocked page, open DevTools → Console before reloading. Today nothing is logged
(the error is swallowed), which is itself worth fixing in step 3. Check `chrome://extensions` for a
recent update or service-worker restart around that time.

## Verification

Unit-test the matcher (exact, `*.` wildcard, subdomain, temp-unblock expiry, empty list, unreadable
storage). In a real browser: empty block list plus a stopped/restarting service worker (CDP
`ServiceWorker.stopWorker`, or navigate during an extension reload) must NOT show the overlay; a
listed domain must still be blocked with the worker stopped.

## Related

- `2495db3` (6.7.57) — introduced fail-closed.
- B10 — the other InBar/overlay report from the same session.
