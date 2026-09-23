// ============================================================
// vite.harness.config.js
//
// Dev-only config for the "preview harness" — serves Tabatha's extension
// pages (home/sidebar/settings/popup/workshifts/activity) over plain
// http://localhost, with a chrome.* API shim (test/preview-harness/
// chromeShim.js) injected before each page's real entry script.
//
// WHY THIS EXISTS: our browser automation tool refuses to script real
// chrome-extension:// pages belonging to Tabatha (cross-extension
// isolation guard — see docs/audits/2026-07-24-live-extension-e2e.md).
// It CAN drive plain http(s) pages, so this config lets a real Vite dev
// server + real React components render for layout/structure/logic
// review, at the cost of all data being fixture data (see fixtures.js)
// rather than real product state.
//
// Run with: npm run dev:harness  (see package.json)
// Never used by `npm run build` / `npm run dev` — those still use the
// unmodified vite.config.js, so production output is untouched.
// ============================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const HARNESS_SCRIPT_TAG =
  '<script type="module" src="/test/preview-harness/chromeShim.js"></script>';

// Injects the shim script tag as the FIRST thing in <head>, so
// window.chrome exists before any page module (and its module-level
// `const isChromeExtension = typeof chrome !== 'undefined' && ...` checks,
// e.g. src/hooks/useChromeStorage.js:8) evaluates.
function chromeShimPlugin() {
  return {
    name: 'tabatha-preview-harness-chrome-shim',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('<head>', `<head>\n    ${HARNESS_SCRIPT_TAG}`);
      }
    }
  };
}

export default defineConfig({
  plugins: [chromeShimPlugin(), react(), tailwindcss()],
  base: '',
  server: {
    // Multi-page entries (home.html etc.) live at the project root already;
    // no rewrites needed — visit e.g. http://localhost:5173/home.html.
    port: 5173
  }
});
