// Epic 9 (Context View customization) — read-side precedence + compat shim
// for `settings.contextView`. Design doc §4:
// docs/superpowers/specs/2026-07-18-epic9-cv-customization-design.md
//
// Three of these fields (`dayResetHour`, `focusAwayImmediate`,
// `showCheckpoints`) were bootstrapped under the legacy `settings.sidecar`
// key before `contextView` existed. Per CeeCee's gate-clearing ruling (§6.2
// of the design doc), this is a READ-SIDE shim only — no write-side
// backfill in v1. Precedence: `contextView` key > legacy `sidecar` keys >
// hardcoded defaults, so:
//   (a) a profile with only legacy `sidecar.*` values (every existing user,
//       day one) keeps working unchanged,
//   (b) a profile with the new `contextView` key (written by the extension's
//       Epic 9 settings panel, or a future Sidecar writer) is authoritative,
//   (c) a profile with neither gets defaults matching today's always-on
//       behavior (Sidecar-only users are a first-class persona — nothing
//       here requires the extension to have ever run).
// Mirrors the `mergeSettings`/`DEFAULT_CHAPERONE_SETTINGS` layering already
// established in `sidecar/src/lib/chaperone.ts`.

export interface ContextViewSettings {
  showDayCountdown: boolean;
  showUpNext: boolean;
  showTimeline: boolean;
  showCheckpoints: boolean;
  dayResetHour: number;
  focusAwayImmediate: boolean;
  /** Reserved — no 'v1' renderer exists yet (§2 of the design doc). */
  layout: 'v1' | 'v2';
  // Fix Wave 3 (2026-07-20 spec), item 1 — CV timer count direction +
  // precision. Read from `settings.sidecar.cv.*` (a new nested namespace
  // under the existing legacy `sidecar` key, distinct from `showCheckpoints`
  // etc which live flat under `sidecar`) — see `resolveContextViewSettings`
  // below.
  /** 'down' (default) counts down to the timer target as today; 'up' always
   * shows elapsed digits climbing, even with a `timer_minutes` target set —
   * display only, doesn't change when "over" styling kicks in. */
  countDirection: 'up' | 'down';
  /** 'second' (default) = full h:mm:ss/m:ss digits; 'rounded_minute' = the
   * old coarse "6h 12m"/"6m"/"42s" display, kept as a calmer opt-in. */
  precision: 'second' | 'rounded_minute';
  // Fix Wave 3, item 5a — phone-away heartbeat grace window in minutes
  // (replaces the old hardcoded 30-minute `awaySince` staleness constant).
  awayGraceMin: number;
}

export const DEFAULT_CONTEXT_VIEW_SETTINGS: ContextViewSettings = {
  showDayCountdown: true,
  showUpNext: true,
  showTimeline: true,
  showCheckpoints: true,
  dayResetHour: 0,
  focusAwayImmediate: false,
  layout: 'v2',
  countDirection: 'down',
  precision: 'second',
  awayGraceMin: 3,
};

// Device management (migration 045) — `device_settings` on the CURRENT
// device's own browser_profiles row is an optional 4th layer, highest
// precedence: device > contextView > legacy sidecar > defaults. v1 ships
// only the plumbing (this merge + ContextView passing its own row's
// device_settings through) — there is no per-device editor UI yet
// (DevicesCard.tsx notes this explicitly). Any device without an override
// resolves identically to pre-045 behavior (an empty device_settings object
// contributes nothing to the spread).
export function resolveContextViewSettings(
  settings: Record<string, any> | null | undefined,
  deviceSettings?: Record<string, any> | null
): ContextViewSettings {
  const cv = settings?.contextView || {};
  const legacySidecar = settings?.sidecar || {};
  // Fix Wave 3 (2026-07-20 spec) — `sidecar.cv.*`, a small nested namespace
  // for the new timer-display + heartbeat settings. Distinct from both the
  // flat legacy `sidecar.*` keys above (dayResetHour etc, bootstrapped
  // before `contextView` existed) and the top-level `contextView` key —
  // this is a third, narrower source the spec calls out by exact path.
  const sidecarCv = legacySidecar.cv || {};
  const device = deviceSettings || {};
  return {
    ...DEFAULT_CONTEXT_VIEW_SETTINGS,
    // Legacy sidecar.* values apply BEFORE contextView so contextView always
    // wins when both are set (new writes migrate to contextView going
    // forward; nothing here mutates the legacy keys).
    dayResetHour: legacySidecar.dayResetHour ?? DEFAULT_CONTEXT_VIEW_SETTINGS.dayResetHour,
    focusAwayImmediate:
      legacySidecar.focusAwayImmediate ?? DEFAULT_CONTEXT_VIEW_SETTINGS.focusAwayImmediate,
    showCheckpoints: legacySidecar.showCheckpoints ?? DEFAULT_CONTEXT_VIEW_SETTINGS.showCheckpoints,
    countDirection: sidecarCv.countDirection === 'up' ? 'up' : DEFAULT_CONTEXT_VIEW_SETTINGS.countDirection,
    precision:
      sidecarCv.precision === 'rounded_minute' ? 'rounded_minute' : DEFAULT_CONTEXT_VIEW_SETTINGS.precision,
    awayGraceMin:
      Number.isFinite(sidecarCv.awayGraceMin) && sidecarCv.awayGraceMin > 0
        ? sidecarCv.awayGraceMin
        : DEFAULT_CONTEXT_VIEW_SETTINGS.awayGraceMin,
    ...cv,
    // device_settings wins over everything above it, including contextView.
    ...device,
  };
}
