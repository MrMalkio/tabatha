import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Btn, Card, SectionLabel } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import { deviceLabel, SIDECAR_VERSION } from '../lib/device';
import { enablePush, disablePush, pushPermission, pushSupported } from '../lib/push';
import { useInstallPrompt } from '../lib/install';
import {
  submitFeedback,
  flushFeedbackQueue,
  queuedFeedbackCount,
  type FeedbackKind,
} from '../lib/feedback';
import { connectAsana, syncAsanaNow, useAsanaIntegration } from '../data/integrations';

const REALMS = ['professional', 'work', 'business', 'personal'];

const QUIET_HOUR_PRESETS: Array<{ label: string; start: number | null; end: number | null }> = [
  { label: 'Off', start: null, end: null },
  { label: '10pm–8am', start: 22, end: 8 },
  { label: '9pm–9am', start: 21, end: 9 },
];

// ── Epic 8 v1 (#194) — work schedule + clock-in nudge ───────────────────
// Interim schedule store per design doc §3.2 (docs/superpowers/specs/
// 2026-07-18-epic8-dedup-nudges-design.md): `workSchedule` in the
// extension is chrome.storage.local-only and never synced to Supabase, so
// the Sidecar/cron can't see it. Entered here instead, under
// settings.sidecar.workDays — a deliberate redundant-entry scope cut, not
// a sync-path change.
const DAY_KEYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

type DaySchedule = { enabled: boolean; start: string; end: string };
const DEFAULT_DAY_SCHEDULE: DaySchedule = { enabled: false, start: '09:00', end: '17:00' };
const HHMM_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function normalizeWorkDays(raw: Record<string, any> | undefined): Record<string, DaySchedule> {
  const out: Record<string, DaySchedule> = {};
  for (const { key } of DAY_KEYS) {
    const d = raw?.[key] || {};
    out[key] = {
      enabled: !!d.enabled,
      start: typeof d.start === 'string' ? d.start : DEFAULT_DAY_SCHEDULE.start,
      end: typeof d.end === 'string' ? d.end : DEFAULT_DAY_SCHEDULE.end,
    };
  }
  return out;
}

