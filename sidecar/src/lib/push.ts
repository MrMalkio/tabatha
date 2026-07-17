import { Platform } from 'react-native';
import { supabase } from './supabase';
import { VAPID_PUBLIC_KEY } from './pushConfig';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Service-worker path honoring the /sidecar base path. */
function swUrl(): string {
  if (typeof window === 'undefined') return '/sw.js';
  const base = window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/sw.js`.replace(/\/\//g, '/');
}
function swScope(): string {
  if (typeof window === 'undefined') return '/';
  const base = window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/`.replace(/\/\//g, '/');
}

/**
 * Request permission, register the SW, subscribe to Web Push, and store the
 * subscription in `push_subscriptions` for the current profile.
 */
export async function enablePush(
  profileId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'unsupported' };
  if (VAPID_PUBLIC_KEY.includes('__VAPID')) {
    return { ok: false, error: 'push-not-configured' };
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'denied' };

    const reg = await navigator.serviceWorker.register(swUrl(), {
      scope: swScope(),
    });
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: profileId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        last_ok_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'error' };
  }
}

export async function disablePush(profileId: string): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(swScope());
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const json = sub.toJSON();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('profile_id', profileId)
        .eq('endpoint', json.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* best effort */
  }
}
