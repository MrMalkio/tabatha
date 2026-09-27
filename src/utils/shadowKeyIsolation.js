// Keep a closed-shadow-DOM overlay's keystrokes away from the host page.
//
// Keystrokes typed into an input inside a CLOSED shadow root are retargeted
// to the shadow host when seen from the page, so the page cannot tell the
// user is typing into a text field. Sites with single-key shortcuts (Gmail,
// Asana, GitHub, YouTube…) listen at the document in the capture phase,
// ignore keys aimed at inputs, and preventDefault() everything else — which
// cancels every character typed into our overlay. A listener on the host is
// too late: document capture runs first. So we listen on the WINDOW in the
// capture phase, registered at document_start before any page script, and
// stop keys aimed at our host there. We never preventDefault, so the browser
// still inserts the character. Because the event then never reaches the
// overlay's own listeners, callers route their keydown handling (e.g.
// Enter-to-submit) through `onKeydown`.
//
// Import from ONE content script only: a module shared by two content-script
// entries becomes a separate chunk with an `import` Chrome can't resolve in a
// classic script (see the note at the top of src/content/gatekeeper.js).

// Exported for tests only. The function below deliberately uses its own
// literal: gatekeeper.js can be re-injected into a page that already ran it,
// and a top-level `const` in the bundled script would then be a fatal
// "already declared" SyntaxError. Rollup tree-shakes this unused const out of
// the content-script bundle; a function declaration is safe to re-declare.
export const ISOLATED_KEY_EVENTS = ['keydown', 'keypress', 'keyup'];

export function isolateShadowHostKeys(win, host, { onKeydown } = {}) {
  const types = ['keydown', 'keypress', 'keyup'];
  const handler = (e) => {
    if (e.target !== host) return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && typeof onKeydown === 'function') {
      try { onKeydown(e); } catch { /* the key must still not leak to the page */ }
    }
  };
  for (const type of types) win.addEventListener(type, handler, true);
  return () => {
    for (const type of types) win.removeEventListener(type, handler, true);
  };
}