export default function SettingsScreen() {
  const { profile, session, signOut, saveSidecarSettings, saveChaperoneSettings } = useAuth();
  const install = useInstallPrompt(); // Plan 040 Epic 5 — install CTA
  const sc = profile?.settings?.sidecar || {};
  const cp = profile?.settings?.chaperone || {};

  const [realm, setRealm] = useState(sc.defaultRealm || profile?.default_realm || 'professional');
  const [timer, setTimer] = useState(String(sc.defaultTimer || 15));
  const [dayReset, setDayReset] = useState(String(sc.dayResetHour ?? 0));
  const [awayImmediate, setAwayImmediate] = useState(!!sc.focusAwayImmediate);
  const [showCheckpoints, setShowCheckpoints] = useState(sc.showCheckpoints !== false); // default ON
  const [pushOn, setPushOn] = useState(pushPermission() === 'granted' && !!sc.pushEnabled);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [chaperoneOn, setChaperoneOn] = useState(!!cp.enabled);
  const [quietHours, setQuietHours] = useState<{ start: number; end: number } | null>(cp.quietHours ?? null);

  // Epic 8 v1 (#194) — work schedule + clock-in nudge
  const [workDays, setWorkDays] = useState<Record<string, DaySchedule>>(normalizeWorkDays(sc.workDays));
  const [clockInNudgeOn, setClockInNudgeOn] = useState(!!sc.nudges?.clockInCheck?.enabled);
  const [nudgeQuietStart, setNudgeQuietStart] = useState(sc.nudges?.quietHoursStart || '22:00');
  const [nudgeQuietEnd, setNudgeQuietEnd] = useState(sc.nudges?.quietHoursEnd || '07:00');
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);

  // Epic 3 v1 — Task Sync (Asana) card. `patDraft` holds the user-typed
  // token only until the connect request resolves; it is never logged or
  // persisted (see data/integrations.ts).
  const asana = useAsanaIntegration(profile?.id ?? null);
  const [patDraft, setPatDraft] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [taskSyncMsg, setTaskSyncMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('bug');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<
    { kind: 'sent' | 'queued' | 'error'; text: string } | null
  >(null);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    setPushOn(pushPermission() === 'granted' && !!sc.pushEnabled);
  }, [sc.pushEnabled]);

  useEffect(() => {
    queuedFeedbackCount().then(setQueuedCount);
  }, []);

  const onTogglePush = async (v: boolean) => {
    if (!profile) return;
    if (v) {
      const res = await enablePush(profile.id);
      if (res.ok) {
        setPushOn(true);
        setPushMsg('Notifications enabled.');
        await saveSidecarSettings({ pushEnabled: true });
      } else {
        setPushOn(false);
        setPushMsg(
          res.error === 'push-not-configured'
            ? 'Push not configured on the server yet.'
            : res.error === 'denied'
              ? 'Permission denied in the browser.'
              : res.error === 'unsupported'
                ? 'This browser/device doesn’t support web push.'
                : `Couldn’t enable: ${res.error}`
        );
      }
    } else {
      await disablePush(profile.id);
      setPushOn(false);
      setPushMsg('Notifications disabled.');
      await saveSidecarSettings({ pushEnabled: false });
    }
  };

  const saveDefaults = async () => {
    let dr = parseInt(dayReset, 10);
    if (!Number.isFinite(dr) || dr < 0 || dr > 23) dr = 0;
    await saveSidecarSettings({
      defaultRealm: realm,
      defaultTimer: parseInt(timer, 10) || 15,
      dayResetHour: dr,
    });
    setPushMsg('Saved.');
  };

  // Epic 8 v1 (#194) — work schedule + clock-in nudge.
  // CRITICAL (design doc §2.5): saveSidecarSettings does a *shallow* merge
  // at the `sidecar` key level — a patch of `{ workDays: {...} }` replaces
  // the entire workDays object wholesale. `workDays` local state always
  // holds all 7 days (normalized at init from the full sc.workDays), so
  // this send is already the full read-modify-write object, never a
  // partial one.
  const setDayField = (day: string, patch: Partial<DaySchedule>) => {
    setWorkDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  const saveSchedule = async () => {
    setScheduleErr(null);
    for (const { key, label } of DAY_KEYS) {
      const d = workDays[key];
      if (d.enabled && (!HHMM_RE.test(d.start) || !HHMM_RE.test(d.end))) {
        setScheduleErr(`${label}: times must be HH:MM (24h), e.g. 09:00.`);
        return;
      }
    }
    await saveSidecarSettings({ workDays });
    setScheduleMsg('Schedule saved.');
  };

  // Same shallow-merge caveat applies to `nudges` — always send the full
  // object (quiet hours + every nudge kind), not just the field being
  // toggled, spreading the profile's current `sc.nudges` first so future
  // kinds (blockStart/idleNudge, v2/v3) this screen doesn't manage yet
  // aren't dropped.
  const saveNudgeSettings = async () => {
    if (nudgeQuietStart && !HHMM_RE.test(nudgeQuietStart)) {
      setNudgeMsg('Quiet-hours start must be HH:MM (24h).');
      return;
    }
    if (nudgeQuietEnd && !HHMM_RE.test(nudgeQuietEnd)) {
      setNudgeMsg('Quiet-hours end must be HH:MM (24h).');
      return;
    }
    const nextNudges = {
      ...(sc.nudges || {}),
      quietHoursStart: nudgeQuietStart,
      quietHoursEnd: nudgeQuietEnd,
      clockInCheck: { ...(sc.nudges?.clockInCheck || {}), enabled: clockInNudgeOn },
    };
    await saveSidecarSettings({ nudges: nextNudges });
    setNudgeMsg('Nudge settings saved.');
  };

  const onConnectAsana = async () => {
    if (connectBusy || !patDraft.trim()) return;
    setConnectBusy(true);
    setTaskSyncMsg(null);
    try {
      const res = await connectAsana(patDraft);
      if (res.ok) {
        setPatDraft(''); // credential leaves memory the moment it's stored server-side
        setTaskSyncMsg({
          kind: 'ok',
          text: res.webhookRegistered
            ? 'Connected — tasks will stream in as they change.'
            : 'Connected — tasks sync every few minutes.',
        });
        await asana.reload();
      } else {
        setTaskSyncMsg({ kind: 'err', text: res.error });
      }
    } finally {
      setConnectBusy(false);
    }
  };

  const onSyncNow = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    setTaskSyncMsg(null);
    try {
      const res = await syncAsanaNow();
      if (res.ok) {
        setTaskSyncMsg({
          kind: 'ok',
          text: res.tasksSynced > 0 ? `Synced ${res.tasksSynced} task${res.tasksSynced === 1 ? '' : 's'}.` : 'Up to date.',
        });
        await asana.reload();
      } else {
        setTaskSyncMsg({ kind: 'err', text: res.error });
      }
    } finally {
      setSyncBusy(false);
    }
  };

  const onSubmitFeedback = async () => {
    if (!feedbackText.trim() || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackResult(null);
    try {
      const res = await submitFeedback({
        kind: feedbackKind,
        text: feedbackText,
        version: SIDECAR_VERSION,
        profileId: profile?.id ?? null,
      });
      if (res.status === 'sent') {
        setFeedbackResult({ kind: 'sent', text: 'Sent — thanks!' });
        setFeedbackText('');
      } else if (res.status === 'queued') {
        setFeedbackResult({
          kind: 'queued',
          text: 'Saved locally — we’ll send it once the feedback pipeline is live.',
        });
        setFeedbackText('');
        setQueuedCount((n) => n + 1);
      } else {
        setFeedbackResult({ kind: 'error', text: res.reason });
      }
    } finally {
      setFeedbackBusy(false);
    }
  };

  const onRetryQueue = async () => {
    setFeedbackBusy(true);
    try {
      const { sent, remaining } = await flushFeedbackQueue();
      setQueuedCount(remaining);
      if (sent > 0 && remaining === 0) {
        setFeedbackResult({ kind: 'sent', text: `Sent ${sent} queued item${sent === 1 ? '' : 's'}.` });
      } else if (sent > 0) {
        setFeedbackResult({ kind: 'queued', text: `Sent ${sent}, ${remaining} still waiting.` });
      } else {
        setFeedbackResult({ kind: 'queued', text: 'Still can’t reach the feedback pipeline — try again later.' });
      }
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Account</SectionLabel>
        <Text style={styles.name}>{profile?.display_name || 'Tabatha User'}</Text>
        <Text style={styles.email}>{session?.user?.email}</Text>
        <Text style={styles.device}>📱 {deviceLabel()}</Text>
        {install.available && (
          <Pressable onPress={install.promptInstall} style={styles.installRow}>
            <Text style={styles.installRowTxt}>📲 Install Tabby</Text>
          </Pressable>
        )}
        {!install.available && !install.installed && install.isIOS && (
          <Text style={[styles.hint, { marginTop: 8 }]}>Share → Add to Home Screen to install</Text>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Focus & checkpoint modals</Text>
            <Text style={styles.rowSub}>
              Get the same timer / checkpoint nudges you’d see on the extension.
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={onTogglePush}
            disabled={!pushSupported()}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        {!pushSupported() && (
          <Text style={styles.hint}>
            On iPhone, add this page to your Home Screen first to allow push.
          </Text>
        )}
        {pushMsg && <Text style={styles.msg}>{pushMsg}</Text>}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Defaults for new intents</SectionLabel>
        <Text style={styles.rowTitle}>Realm</Text>
        <View style={styles.realmRow}>
          {REALMS.map((r) => (
            <Pressable
              key={r}
              onPress={() => setRealm(r)}
              style={[
                styles.realmPill,
                realm === r && { borderColor: colors.accent, backgroundColor: colors.accentDim },
              ]}
            >
              <Text style={{ fontSize: 12, color: realm === r ? colors.accent : colors.textMuted }}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View>
            <Text style={[styles.rowTitle, { marginTop: 12 }]}>Default timer (min)</Text>
            <TextInput value={timer} onChangeText={setTimer} keyboardType="number-pad" inputMode="numeric" style={styles.input} />
          </View>
          <View>
            <Text style={[styles.rowTitle, { marginTop: 12 }]}>Day resets at (hr)</Text>
            <TextInput value={dayReset} onChangeText={setDayReset} keyboardType="number-pad" inputMode="numeric" style={styles.input} />
          </View>
        </View>
        <Text style={styles.rowSub}>The Context View’s day countdown (of 1440 min) counts down to this hour.</Text>
        <View style={{ marginTop: 12 }}>
          <Btn label="Save defaults" onPress={saveDefaults} filled />
        </View>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Context View (big screen)</SectionLabel>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Immediate phone-away alert</Text>
            <Text style={styles.rowSub}>
              In Phone Focus Mode, leaving the Sidecar turns your big screen red. On = instant; off = slow fade-in.
            </Text>
          </View>
          <Switch
            value={awayImmediate}
            onValueChange={async (v) => { setAwayImmediate(v); await saveSidecarSettings({ focusAwayImmediate: v }); }}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.switchRow, { marginTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Checkpoint counter</Text>
            <Text style={styles.rowSub}>
              Show a small "📋 N checkpoints · last note" line under the current focus.
            </Text>
          </View>
          <Switch
            value={showCheckpoints}
            onValueChange={async (v) => { setShowCheckpoints(v); await saveSidecarSettings({ showCheckpoints: v }); }}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Work schedule & nudges</SectionLabel>
        <Text style={styles.rowTitle}>Clock-in nudge</Text>
        <View style={[styles.switchRow, { marginTop: 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowSub}>
              "Are you working yet?" — pushed once a day if your shift start passes without a clock-in.
            </Text>
          </View>
          <Switch
            value={clockInNudgeOn}
            onValueChange={setClockInNudgeOn}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <View>
            <Text style={styles.rowTitle}>Quiet hours start</Text>
            <TextInput
              value={nudgeQuietStart}
              onChangeText={setNudgeQuietStart}
              placeholder="22:00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View>
            <Text style={styles.rowTitle}>Quiet hours end</Text>
            <TextInput
              value={nudgeQuietEnd}
              onChangeText={setNudgeQuietEnd}
              placeholder="07:00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.rowSub}>No nudges fire during quiet hours, regardless of your schedule below.</Text>
        <View style={{ marginTop: 10 }}>
          <Btn label="Save nudge settings" onPress={saveNudgeSettings} filled />
        </View>
        {nudgeMsg && <Text style={styles.msg}>{nudgeMsg}</Text>}

        <View style={styles.divider} />

        <Text style={[styles.rowTitle, { marginBottom: 8 }]}>Work days</Text>
        {DAY_KEYS.map(({ key, label }) => {
          const d = workDays[key];
          return (
            <View key={key} style={styles.dayRow}>
              <Switch
                value={d.enabled}
                onValueChange={(v) => setDayField(key, { enabled: v })}
                trackColor={{ true: colors.accent, false: colors.border }}
                thumbColor="#fff"
              />
              <Text style={styles.dayLabel}>{label}</Text>
              <TextInput
                value={d.start}
                onChangeText={(v) => setDayField(key, { start: v })}
                placeholder="09:00"
                placeholderTextColor={colors.textMuted}
                editable={d.enabled}
                style={[styles.dayInput, !d.enabled && styles.dayInputDisabled]}
              />
              <Text style={styles.dayTo}>–</Text>
              <TextInput
                value={d.end}
                onChangeText={(v) => setDayField(key, { end: v })}
                placeholder="17:00"
                placeholderTextColor={colors.textMuted}
                editable={d.enabled}
                style={[styles.dayInput, !d.enabled && styles.dayInputDisabled]}
              />
            </View>
          );
        })}
        <Text style={styles.rowSub}>
          The clock-in nudge checks against each day's start time. End time is for your own reference today.
        </Text>
        <View style={{ marginTop: 10 }}>
          <Btn label="Save schedule" onPress={saveSchedule} filled />
        </View>
        {scheduleErr && <Text style={[styles.msg, { color: colors.red }]}>{scheduleErr}</Text>}
        {scheduleMsg && !scheduleErr && <Text style={styles.msg}>{scheduleMsg}</Text>}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Task sync</SectionLabel>
        {asana.integration?.status === 'active' ? (
          <>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Asana — connected</Text>
                <Text style={styles.rowSub}>
                  Connected since{' '}
                  {new Date(asana.integration.connected_at).toLocaleDateString()}
                  {asana.integration.last_synced_at
                    ? ` · last synced ${new Date(asana.integration.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : ' · first sync pending'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn
                label={syncBusy ? 'Syncing…' : 'Sync now'}
                onPress={onSyncNow}
                filled
                disabled={syncBusy}
              />
              <Btn label="Disconnect" onPress={() => {}} color={colors.textMuted} disabled />
            </View>
            <Text style={styles.hint}>Disconnect is coming soon.</Text>
          </>
        ) : (
          <>
            <Text style={styles.rowSub}>
              Pull your Asana tasks into the Tasks tab — subtasks and blockers included —
              and start a focus straight from any of them.
              {asana.integration?.status === 'error'
                ? ' Your previous token stopped working; paste a fresh one to reconnect.'
                : ''}
            </Text>
            <TextInput
              value={patDraft}
              onChangeText={setPatDraft}
              placeholder="Paste your Asana personal access token"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.patInput}
            />
            <Text style={styles.rowSub}>
              Asana → Settings → Apps → Developer apps → Personal access tokens. The token is
              stored encrypted server-side and never shown again.
            </Text>
            <View style={{ marginTop: 10 }}>
              <Btn
                label={connectBusy ? 'Connecting…' : 'Connect Asana'}
                onPress={onConnectAsana}
                filled
                disabled={connectBusy || !patDraft.trim()}
              />
            </View>
          </>
        )}
        {taskSyncMsg && (
          <Text style={[styles.msg, taskSyncMsg.kind === 'err' && { color: colors.red }]}>
            {taskSyncMsg.kind === 'ok' ? '✓ ' : '⚠ '}
            {taskSyncMsg.text}
          </Text>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>💬 Feedback & bug report</SectionLabel>
        <View style={styles.realmRow}>
          <Pressable
            onPress={() => setFeedbackKind('bug')}
            style={[
              styles.realmPill,
              feedbackKind === 'bug' && { borderColor: colors.red, backgroundColor: colors.red + '22' },
            ]}
          >
            <Text style={{ fontSize: 12, color: feedbackKind === 'bug' ? colors.red : colors.textMuted }}>
              🐛 Bug
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFeedbackKind('feature')}
            style={[
              styles.realmPill,
              feedbackKind === 'feature' && { borderColor: colors.accent, backgroundColor: colors.accentDim },
            ]}
          >
            <Text style={{ fontSize: 12, color: feedbackKind === 'feature' ? colors.accent : colors.textMuted }}>
              💡 Feature request
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={feedbackText}
          onChangeText={setFeedbackText}
          placeholder={
            feedbackKind === 'bug'
              ? "What broke? What did you expect instead?"
              : "What would make Tabby more useful?"
          }
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          style={styles.feedbackInput}
        />
        <View style={{ marginTop: 10 }}>
          <Btn
            label={feedbackBusy ? 'Sending…' : 'Send feedback'}
            onPress={onSubmitFeedback}
            filled
            disabled={feedbackBusy || !feedbackText.trim()}
          />
        </View>
        {feedbackResult && (
          <Text
            style={[
              styles.msg,
              feedbackResult.kind === 'error' && { color: colors.red },
              feedbackResult.kind === 'queued' && { color: colors.amber },
            ]}
          >
            {feedbackResult.kind === 'sent' ? '✓ ' : feedbackResult.kind === 'queued' ? '📥 ' : '⚠ '}
            {feedbackResult.text}
          </Text>
        )}
        {queuedCount > 0 && (
          <View style={styles.queueRow}>
            <Text style={styles.hint}>
              {queuedCount} feedback item{queuedCount === 1 ? '' : 's'} waiting to send.
            </Text>
            <Btn label="Retry now" onPress={onRetryQueue} small disabled={feedbackBusy} />
          </View>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Chaperone voice</SectionLabel>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Personality interrupts</Text>
            <Text style={styles.rowSub}>
              When you pick up your phone mid-focus, the Context View plays a pre-recorded
              line to nudge you back. Theater only — never a real action.
            </Text>
          </View>
          <Switch
            value={chaperoneOn}
            onValueChange={async (v) => { setChaperoneOn(v); await saveChaperoneSettings({ enabled: v, pack: 'classic' }); }}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
        {chaperoneOn && (
          <>
            <Text style={[styles.rowTitle, { marginTop: 12 }]}>Quiet hours</Text>
            <View style={styles.realmRow}>
              {QUIET_HOUR_PRESETS.map((p) => {
                const on = p.start == null ? !quietHours : quietHours?.start === p.start && quietHours?.end === p.end;
                return (
                  <Pressable
                    key={p.label}
                    onPress={async () => {
                      const next = p.start == null ? null : { start: p.start, end: p.end as number };
                      setQuietHours(next);
                      await saveChaperoneSettings({ quietHours: next });
                    }}
                    style={[styles.realmPill, on && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}
                  >
                    <Text style={{ fontSize: 12, color: on ? colors.accent : colors.textMuted }}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <Btn label="Sign out" color={colors.red} onPress={signOut} />
      <Text style={styles.version}>Tabby Sidecar v{SIDECAR_VERSION}</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  device: { fontSize: 12, color: colors.accent, marginTop: 8 },
  installRow: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  installRowTxt: { fontSize: 12, fontWeight: '700', color: colors.accent },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hint: { fontSize: 12, color: colors.amber, marginTop: 10 },
  msg: { fontSize: 12, color: colors.accent, marginTop: 10 },
  realmRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  realmPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    width: 100,
    marginTop: 6,
  },
  version: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  patInput: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 10,
  },
  feedbackInput: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 10,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    width: 32,
  },
  dayInput: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: colors.textPrimary,
    fontSize: 13,
    width: 68,
    textAlign: 'center',
  },
  dayInputDisabled: {
    opacity: 0.4,
  },
  dayTo: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
