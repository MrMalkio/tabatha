import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors, radius } from '../lib/theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  color = colors.textMuted,
  bg,
}: {
  label: string;
  color?: string;
  bg?: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg || color + '22' }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export function Btn({
  label,
  onPress,
  color = colors.accent,
  filled = false,
  small = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        {
          borderColor: color,
          backgroundColor: filled ? color : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          small && { fontSize: 12 },
          { color: filled ? '#04121A' : color },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Mic capture button (feature #165 Voice Notes / Plan 040 Epic 1). Renders
 * nothing when the browser has no SpeechRecognition (e.g. iOS Safari) —
 * per spec, voice capture is a graceful no-op there, not a disabled ghost.
 * Pulses while `listening` is true.
 */
export function MicButton({
  listening,
  supported,
  onPress,
}: {
  listening: boolean;
  supported: boolean;
  onPress: () => void;
}) {
  const pulse = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 480, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  if (!supported) return null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.mic, listening && styles.micActive]}
      accessibilityLabel={listening ? 'Stop voice capture' : 'Start voice capture'}
    >
      <Animated.Text style={[styles.micIcon, { transform: [{ scale: pulse }] }]}>🎤</Animated.Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11, fontWeight: '700' } as TextStyle,
  btn: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingHorizontal: 9, paddingVertical: 5 },
  btnText: { fontSize: 13, fontWeight: '700' } as TextStyle,
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  mic: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBase,
  },
  micActive: {
    borderColor: colors.red,
    backgroundColor: 'rgba(239,83,80,0.14)',
  },
  micIcon: { fontSize: 16 },
});
