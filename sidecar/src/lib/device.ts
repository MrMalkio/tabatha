import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_KEY = 'tabby.sidecar.deviceId';

function uuid(): string {
  // RFC4122-ish v4 without a native crypto dep (fine for a device tag).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Kept as a literal (mirrors app.json) rather than pulled in via
// expo-constants at runtime — same approach the Settings screen's version
// footer already used before this was extracted. Bump alongside app.json.
export const SIDECAR_VERSION = '0.6.2';

let cached: string | null = null;

/**
 * Stable per-device id used as the Sidecar install's `machine_id` / `local_id`
 * so the phone registers as its own device in `browser_profiles` and its
 * intents are attributed off-device.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    /* fall through */
  }
  const id = `sidecar-${uuid()}`;
  cached = id;
  try {
    await AsyncStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* best effort */
  }
  return id;
}

export function deviceLabel(): string {
  if (Platform.OS === 'web') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone (Sidecar)';
    if (/android/i.test(ua)) return 'Android (Sidecar)';
    return 'Web Sidecar';
  }
  return `${Platform.OS} Sidecar`;
}
