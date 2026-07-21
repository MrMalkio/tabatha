import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Card, SectionLabel } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';

// Device management (migration 045, Malkio 2026-07-19 — "after pairing his
// TV: devices need NAMES at pairing, a way to SIGN OUT any device remotely,
// PAUSE certain devices, and per-device settings"). Lists every
// browser_profiles row under this profile (the extension's own installs
// included, not just Sidecar surfaces) and lets the user rename, pause, or
// remotely sign out any of them.
//
// Per-device "CV overrides" (device_settings editor) is OUT of v1 UI — the
// column + resolveContextViewSettings precedence layer both ship (see
// lib/contextViewSettings.ts), but there's no editor here yet. A future
// pass adds one; nothing about this card's shape needs to change for it.

type DeviceRow = {
  id: string;
  browser: string;
  profile_name: string | null;
  display_name: string | null;
  classification: string | null;
  extension_installed: boolean | null;
  last_seen_at: string | null;
  paused: boolean;
  revoked_at: string | null;
  // Migration 017 — `local_id` is the install's stable client-side id,
  // `machine_id` is the desktop-companion browser_profile id this install
  // is paired with (same-machine signal, best-effort/nullable). Used here
  // purely for de-dup grouping (Fix 3, 2026-07-20 refinement); not
  // displayed directly.
  local_id: string | null;
  machine_id: string | null;
  // Migration 045 — per-device JSONB overrides. Fix Wave 3 item 5b
  // (2026-07-20 spec) adds the first real editor UI for one key of it:
  // `kind`. Everything else in this object (future CV per-device overrides)
  // is preserved on write via read-modify-write, not clobbered.
  device_settings: Record<string, any> | null;
};

// Fix Wave 3, item 5b — device type/priority categorization. No column
// change (migration 045 already left `device_settings` JSONB open exactly
// for this); `kind` gates Phone Focus Mode (PhoneFocusMode.tsx) so a
// tablet/second-desktop-window never triggers phone-away/gone signals.
// Devices paired before this shipped have `kind: undefined`, treated as
// 'phone' for backward compatibility (today's only real-world case) until
// re-categorized here.
type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'watch' | 'browser_extra';
const DEVICE_KINDS: { value: DeviceKind; label: string }[] = [
  { value: 'phone', label: '📱 Phone' },
  { value: 'tablet', label: '📱 Tablet' },
  { value: 'desktop', label: '🖥️ Desktop' },
  { value: 'watch', label: '⌚ Watch' },
  { value: 'browser_extra', label: '🌐 Extra browser' },
];

