import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../lib/theme';
import type { FocusItem } from '../data/focus';

const KEY = 'tabby.sidecar.focusMode';

async function nudge(body: string) {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg =
      (await navigator.serviceWorker.getRegistration('/sidecar/')) ||
      (await navigator.serviceWorker.ready);
    reg?.showNotification('👀 Back to it', {
      body,
      tag: 'focus-mode-leave',
      icon: '/sidecar/icons/icon-192.png',
    });
  } catch {
    /* best effort */
  }
}

/**
 * Phone Focus Mode. Uses the Page Visibility API to detect when the user
 * navigates away from / backgrounds the Sidecar. On leave it (a) nudges the
 * phone, (b) broadcasts an "away" signal to this device's
 * browser_profile_status.metadata — the big-screen Context View is subscribed
 * to that table and turns red ("put the phone down") when it sees it — and
 * (c) a reliable server-push alert fires from the `focus_away` pass in
 * `send-focus-push` (client-side `showNotification` at visibilitychange is
 * unreliable on mobile since the page is already backgrounding).
 *
 * B1 (Plan 040 addendum, binding decision #1): leaving while Focus Mode is on
 * must PAUSE the active focus, not clear it — and the pause-write stays
 * client-side, reusing `actions.pause`'s exact `_elapsedMs` freeze (via the
 * `onPause` prop) so there's zero regression risk to the pause/resume timer
 * fix. The server push carries only the alert, never a state mutation.
 *
 * Fix Wave 3, item 5a (2026-07-20 spec) — heartbeat: `metadata.lastHeartbeatAt`
 * is written every 60s while `document.hidden === false`, plus once more on
 * the visible→hidden transition (the last proof-of-life a truly-dying
 * session gets to send — Koda's vet flagged that this final write is a
 * fire-and-forget racing possible OS suspension and may not complete; that's
 * expected, it's exactly why "gone" is inferred by absence on the read side
 * rather than a guaranteed explicit signal). Consumed by ContextView.tsx's
 * `classifyPhoneAwayStatus` to distinguish "away" (nag) from "gone" (neutral,
 * no nag) instead of the old 30-minute-stale-awaySince heuristic.
 *
 * Fix Wave 3, item 5b — device-kind gate: this entire feature only runs on
 * devices categorized `device_settings.kind === 'phone'` (or uncategorized —
 * backward compatibility for devices paired before this shipped, today's
 * only real-world case). A tablet or an "extra browser" surface should never
 * trigger phone-away/gone signals — the component renders `null` entirely
 * rather than showing a dead toggle.
 */
