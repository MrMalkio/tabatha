import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';

// Root error boundary (v0.6.0, "stuck Sidecar" incident follow-up). Without
// one, a render-time crash in production unmounts the whole tree — the app
// freezes on whatever was last painted with zero feedback, which reads as
// "Sidecar is stuck". This turns that into an explicit recovery screen whose
// reload also pulls a fresh bundle (the crash may BE a stale-bundle bug).

type State = { crashed: boolean };

export default class CrashGuard extends React.Component<React.PropsWithChildren, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    // No remote logging here — keep the boundary dependency-free so it can
    // never be the thing that crashes.
    console.warn('Sidecar crashed at render:', error);
  }

  private reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ crashed: false });
    }
  };

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>😵 Tabby hit a snag</Text>
        <Text style={styles.sub}>
          Something broke while drawing this screen. Reloading usually fixes it
          (and picks up the latest version).
        </Text>
        <Pressable style={styles.btn} onPress={this.reload}>
          <Text style={styles.btnTxt}>Reload Sidecar</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  btn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnTxt: { color: '#04222a', fontWeight: '800', fontSize: 15 },
});
