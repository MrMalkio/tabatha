import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FocusItem } from '../data/focus';
import { startedAtOf } from '../data/focus';
import type { Checkpoint } from '../data/checkpoints';
import { PROGRESS_LEVELS } from '../data/checkpoints';
import { type FocusEvent, computeIntervals, cumulativeTrackedAt } from '../data/events';
import { colors, formatElapsedDigits } from '../lib/theme';

function fmtDateTime(t: number): string {
  const d = new Date(t);
  const h = d.getHours() % 12 || 12;
  const ap = d.getHours() < 12 ? 'AM' : 'PM';
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d.getDate()} · ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

/** Best-effort reduced-motion read; defaults to full motion if unsupported. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => {
        if (alive) setReduced(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduced(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

type Node = {
  id: string;
  kind: 'checkpoint' | 'start' | 'extend' | 'backburner' | 'unbackburner';
  t: number;
  icon: string;
  color: string;
  label: string;
  cumulative?: number;
};

type Separator = { id: string; pos: number; kind: 'day' | 'week' | 'month' };

// Fix Wave 3, item 4 (2026-07-20 spec) — day/week/month boundary markers.
// `posOf` was purely duration-fractional (no calendar-boundary concept), so
// a focus backburnered and resumed across multiple days compressed real
// elapsed CALENDAR time into one undifferentiated bar — no visual signal
// that a gap was "3 hours later" vs "3 days later." These pure helpers
// mirror the day-boundary rule already used by `profileLocalClock`
// (supabase/functions/_shared/webpush.ts) — roll back to the previous
// calendar day if the local hour is before `dayResetHour` — but operate on
// device-local time directly (`new Date()`, no Intl/timezone lookup): this
// component renders on the viewer's own device, unlike the edge function's
// cron context which has no device to read local time from. Exported/pure
// for direct unit testing — mirrored verbatim in
// sidecar/tests/timeline-separators.test.mjs (the component itself can't be
// `import`ed under plain `node --test`).
export function dayKeyOf(t: number, dayResetHour: number): string {
  const d = new Date(t);
  const eff = d.getHours() < dayResetHour ? new Date(d.getTime() - 24 * 3600000) : d;
  return `${eff.getFullYear()}-${String(eff.getMonth() + 1).padStart(2, '0')}-${String(eff.getDate()).padStart(2, '0')}`;
}

/** ISO-8601 week key ("YYYY-Www") for a "YYYY-MM-DD" day key. */
export function isoWeekKeyOf(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + firstDayNum) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7); // "YYYY-MM"
}

/**
 * Classifies the boundary crossed between two timestamps as the LARGEST
 * granularity crossed — a multi-week gap gets one 'month'-or-'week' marker,
 * not a separate 'day' marker for every day it spans, per the spec's
 * "weight/length keyed to boundary size" (one marker per gap).
 */
export function classifyBoundary(
  prevT: number,
  currT: number,
  dayResetHour: number
): 'day' | 'week' | 'month' | null {
  const prevDay = dayKeyOf(prevT, dayResetHour);
  const currDay = dayKeyOf(currT, dayResetHour);
  if (prevDay === currDay) return null;
  const prevMonth = monthKeyOf(prevDay);
  const currMonth = monthKeyOf(currDay);
  if (prevMonth !== currMonth) return 'month';
  const prevWeek = isoWeekKeyOf(prevDay);
  const currWeek = isoWeekKeyOf(currDay);
  if (prevWeek !== currWeek) return 'week';
  return 'day';
}

/**
 * Context View bottom timeline (Plan 040 Epic 2). A thin full-width line that
 * fills as the focus timer runs (line end = intended end time), with nodes
 * for checkpoints (`focus_checkpoints`) and each start/resume
 * (`focus_events`, migration 034). Past 100% the fill can't leave the
 * screen — the rest compacts slightly and a slow-pulsing, slow-growing
 * circle with a soft trail renders at the right end instead. View-only: no
 * data mutates from here, press/hover on a node only reveals a local
 * tooltip.
 */