export default function PhoneFocusMode({
  currentFocus,
  onPause,
  deviceKind,
}: {
  /** The screen's current focus (from `useFocus`), so leaving can pause it. */
  currentFocus?: FocusItem | null;
  /** `actions.pause` from `useFocus` — passed in so this component never
   *  reimplements the elapsed-ms freeze math. */
  onPause?: (id: string) => unknown;
  /** This device's own `device_settings.kind` (migration 045). Undefined/
   *  null (a device paired before item 5b shipped) is treated as 'phone'. */
  deviceKind?: string | null;
}) {
  const { profile, browserProfileId } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [lastAway, setLastAway] = useState<number | null>(null);
  const leftAt = useRef<number | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPhone = !deviceKind || deviceKind === 'phone';
  // Refs so the visibilitychange listener (registered once per `enabled`
  // toggle) always reads the latest focus/pause without re-subscribing —
  // re-subscribing would re-run the effect cleanup's `signal(false)` on every
  // focus-data refresh and spuriously clear a real "away" alert mid-episode.
  const focusRef = useRef<FocusItem | null>(currentFocus ?? null);
  const pauseRef = useRef<typeof onPause>(onPause);
  useEffect(() => {
    focusRef.current = currentFocus ?? null;
  }, [currentFocus]);
  useEffect(() => {
    pauseRef.current = onPause;
  }, [onPause]);

  const signal = useCallback(
    async (away: boolean) => {
      if (!profile?.id || !browserProfileId) return;
      try {
        const nowIso = new Date().toISOString();
        await supabase.from('browser_profile_status').upsert(
          {
            browser_profile_id: browserProfileId,
            profile_id: profile.id,
            online: !away,
            last_heartbeat_at: nowIso,
            metadata: {
              source: 'sidecar',
              focusAway: away,
              awaySince: away ? nowIso : null,
              // Fix Wave 3, item 5a — every signal write (periodic heartbeat
              // while visible, or the final write on hiding) doubles as a
              // proof-of-life timestamp the read side ages against.
              lastHeartbeatAt: nowIso,
            },
          },
          { onConflict: 'browser_profile_id' }
        );
      } catch {
        /* best effort */
      }
    },
    [profile?.id, browserProfileId]
  );

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(KEY);
        if (v === '1') setEnabled(true);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const onToggle = useCallback(
    async (v: boolean) => {
      setEnabled(v);
      try {
        await AsyncStorage.setItem(KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!v) signal(false); // turning the mode off clears any lingering alert
    },
    [signal]
  );

  useEffect(() => {
    if (!enabled || !isPhone || Platform.OS !== 'web' || typeof document === 'undefined') return;

    // Fix Wave 3, item 5a — periodic heartbeat while visible. Managed via a
    // ref-backed interval started/stopped from inside `onVis` (rather than a
    // second effect keyed on a `hidden` state value) so the visibilitychange
    // listener itself is registered exactly once per `enabled` toggle — the
    // existing comment above (focusRef/pauseRef) already establishes why
    // re-subscribing that listener on every incidental re-render is unsafe
    // (it would re-run the cleanup's `signal(false)` and clear a real "away"
    // alert mid-episode).
    const startHeartbeat = () => {
      if (heartbeatTimer.current) return;
      heartbeatTimer.current = setInterval(() => {
        signal(false);
      }, 60000);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };

    const onVis = () => {
      if (document.hidden) {
        stopHeartbeat();
        leftAt.current = Date.now();
        // Last proof-of-life write before possible OS suspension — see the
        // heartbeat doc comment above this component for the "may not
        // complete" caveat; that's expected, not a bug.
        signal(true);
        nudge('You stepped away from Tabatha while in Focus Mode. Eyes back on the task 👇');
        // B1: pause (don't clear) the active focus, client-side, via the same
        // action the Pause button uses. Only pauses an `active` focus — an
        // already-paused one already has its _elapsedMs frozen, and calling
        // pause again would just recompute the same freeze from `now`, which
        // is harmless but pointless, so skip it.
        const cf = focusRef.current;
        if (cf && cf.focus_state === 'active' && pauseRef.current) {
          // QA P2 (v0.3.0): the pause action is async — swallow rejections so a
          // network failure at backgrounding time can't surface as an
          // unhandled-promise-rejection in a page that's being hidden.
          Promise.resolve(pauseRef.current(cf.id)).catch(() => {});
        }
      } else {
        if (leftAt.current) setLastAway(Date.now() - leftAt.current);
        leftAt.current = null;
        signal(false);
        startHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) startHeartbeat(); // mounted already-visible with the mode on
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stopHeartbeat();
      signal(false); // don't leave a stuck alert if the mode unmounts
    };
  }, [enabled, isPhone, signal]);

  if (Platform.OS !== 'web') return null;
  // Fix Wave 3, item 5b — a tablet/desktop/watch/extra-browser surface never
  // shows this card at all, not just a functionally-disabled one; a dead
  // "Phone Focus Mode" toggle on a device it can never apply to is worse UX
  // than the card simply not existing there.
  if (!isPhone) return null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📵 Phone Focus Mode</Text>
          <Text style={styles.sub}>
            {enabled
              ? 'On — put your phone down. Wander off and your big screen goes red.'
              : 'Leave the Sidecar open; if you navigate away I’ll nudge you and flag it on your Context View.'}
          </Text>
          {enabled && lastAway != null && (
            <Text style={styles.away}>Last stepped away for {Math.round(lastAway / 1000)}s.</Text>
          )}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor="#fff"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  away: { fontSize: 11, color: colors.accent, marginTop: 4 },
});
