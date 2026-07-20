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
};

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

export default function DevicesCard() {
  const { profile, browserProfileId, session } = useAuth();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedOutIds, setSignedOutIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!profile?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('browser_profiles')
      .select(
        'id, browser, profile_name, display_name, classification, extension_installed, last_seen_at, paused, revoked_at'
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
      {rows.map((row) => {
        const isThisDevice = row.id === browserProfileId;
        const isEditing = editingId === row.id;
        const isBusy = busyId === row.id;
        const isSignedOut = signedOutIds.has(row.id) || !!row.revoked_at;
        const label = row.display_name || row.profile_name || surfaceLabel(row);
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
                  <Pressable onPress={() => startRename(row)} disabled={isBusy}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {label}
                      {isThisDevice ? '  ·  ' : ''}
                      {isThisDevice && <Text style={styles.thisDevice}>This device</Text>}
                    </Text>
                  </Pressable>
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
  deviceName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  thisDevice: { fontSize: 11, fontWeight: '700', color: colors.accent },
  deviceMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
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