export default function FocusTimeline({
  focus,
  now,
  checkpoints,
  events,
  frac,
  durationMs,
  over,
  overtimeMs,
  dayResetHour = 0,
}: {
  focus: FocusItem;
  now: number;
  checkpoints: Checkpoint[];
  events: FocusEvent[];
  /** Elapsed/duration, already clamped 0..1 by the caller. */
  frac: number;
  durationMs: number;
  over: boolean;
  overtimeMs: number;
  /** Context View's day-countdown reset hour (`cv.dayResetHour`) — reused
   * here for calendar-day-boundary math (Fix Wave 3, item 4) so "today" on
   * the timeline agrees with "today" everywhere else in the Sidecar. */
  dayResetHour?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const isActive = focus.focus_state === 'active';
  const intervals = useMemo(() => computeIntervals(events, isActive, now), [events, isActive, now]);
  const hasTracked = intervals.length > 0;
  const startedAt = startedAtOf(focus);

  // Node x-position is expressed as "how far into the intended duration",
  // using cumulative 📱 Sidecar-tracked time where we have it (so long
  // pause gaps don't stretch the line) and falling back to raw wall-clock
  // placement when this focus predates focus_events / the events write
  // failed — a graceful degrade, not a hard dependency.
  const posOf = (t: number): number => {
    if (durationMs <= 0) return 0;
    const raw = hasTracked ? cumulativeTrackedAt(intervals, t) / durationMs : (t - startedAt) / durationMs;
    return Math.max(0, Math.min(1, raw));
  };

  const nodes: Node[] = useMemo(() => {
    const cps: Node[] = checkpoints.map((cp) => {
      const level = PROGRESS_LEVELS.find((l) => l.key === cp.progress_level);
      return {
        id: `cp_${cp.id}`,
        kind: 'checkpoint',
        t: new Date(cp.created_at).getTime(),
        icon: level?.icon || '📋',
        color: level?.color || colors.textMuted,
        label: cp.text?.trim() ? cp.text.trim() : level?.label || 'Checkpoint',
      };
    });
    const starts: Node[] = events
      .filter((e) => e.kind === 'start' || e.kind === 'resume')
      .map((e) => {
        const t = new Date(e.at).getTime();
        return {
          id: e.id,
          kind: 'start',
          t,
          icon: '▶',
          color: colors.accent,
          label: e.kind === 'start' ? 'Started' : 'Resumed',
          cumulative: cumulativeTrackedAt(intervals, t),
        };
      });
    // Extensions render like checkpoints (Malkio: "tracked and added to the
    // timeline almost like a checkpoint") — a node where the user bought more
    // time, tooltip shows how much and the new total.
    const extensions: Node[] = events
      .filter((e) => e.kind === 'extend')
      .map((e) => {
        const t = new Date(e.at).getTime();
        const added = Number(e.meta?.addedMinutes) || 0;
        const to = Number(e.meta?.toMinutes) || 0;
        return {
          id: e.id,
          kind: 'extend',
          t,
          icon: '⏳',
          color: colors.amber,
          label: added ? `Extended +${added}m${to ? ` (→ ${to}m)` : ''}` : 'Extended',
          cumulative: cumulativeTrackedAt(intervals, t),
        };
      });
    // Backburner transitions render like extensions — a node marking when
    // this focus went onto / came back off the backburner (migration 041;
    // Malkio: "backburning should be on the timeline"). Visually distinct
    // from the ⏳ extend node so the two context kinds aren't confused at a
    // glance: 🔥 (orange) for going in, ▲ (orange) for coming back.
    const backburnerNodes: Node[] = events
      .filter((e) => e.kind === 'backburner' || e.kind === 'unbackburner')
      .map((e) => {
        const t = new Date(e.at).getTime();
        const isOut = e.kind === 'backburner';
        return {
          id: e.id,
          kind: e.kind as 'backburner' | 'unbackburner',
          t,
          icon: isOut ? '🔥' : '▲',
          color: colors.orange,
          label: isOut ? 'To backburner' : 'Back from backburner',
          cumulative: cumulativeTrackedAt(intervals, t),
        };
      });
    return [...cps, ...starts, ...extensions, ...backburnerNodes].filter((n) => Number.isFinite(n.t));
  }, [checkpoints, events, intervals]);

  // Fix Wave 3, item 4 — one separator marker per consecutive-node gap that
  // crosses a calendar day/week/month boundary. Positioned at the midpoint
  // between the two nodes' own x-positions (rather than coinciding exactly
  // with either node's icon) so it visually reads as "in the gap."
  const separators: Separator[] = (() => {
    const sorted = [...nodes].sort((a, b) => a.t - b.t);
    const out: Separator[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const kind = classifyBoundary(prev.t, curr.t, dayResetHour);
      if (kind) {
        out.push({ id: `sep_${prev.id}_${curr.id}`, pos: (posOf(prev.t) + posOf(curr.t)) / 2, kind });
      }
    }
    return out;
  })();

  // Past 100%, compact the line into 92% of the width so the overtime circle
  // (below) has room to grow toward the true right edge without ever
  // leaving the screen.
  const lineFrac = over ? 0.92 : 1;
  const fillPct = Math.max(0, Math.min(1, frac)) * lineFrac * 100;

  // Grows very slowly (sqrt-damped) and caps well before it could crowd the
  // line; pulses slowly via a soft halo trail. Static (no loop) under
  // reduced-motion.
  const radius = Math.min(14, 4 + Math.sqrt(overtimeMs / 60000) * 2);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!over || reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [over, reducedMotion, pulse]);
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const active = nodes.find((n) => n.id === activeNode);

  return (
    <View style={styles.wrap}>
      {active && (
        <View style={[styles.tooltip, { left: `${posOf(active.t) * lineFrac * 100}%` }]} pointerEvents="none">
          <Text style={styles.tooltipLabel} numberOfLines={1}>{active.label}</Text>
          <Text style={styles.tooltipTime}>{fmtDateTime(active.t)}</Text>
          {(active.kind === 'start' || active.kind === 'extend' || active.kind === 'backburner' || active.kind === 'unbackburner') && (
            <Text style={styles.tooltipTracked}>📱 {formatElapsedDigits(active.cumulative || 0)} tracked</Text>
          )}
        </View>
      )}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillPct}%` }]} />
        {separators.map((s) => {
          const width = s.kind === 'month' ? 3 : s.kind === 'week' ? 2 : 1;
          const height = s.kind === 'month' ? 22 : s.kind === 'week' ? 16 : 10;
          const color = s.kind === 'month' ? colors.textPrimary : s.kind === 'week' ? colors.textMuted : colors.border;
          const opacity = s.kind === 'month' ? 0.9 : s.kind === 'week' ? 0.7 : 0.55;
          return (
            <View
              key={s.id}
              pointerEvents="none"
              accessibilityLabel={`${s.kind} boundary`}
              style={[
                styles.separator,
                {
                  left: `${s.pos * lineFrac * 100}%`,
                  width,
                  height,
                  top: -(height - 8) / 2,
                  backgroundColor: color,
                  opacity,
                },
              ]}
            />
          );
        })}
        {nodes.map((n) => (
          <Pressable
            key={n.id}
            style={[styles.node, { left: `${posOf(n.t) * lineFrac * 100}%`, borderColor: n.color }]}
            onPressIn={() => setActiveNode(n.id)}
            onPressOut={() => setActiveNode((cur) => (cur === n.id ? null : cur))}
            onHoverIn={() => setActiveNode(n.id)}
            onHoverOut={() => setActiveNode((cur) => (cur === n.id ? null : cur))}
            accessibilityLabel={`${n.label} — ${fmtDateTime(n.t)}`}
          >
            <Text style={styles.nodeIcon}>{n.icon}</Text>
          </Pressable>
        ))}
        {over && (
          <View
            style={[
              styles.overtimeWrap,
              { left: `${lineFrac * 100}%`, top: 4 - radius * 1.2, marginLeft: -radius * 1.2, width: radius * 2.4, height: radius * 2.4 },
            ]}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                styles.overtimeHalo,
                { width: radius * 2.4, height: radius * 2.4, borderRadius: radius * 1.2, opacity: haloOpacity, transform: [{ scale: haloScale }] },
              ]}
            />
            <View style={[styles.overtimeCore, { width: radius * 2, height: radius * 2, borderRadius: radius }]} />
          </View>
        )}
      </View>
      {over && (
        <Text style={styles.overtimeLabel}>📱 {formatElapsedDigits(overtimeMs)} over</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', paddingTop: 4 },
  track: { width: '100%', height: 8, backgroundColor: colors.border, borderRadius: 4, position: 'relative', overflow: 'visible' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent, borderRadius: 4 },
  separator: { position: 'absolute', marginLeft: -1, borderRadius: 1 },
  node: {
    position: 'absolute',
    top: -8,
    marginLeft: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgBase,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeIcon: { fontSize: 12 },
  overtimeWrap: { position: 'absolute', top: 4, marginLeft: 0, alignItems: 'center', justifyContent: 'center' },
  overtimeHalo: { position: 'absolute', backgroundColor: colors.red },
  overtimeCore: { backgroundColor: colors.red },
  overtimeLabel: { color: colors.red, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 6 },
  tooltip: {
    position: 'absolute',
    top: -58,
    marginLeft: -70,
    width: 140,
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    zIndex: 10,
  },
  tooltipLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  tooltipTime: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  tooltipTracked: { color: colors.accent, fontSize: 11, marginTop: 2, fontWeight: '600' },
});
