import React, { useState, useEffect } from 'react';

/**
 * CompanionStatus — Status indicator for the desktop companion connection.
 * Shows connection state, active app, and category when the companion is running.
 * Compact design for embedding in the dashboard header or sidebar.
 */
export default function CompanionStatus({ compact = false }) {
  const [connected, setConnected] = useState(false);
  const [activeApp, setActiveApp] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    // Initial load from storage
    chrome.storage.local.get(
      ['companionConnected', 'companionActiveApp', 'companionStatus'],
      (result) => {
        setConnected(!!result.companionConnected);
        setActiveApp(result.companionActiveApp || null);
        setStatus(result.companionStatus || null);
      }
    );

    // Listen for storage changes
    const listener = (changes) => {
      if (changes.companionConnected) {
        setConnected(!!changes.companionConnected.newValue);
      }
      if (changes.companionActiveApp) {
        setActiveApp(changes.companionActiveApp.newValue || null);
      }
      if (changes.companionStatus) {
        setStatus(changes.companionStatus.newValue || null);
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  const categoryEmoji = {
    development: '💻',
    communication: '💬',
    design: '🎨',
    productivity: '📝',
    email: '📧',
    media: '🎵',
    entertainment: '🎮',
    browser: '🌐',
    system: '⚙️',
    unknown: '❓',
  };

  if (compact) {
    // Tiny indicator — just a dot + tooltip
    return (
      <div
        className="companion-indicator"
        title={
          connected
            ? `Desktop companion v${status?.version || '?'} — ${activeApp?.displayName || 'Connected'}`
            : 'Desktop companion not connected'
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'default',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: connected ? '#10ac84' : '#5a6270',
            boxShadow: connected ? '0 0 4px rgba(16,172,132,0.5)' : 'none',
            transition: 'all 0.3s ease',
          }}
        />
        {connected && activeApp && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #8b93a1)' }}>
            {categoryEmoji[activeApp.category] || '❓'}
          </span>
        )}
      </div>
    );
  }

  // Full widget
  return (
    <div
      className="companion-status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '6px',
        background: connected
          ? 'rgba(16,172,132,0.08)'
          : 'rgba(90,98,112,0.08)',
        border: `1px solid ${connected ? 'rgba(16,172,132,0.2)' : 'rgba(90,98,112,0.15)'}`,
        fontSize: '12px',
        transition: 'all 0.3s ease',
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: connected ? '#10ac84' : '#5a6270',
          boxShadow: connected ? '0 0 6px rgba(16,172,132,0.4)' : 'none',
          flexShrink: 0,
        }}
      />

      {connected ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--text-primary, #e8eaf0)',
              fontWeight: 500,
            }}
          >
            {activeApp ? (
              <>
                <span>{categoryEmoji[activeApp.category] || '❓'}</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeApp.displayName}
                </span>
              </>
            ) : (
              <span>Desktop Connected</span>
            )}
          </div>
          {activeApp?.windowTitle && (
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #5a6270)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
              }}
            >
              {activeApp.windowTitle}
            </div>
          )}
        </div>
      ) : (
        <span style={{ color: 'var(--text-muted, #5a6270)' }}>
          Desktop offline
        </span>
      )}
    </div>
  );
}