function relTime(iso: string | null): string {
  if (!iso) return 'never seen';
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function surfaceLabel(row: DeviceRow): string {
  if (row.extension_installed) return `Chrome extension · ${row.browser}`;
  if (row.browser === 'tabatha_web' || row.browser === 'mobile_ios' || row.browser === 'mobile_android') {
    return `Sidecar · ${row.browser.replace('mobile_', '').replace('tabatha_', '')}`;
  }
  return row.browser;
}

// Fix 3c (2026-07-20): rows without a user-set `display_name` used to fall
// back straight to `profile_name` (often generic/empty, e.g. "Default") or
// the bare surface label — with ~100 undifferentiated rows that read as
// "Chrome extension · chrome" repeated dozens of times. Derive a more
// distinguishing name from browser/profile_name plus a short id-based
// "machine hint" suffix so same-browser rows are at least tellable apart
// until the user renames them.
function deriveName(row: DeviceRow): string {
  if (row.display_name) return row.display_name;
  const bits = [surfaceLabel(row)];
  const profileName = row.profile_name?.trim();
  if (profileName && profileName.toLowerCase() !== 'default') bits.push(profileName);
  bits.push(`#${row.id.slice(0, 4).toUpperCase()}`);
  return bits.join(' · ');
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Fix 3a: the default view hides stale, never-renamed, unfamiliar rows
// (mostly abandoned installs/reinstalls) instead of rendering all ~100 at
// once. A row stays visible by default if it's been seen recently, has been
// given a name (a signal the user cares about it), or is the device you're
// looking at this from right now. Nothing is deleted or archived here — the
// full set is one tap away via "Show all", and a separate diagnosis task
// owns any actual cleanup.
function isDefaultVisible(row: DeviceRow, thisDeviceId: string | null): boolean {
  if (row.id === thisDeviceId) return true;
  if (row.display_name) return true;
  if (row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() <= THIRTY_DAYS_MS) return true;
  return false;
}

// Fix 3a refinement (2026-07-20, per Rook's forensics): the ~731-row flood
// on Malkio's account isn't really ~731 distinct devices — ~650 of them are
// dupes of ONE Chrome install, caused by an extension-side local_id
// regeneration bug (being fixed in parallel; server-side cleanup of the
// existing dupe rows follows separately — this component does not
// delete/archive anything). Until that cleanup lands, the default view
// should show ONE row per physical device: group by `machine_id` when
// present (an extension reaching the desktop companion is by definition the
// same machine), falling back to `browser` + a `local_id` prefix when
// `machine_id` is null, and finally to the row's own id when NEITHER
// correlating field is set (e.g. most Sidecar/web/mobile rows) — those rows
// can't be correlated to anything else, so each is its own group of one.
function groupKey(row: DeviceRow): string {
  if (row.machine_id) return `m:${row.machine_id}`;
  if (row.local_id) return `l:${row.browser}:${row.local_id.slice(0, 16)}`;
  return `id:${row.id}`;
}

// One representative row per group — the most-recently-seen one. `rows` is
// already fetched ordered by `last_seen_at desc, nullsFirst: false`, so the
// first row encountered per key IS the most recent; a plain first-wins Map
// is enough, no separate max-by pass needed.
function groupRows(rows: DeviceRow[]): DeviceRow[] {
  const seen = new Map<string, DeviceRow>();
  for (const r of rows) {
    const key = groupKey(r);
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

export default function DevicesCard() {
  const { profile, browserProfileId, session } = useAuth();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedOutIds, setSignedOutIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const reload = useCallback(async () => {
    if (!profile?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('browser_profiles')
      .select(
        'id, browser, profile_name, display_name, classification, extension_installed, last_seen_at, paused, revoked_at, local_id, machine_id, device_settings'
      )
      .eq('profile_id', profile.id)
      .order('last_seen_at', { ascending: false, nullsFirst: false });
    if (!error && data) setRows(data as DeviceRow[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime — the same publication add (migration 045) that drives the
  // honor-logic listener also keeps this list current across devices, so
  // renaming/pausing from one phone shows up on another without a refresh.
  useEffect(() => {
    if (!profile?.id) return undefined;
    const ch = supabase
      .channel(`devices_card_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tabatha', table: 'browser_profiles', filter: `profile_id=eq.${profile.id}` },
        () => reload()
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* best effort */
      }
    };
  }, [profile?.id, reload]);

  const startRename = (row: DeviceRow) => {
    setEditingId(row.id);
    setDraftName(row.display_name || row.profile_name || surfaceLabel(row));
    setErr(null);
  };

  // Default view: one row per physical device (grouped, most-recent
  // representative — see groupRows above), then narrowed by the recency/
  // named/this-device filter. `showAll` bypasses BOTH steps and shows the
  // raw ungrouped `rows` list — including the extension's regenerated-id
  // dupes — until the parallel extension fix + server cleanup lands.
  // `hiddenCount` is derived from the default (grouped+filtered) view
  // regardless of `showAll`, so the toggle button doesn't disappear once
  // expanded — it needs to stay put to let the user collapse back down.
  const groupedRows = groupRows(rows);
  const defaultVisibleRows = groupedRows.filter((r) => isDefaultVisible(r, browserProfileId));
  const hiddenCount = rows.length - defaultVisibleRows.length;
  const visibleRows = showAll ? rows : defaultVisibleRows;

  const saveRename = async (id: string) => {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) return;
    setBusyId(id);
    const { error } = await supabase.from('browser_profiles').update({ display_name: name }).eq('id', id);
    setBusyId(null);
    if (error) {
      setErr('Could not rename that device.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, display_name: name } : r)));
  };

  const togglePause = async (row: DeviceRow, next: boolean) => {
    setBusyId(row.id);
    setErr(null);
    const { error } = await supabase.from('browser_profiles').update({ paused: next }).eq('id', row.id);
    setBusyId(null);
    if (error) {
      setErr('Could not update that device.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, paused: next } : r)));
  };

  // Fix Wave 3, item 5b — read-modify-write so future device_settings keys
  // (per-device CV overrides, still v1-no-editor per the comment at the top
  // of this file) aren't clobbered by a `kind`-only write.
  const setDeviceKind = async (row: DeviceRow, kind: DeviceKind) => {
    setBusyId(row.id);
    setErr(null);
    const nextSettings = { ...(row.device_settings || {}), kind };
    const { error } = await supabase.from('browser_profiles').update({ device_settings: nextSettings }).eq('id', row.id);
    setBusyId(null);
    if (error) {
      setErr('Could not update that device.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, device_settings: nextSettings } : r)));
  };

  const signOutDevice = async (row: DeviceRow) => {
    if (row.id === browserProfileId) return; // guarded off in the UI too
    setBusyId(row.id);
    setErr(null);
    try {
      const token = session?.access_token;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/device-signout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ browser_profile_id: row.id }),
      });
      const out = await res.json().catch(() => ({}) as any);
      if (!res.ok || !out?.ok) throw new Error(out?.error || 'sign-out failed');
      setSignedOutIds((prev) => new Set(prev).add(row.id));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, revoked_at: new Date().toISOString() } : r)));
    } catch {
      setErr('Could not sign that device out — try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Devices</SectionLabel>
        <Text style={styles.sub}>Loading…</Text>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionLabel>Devices</SectionLabel>
      <Text style={styles.sub}>
        Every device signed into this account. Rename, pause, or sign one out remotely.
      </Text>
      {rows.length === 0 && <Text style={styles.sub}>No devices registered yet.</Text>}
      {visibleRows.map((row) => {
        const isThisDevice = row.id === browserProfileId;
        const isEditing = editingId === row.id;
        const isBusy = busyId === row.id;
        const isSignedOut = signedOutIds.has(row.id) || !!row.revoked_at;
        const label = deriveName(row);
        return (
          <View key={row.id} style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                {isEditing ? (
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    onSubmitEditing={() => saveRename(row.id)}
                    onBlur={() => saveRename(row.id)}
                    autoFocus
                    style={styles.renameInput}
                  />
                ) : (
                  <View style={styles.nameRow}>
                    <Pressable onPress={() => startRename(row)} disabled={isBusy} style={{ flexShrink: 1 }}>
                      <Text style={styles.deviceName} numberOfLines={1}>
                        {label}
                        {isThisDevice ? '  ·  ' : ''}
                        {isThisDevice && <Text style={styles.thisDevice}>This device</Text>}
                      </Text>
                    </Pressable>
                    {/* Fix 3b (2026-07-20): the whole name was tap-to-rename
                        with no visible affordance — a pencil icon makes the
                        action discoverable instead of relying on the user
                        to guess the name text is a button. */}
                    <Pressable
                      onPress={() => startRename(row)}
                      disabled={isBusy}
                      hitSlop={8}
                      style={styles.renameBtn}
                    >
                      <Text style={styles.renameIcon}>✏️</Text>
                    </Pressable>
                  </View>
                )}
                <Text style={styles.deviceMeta}>
                  {surfaceLabel(row)} · last seen {relTime(row.last_seen_at)}
                  {row.paused ? ' · paused' : ''}
                </Text>
              </View>
              <Switch
                value={row.paused}
                onValueChange={(v) => togglePause(row, v)}
                disabled={isBusy}
                trackColor={{ true: colors.amber, false: colors.border }}
                thumbColor="#fff"
              />
            </View>
            {/* Fix Wave 3, item 5b — device type picker (migration 045's
                device_settings.kind). Gates Phone Focus Mode; an
                uncategorized row (no display) still behaves as 'phone'. */}
            <View style={styles.kindRow}>
              <Text style={styles.kindLabel}>Type</Text>
              {DEVICE_KINDS.map((k) => {
                const current = (row.device_settings?.kind as DeviceKind | undefined) || 'phone';
                const on = current === k.value;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => setDeviceKind(row, k.value)}
                    disabled={isBusy}
                    style={[styles.kindPill, on && styles.kindPillOn]}
                  >
                    <Text style={[styles.kindPillTxt, on && styles.kindPillTxtOn]}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.rowBottom}>
              <Pressable
                onPress={() => (isThisDevice || isSignedOut || isBusy ? null : signOutDevice(row))}
                disabled={isThisDevice || isSignedOut || isBusy}
                style={[
                  styles.signOutBtn,
                  (isThisDevice || isSignedOut) && styles.signOutBtnDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.signOutTxt,
                    (isThisDevice || isSignedOut) && styles.signOutTxtDisabled,
                  ]}
                >
                  {isSignedOut ? 'Signed out ✓' : isThisDevice ? 'This device' : isBusy ? 'Signing out…' : 'Sign out'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {/* Fix 3a (2026-07-20): the other ~N stale/unnamed rows stay one tap
          away instead of always rendering ~100 rows. Nothing is hidden
          permanently — toggling back to the filtered view is just as easy. */}
      {hiddenCount > 0 && (
        <Pressable onPress={() => setShowAll((v) => !v)} style={styles.showAllBtn}>
          <Text style={styles.showAllTxt}>{showAll ? 'Show fewer' : `Show all (${rows.length})`}</Text>
        </Pressable>
      )}
      {err && <Text style={styles.err}>{err}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 6 },
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
    gap: 8,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thisDevice: { fontSize: 11, fontWeight: '700', color: colors.accent },
  deviceMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  renameBtn: { paddingHorizontal: 2, paddingVertical: 2 },
  renameIcon: { fontSize: 13, opacity: 0.75 },
  showAllBtn: { alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 14 },
  showAllTxt: { fontSize: 12, fontWeight: '700', color: colors.accent },
  renameInput: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  kindRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  kindLabel: { fontSize: 10, color: colors.textMuted, marginRight: 2 },
  kindPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindPillOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  kindPillTxt: { fontSize: 11, color: colors.textMuted },
  kindPillTxtOn: { color: colors.accent, fontWeight: '700' },
  rowBottom: { flexDirection: 'row', justifyContent: 'flex-end' },
  signOutBtn: {
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  signOutBtnDisabled: { borderColor: colors.border },
  signOutTxt: { fontSize: 11, fontWeight: '700', color: colors.red },
  signOutTxtDisabled: { color: colors.textMuted },
  err: { fontSize: 12, color: colors.red, marginTop: 8 },
});
