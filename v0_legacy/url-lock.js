// Tabatha — URL Lock Content Script (url-lock.js)
// Injected dynamically into URL-locked tabs.
// Intercepts link clicks that would navigate away from the locked URL scope.

(function() {
  'use strict';

  // Avoid double-injection
  if (window.__tabathaUrlLockActive) return;
  window.__tabathaUrlLockActive = true;

  // Visual indicator — subtle glowing border
  const indicator = document.createElement('div');
  indicator.id = 'tabatha-url-lock-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 2147483647;
    border: 2px solid rgba(0, 210, 255, 0.4);
    box-shadow: inset 0 0 20px rgba(0, 210, 255, 0.1);
    transition: opacity 0.3s ease;
  `;
  document.documentElement.appendChild(indicator);

  // Pulse animation
  let opacity = 0.4;
  let direction = -1;
  setInterval(() => {
    opacity += direction * 0.005;
    if (opacity <= 0.2) direction = 1;
    if (opacity >= 0.5) direction = -1;
    indicator.style.borderColor = `rgba(0, 210, 255, ${opacity})`;
    indicator.style.boxShadow = `inset 0 0 20px rgba(0, 210, 255, ${opacity * 0.25})`;
  }, 50);

  // Small badge in top-right
  const badge = document.createElement('div');
  badge.id = 'tabatha-url-lock-badge';
  badge.textContent = '🔗 URL Locked';
  badge.style.cssText = `
    position: fixed;
    top: 8px; right: 8px;
    padding: 4px 10px;
    background: rgba(0, 20, 40, 0.85);
    color: #00d2ff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid rgba(0, 210, 255, 0.3);
    z-index: 2147483647;
    pointer-events: none;
    backdrop-filter: blur(8px);
    animation: tabatha-badge-fade 3s forwards;
  `;
  document.documentElement.appendChild(badge);

  // Fade badge after 3s
  const style = document.createElement('style');
  style.textContent = `
    @keyframes tabatha-badge-fade {
      0% { opacity: 1; }
      70% { opacity: 1; }
      100% { opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);

  // Get the locked base URL from the service worker
  const currentBase = getBase(window.location.href);

  function getBase(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return null;
    }
  }

  // Intercept clicks on anchor elements
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor || !anchor.href) return;

    const targetBase = getBase(anchor.href);
    if (!targetBase || !currentBase) return;

    // If the link navigates away from the base URL
    if (targetBase !== currentBase) {
      e.preventDefault();
      e.stopPropagation();

      // Tell service worker to open in new tab
      chrome.runtime.sendMessage({
        type: 'URL_LOCK_INTERCEPT',
        blockedUrl: anchor.href,
        fromUrl: window.location.href
      });

      // Flash the border indicator
      indicator.style.borderColor = 'rgba(255, 100, 100, 0.8)';
      indicator.style.boxShadow = 'inset 0 0 30px rgba(255, 100, 100, 0.2)';
      setTimeout(() => {
        indicator.style.borderColor = `rgba(0, 210, 255, 0.4)`;
        indicator.style.boxShadow = 'inset 0 0 20px rgba(0, 210, 255, 0.1)';
      }, 500);
    }
  }, true); // Capture phase to catch before other handlers

  // Also intercept form submissions that navigate away
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.action) return;
    
    const targetBase = getBase(form.action);
    if (targetBase && currentBase && targetBase !== currentBase) {
      e.preventDefault();
      chrome.runtime.sendMessage({
        type: 'URL_LOCK_INTERCEPT',
        blockedUrl: form.action,
        fromUrl: window.location.href
      });
    }
  }, true);

  // Listen for removal message
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'REMOVE_URL_LOCK') {
      indicator.remove();
      badge.remove();
      style.remove();
      window.__tabathaUrlLockActive = false;
    }
  });
})();
