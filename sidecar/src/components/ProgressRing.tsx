import React from 'react';
import { View } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Cross-platform (native + web) circular progress ring — the classic
 * two-half-circle mask/rotation technique (no SVG dependency, no
 * web-only CSS gradients), so it renders the same in the RN-Web PWA today
 * and in the native iOS/Android build once that ships. `progress` is 0..1.
 */
export default function ProgressRing({
  size,
  thickness,
  progress,
  color,
  trackColor = colors.border,
  bgColor = colors.bgBase,
  children,
}: {
  size: number;
  thickness: number;
  progress: number;
  color: string;
  trackColor?: string;
  bgColor?: string;
  children?: React.ReactNode;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const deg = p * 360;
  const rightRot = Math.min(deg, 180);
  const leftRot = Math.max(0, deg - 180);
  const half = size / 2;

  return (
    <View style={{ width: size, height: size, borderRadius: half, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, right: 0, width: half, height: size, overflow: 'hidden' }}>
        <View
          style={
            {
              width: half,
              height: size,
              backgroundColor: color,
              transformOrigin: 'left center',
              transform: [{ rotate: `${rightRot}deg` }],
            } as any
          }
        />
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
        <View
          style={
            {
              width: half,
              height: size,
              backgroundColor: leftRot > 0 ? color : trackColor,
              transformOrigin: 'right center',
              transform: [{ rotate: `${leftRot}deg` }],
            } as any
          }
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: thickness,
          left: thickness,
          right: thickness,
          bottom: thickness,
          borderRadius: half - thickness,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}
