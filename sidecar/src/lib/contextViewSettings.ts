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
}

export const DEFAULT_CONTEXT_VIEW_SETTINGS: ContextViewSettings = {
  showDayCountdown: true,
  showUpNext: true,
  showTimeline: true,
  showCheckpoints: true,
  dayResetHour: 0,
  focusAwayImmediate: false,
  layout: 'v2',
};

export function resolveContextViewSettings(
  settings: Record<string, any> | null | undefined
): ContextViewSettings {
  const cv = settings?.contextView || {};
  const legacySidecar = settings?.sidecar || {};
  return {
    ...DEFAULT_CONTEXT_VIEW_SETTINGS,
    // Legacy sidecar.* values apply BEFORE contextView so contextView always
    // wins when both are set (new writes migrate to contextView going
    // forward; nothing here mutates the legacy keys).
    dayResetHour: legacySidecar.dayResetHour ?? DEFAULT_CONTEXT_VIEW_SETTINGS.dayResetHour,
    focusAwayImmediate:
      legacySidecar.focusAwayImmediate ?? DEFAULT_CONTEXT_VIEW_SETTINGS.focusAwayImmediate,
    showCheckpoints: legacySidecar.showCheckpoints ?? DEFAULT_CONTEXT_VIEW_SETTINGS.showCheckpoints,
    ...cv,
  };
}
