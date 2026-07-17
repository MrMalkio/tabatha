/**
 * Webhook Trigger System — Outbound event notifications.
 * Sends POST requests to user-configured webhook URLs when
 * key Tabatha events occur (focus start/end, clock in/out, task complete, etc.)
 *
 * Stored in chrome.storage.local under 'tabathaWebhooks'.
 * Format: { enabled: bool, url: string, events: string[], secret: string }
 */

const TRIGGERABLE_EVENTS = [
  'focus_started',
  'focus_ended',
  'focus_timer_expired',
  'focus_resolved',
  'clock_in',
  'clock_out',
  'break_started',
  'break_ended',
  'task_created',
  'task_completed',
  'context_drift',
  'unfocused_nudge',
  'tab_reassigned',
];

async function getWebhookConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get('tabathaWebhooks', result => {
      resolve(result.tabathaWebhooks || { enabled: false, url: '', events: [], secret: '' });
    });
  });
}

/**
 * Fire a webhook for a given event type.
 * Only sends if webhooks are enabled and the event type is subscribed.
 */
export async function fireWebhook(eventType, payload = {}) {
  try {
    const config = await getWebhookConfig();
    if (!config.enabled || !config.url) return;
    if (config.events.length > 0 && !config.events.includes(eventType)) return;

    const body = {
      event: eventType,
      timestamp: new Date().toISOString(),
      source: 'tabatha',
      version: chrome.runtime.getManifest?.()?.version || 'unknown',
      data: payload,
    };

    // Optional HMAC-SHA256 signature over the exact request body. Overlock's
    // Tabatha connector verifies this before accepting privacy-bounded events.
    const headers = { 'Content-Type': 'application/json' };
    if (config.secret) {
      const encoded = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoded.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoded.encode(JSON.stringify(body)));
      headers['X-Tabatha-Signature'] = Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.warn(`[Tabatha Webhook] ${eventType} → ${response.status} ${response.statusText}`);
    }
  } catch (e) {
    // Silently fail — webhooks are fire-and-forget
    console.warn('[Tabatha Webhook] Error:', e.message);
  }
}

export { TRIGGERABLE_EVENTS };
