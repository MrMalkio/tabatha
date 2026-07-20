import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Card, SectionLabel, Btn } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import {
  createInviteToken,
  fetchOwnScopes,
  type OrgMembership,
  type TeamMembership,
} from '../lib/invites';

const ROLE_OPTIONS = ['user', 'sub_manager', 'manager', 'read_only'];

// Invites card — Settings. Mints tabatha.invite_tokens via the
// SECURITY DEFINER RPC tabatha.create_invite_token (migration 012); org
// owners / team owners-managers-sub_managers only. The RPC itself is the
// authority on who may mint — this card stays visible and lets anyone with
// at least one org/team membership attempt it, surfacing the RPC's own
// permission error with friendly copy rather than pre-hiding the form by
// role (a plain 'user' role member should still be able to try and see why
// it's refused, matching how the extension's TeamActivityPanel works).
export default function InvitesCard() {
  const { profile } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [scopesLoaded, setScopesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.id) return undefined;
    fetchOwnScopes(profile.id).then(({ orgs: o, teams: t }) => {
      if (cancelled) return;
      setOrgs(o);
      setTeams(t);
      setScopesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const [orgId, setOrgId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [role, setRole] = useState('user');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { ok: true; token: string; expiresAt?: string } | { ok: false; error: string } | null
  >(null);

  useEffect(() => {
    if (!orgId && orgs[0]) setOrgId(orgs[0].org_id);
  }, [orgs, orgId]);

  const hasScope = orgs.length > 0 || teams.length > 0;

  const mint = async () => {
    if (busy || !orgId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await createInviteToken({ orgId, teamId: teamId || null, role, expiresInHours: 168 });
      if (res.success && res.token) {
        setResult({ ok: true, token: res.token, expiresAt: res.expires_at });
      } else {
        const raw = res.error || 'Could not create an invite.';
        const friendly = /not authoris/i.test(raw) ? "Your account can't create invites yet." : raw;
        setResult({ ok: false, error: friendly });
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || 'Could not create an invite.' });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      try {
        await (navigator as any).clipboard.writeText(text);
      } catch {
        /* best effort — the field below is still selectable by hand */
      }
    }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionLabel>Invites</SectionLabel>

      {!scopesLoaded ? (
        <Text style={styles.sub}>Loading…</Text>
      ) : !hasScope ? (
        <Text style={styles.sub}>
          You’re not part of an organisation or team yet, so there’s nothing to invite anyone
          into.
        </Text>
      ) : (
        <>
          <Text style={styles.sub}>
            Create a one-time code so someone else can sign in — Tabatha is invite-only while the
            extension is unlisted. Codes are single-use.
          </Text>

          {orgs.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.label}>Organisation</Text>
              <View style={styles.pillRow}>
                {orgs.map((o) => (
                  <Pressable
                    key={o.org_id}
                    onPress={() => setOrgId(o.org_id)}
                    style={[styles.pill, orgId === o.org_id && styles.pillOn]}
                  >
                    <Text style={[styles.pillTxt, orgId === o.org_id && styles.pillTxtOn]}>
                      {o.org_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {teams.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.label}>Team (optional)</Text>
              <View style={styles.pillRow}>
                <Pressable onPress={() => setTeamId('')} style={[styles.pill, teamId === '' && styles.pillOn]}>
                  <Text style={[styles.pillTxt, teamId === '' && styles.pillTxtOn]}>None</Text>
                </Pressable>
                {teams.map((t) => (
                  <Pressable
                    key={t.team_id}
                    onPress={() => setTeamId(t.team_id)}
                    style={[styles.pill, teamId === t.team_id && styles.pillOn]}
                  >
                    <Text style={[styles.pillTxt, teamId === t.team_id && styles.pillTxtOn]}>
                      {t.team_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.pillRow}>
              {ROLE_OPTIONS.map((r) => (
                <Pressable key={r} onPress={() => setRole(r)} style={[styles.pill, role === r && styles.pillOn]}>
                  <Text style={[styles.pillTxt, role === r && styles.pillTxtOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Btn
              label={busy ? 'Creating…' : 'Create invite code'}
              onPress={mint}
              filled
              disabled={busy || !orgId}
            />
          </View>

          {result?.ok && (
            <View style={styles.resultBox}>
              <Text style={styles.resultOk}>✓ Code created</Text>
              <View style={styles.codeRow}>
                <TextInput value={result.token} editable={false} selectTextOnFocus style={styles.codeInput} />
                <Pressable onPress={() => copyCode(result.token)} style={styles.copyBtn}>
                  <Text style={styles.copyBtnTxt}>Copy</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                Codes are single-use
                {result.expiresAt ? ` · expires ${new Date(result.expiresAt).toLocaleDateString()}` : ''}.
              </Text>
            </View>
          )}
          {result && !result.ok && <Text style={[styles.hint, { color: colors.red, marginTop: 10 }]}>{result.error}</Text>}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  pillTxt: { fontSize: 12, color: colors.textMuted },
  pillTxtOn: { color: colors.accent },
  resultBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.bgBase,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultOk: { color: colors.green, fontSize: 12, fontWeight: '600' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  copyBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyBtnTxt: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
});
