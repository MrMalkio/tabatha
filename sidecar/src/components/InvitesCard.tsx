import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Card, SectionLabel, Btn } from '../ui/kit';
import { colors, radius } from '../lib/theme';
import {
  createInviteToken,
  fetchOwnScopes,
  type InviteKind,
  type OrgMembership,
  type TeamMembership,
} from '../lib/invites';

const ROLE_OPTIONS = ['user', 'sub_manager', 'manager', 'read_only'];

// Invite type — migration 043. 'demo'/'founder' are account-only (no
// org/team picker, no role picker — role only matters for a membership
// row, which neither kind creates); 'team' is the pre-existing flow. The
// RPC is still the authority on who may mint each kind (team: org owner
// or team owner/manager/sub_manager for the target; demo/founder: owner
// of at least one org) — this UI doesn't pre-hide any chip by role.
const INVITE_KIND_OPTIONS: { value: InviteKind; label: string }[] = [
  { value: 'demo', label: 'Demo' },
  { value: 'team', label: 'My team' },
  { value: 'founder', label: 'Founder' },
];

const KIND_RESULT_LABEL: Record<InviteKind, string> = {
  demo: 'Demo invite — account only',
  team: 'Team invite',
  founder: "Founder invite — they'll create their own team",
};

// Founder invites hand the redeemer a bare account; they create their own
// org afterward via tabatha.create_organization (migration 020). That RPC
// currently has NO UI surface in the Sidecar (extension-only, see
// src/settings/... in the main app) — a founder-kind invitee has nowhere
// in the Sidecar today to actually create their org. Flagged, not built
// here (out of scope for this card).
const FOUNDER_ORG_CREATE_GAP =
  'They’ll need the browser extension to create their org for now — the Sidecar has no "create organisation" screen yet.';

// Invites card — Settings. Mints tabatha.invite_tokens via the
// SECURITY DEFINER RPC tabatha.create_invite_token (migration 012 + 043);
// org owners / team owners-managers-sub_managers only for 'team' kind, org
// owners only for 'demo'/'founder'. The RPC itself is the authority on who
// may mint — this card stays visible and lets anyone with at least one
// org/team membership attempt it, surfacing the RPC's own permission error
// with friendly copy rather than pre-hiding the form by role (a plain
// 'user' role member should still be able to try and see why it's
// refused, matching how the extension's TeamActivityPanel works).
export default function InvitesCard() {
  const { profile } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [teams, setTeams] = useState<TeamMembership[]>([]);
  const [scopesLoaded, setScopesLoaded] = useState(false);
  const [kind, setKind] = useState<InviteKind>('team');

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
    | { ok: true; token: string; expiresAt?: string; kind: InviteKind }
    | { ok: false; error: string }
    | null
  >(null);

  useEffect(() => {
    if (!orgId && orgs[0]) setOrgId(orgs[0].org_id);
  }, [orgs, orgId]);

  const hasScope = orgs.length > 0 || teams.length > 0;
  const isTeamKind = kind === 'team';
  const canMint = isTeamKind ? !!orgId : true;

  const mint = async () => {
    if (busy || !canMint) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await createInviteToken(
        isTeamKind
          ? { orgId, teamId: teamId || null, role, expiresInHours: 168, kind }
          : { orgId: null, teamId: null, expiresInHours: 168, kind }
      );
      if (res.success && res.token) {
        setResult({ ok: true, token: res.token, expiresAt: res.expires_at, kind: res.kind ?? kind });
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

          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>Invite type</Text>
            <View style={styles.pillRow}>
              {INVITE_KIND_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    setKind(opt.value);
                    setResult(null);
                  }}
                  style={[styles.pill, kind === opt.value && styles.pillOn]}
                >
                  <Text style={[styles.pillTxt, kind === opt.value && styles.pillTxtOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {kind === 'founder' && <Text style={styles.hint}>{FOUNDER_ORG_CREATE_GAP}</Text>}

          {isTeamKind && orgs.length > 0 && (
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

          {isTeamKind && teams.length > 0 && (
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

          {isTeamKind && (
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
          )}

          <View style={{ marginTop: 12 }}>
            <Btn
              label={busy ? 'Creating…' : 'Create invite code'}
              onPress={mint}
              filled
              disabled={busy || !canMint}
            />
          </View>

          {result?.ok && (
            <View style={styles.resultBox}>
              <Text style={styles.resultOk}>✓ {KIND_RESULT_LABEL[result.kind]}</Text>
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
