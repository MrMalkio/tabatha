// Tabatha design tokens, ported for React Native.
// Dark-first, cyan accent — matches the extension sidebar's default look.

export const colors = {
  bgBase: '#0A0E14',
  surface: '#141A22',
  surfaceHover: '#1C242E',
  border: '#222B36',
  textPrimary: '#E8EAED',
  textMuted: '#8A93A0',
  accent: '#00E0D6', // primary cyan/teal
  accentDim: 'rgba(0, 224, 214, 0.14)',
  green: '#66BB6A',
  amber: '#FFA726',
  red: '#EF5350',
  blue: '#29B6F6',
  orange: '#FF9800',
  purple: '#A142F4',
  yellow: '#FFD54F',
} as const;

export const radius = { sm: 6, md: 10, lg: 16, full: 999 } as const;

export const space = (n: number) => n * 4;

// Funnel stages mirror the extension's useFocusEngine FUNNEL_STAGES.
export const FUNNEL_STAGES: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  unsorted: { label: 'Unsorted', icon: '•', color: '#8A93A0' },
  todo: { label: 'To Do', icon: '○', color: '#29B6F6' },
  focus: { label: 'Focus', icon: '◉', color: '#00E0D6' },
  addressing: { label: 'Addressing', icon: '▶', color: '#FFA726' },
  resolved: { label: 'Resolved', icon: '✓', color: '#66BB6A' },
  roadblocked: { label: 'Roadblocked', icon: '⚠', color: '#EF5350' },
};

export function priorityColor(p: number): string {
  if (p <= 2) return colors.red;
  if (p <= 4) return colors.amber;
  return colors.green;
}

// ── time formatting (mirrors extension utils) ──────────────
// Fix Wave 3, item 1 (2026-07-20 spec): the old `formatElapsedMs` dropped
// precision as time grew ("6h 12m" past an hour, losing seconds; "6m" past
// a minute, losing seconds entirely) — never combined h/m/s the way the
// countdown ring's `formatTimer` already does. Renamed to make the digit
// contract explicit: full `h:mm:ss` / `m:ss`, never a bare unit-suffix
// string. `precision: 'rounded_minute'` keeps the OLD coarse behavior as an
// opt-in (Context View setting `sidecar.cv.precision`) for anyone who
// preferred the calmer display; every other caller (FocusScreen,
// FocusTimeline) always uses the default `'second'` digit style.
export function formatElapsedDigits(
  ms: number,
  precision: 'second' | 'rounded_minute' = 'second'
): string {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (precision === 'rounded_minute') {
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatTimer(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatClock(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
