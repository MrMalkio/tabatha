import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';

/**
 * UnifiedTimeline — Horizontal timeline bar showing colored segments by category.
 * Each segment represents an app session, sized proportionally to duration.
 * Broken down by minutes with time markers.
 *
 * Data: chrome.storage.local.companionRecentSessions
 */

const CATEGORY_COLORS = {
  development: '#5b8def',
  communication: '#a855f7',
  design: '#ec4899',
  productivity: '#22c55e',
  email: '#f59e0b',
  media: '#14b8a6',
  entertainment: '#ef4444',
  browser: '#06b6d4',
  system: '#6b7280',
  unknown: '#4b5563',
};

const CATEGORY_EMOJI = {
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

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

function formatTimeOfDay(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export default function UnifiedTimeline({ compact = false }) {
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const barRef = useRef(null);

  useEffect(() => {
    // Load initial data
    chrome.storage.local.get(
      ['companionConnected', 'companionRecentSessions'],
      (result) => {
        setConnected(!!result.companionConnected);
        setSessions(result.companionRecentSessions || []);
      }
    );

    // Listen for changes
    const listener = (changes) => {
      if (changes.companionConnected) {
        setConnected(!!changes.companionConnected.newValue);
      }
      if (changes.companionRecentSessions) {
        setSessions(changes.companionRecentSessions.newValue || []);
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  // Process sessions into timeline segments — filtered to TODAY only
  const { segments, timeRange, categoryTotals } = useMemo(() => {
    if (!sessions.length) return { segments: [], timeRange: null, categoryTotals: {} };

    // Today's date boundaries (midnight to midnight)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400000;

    // Filter to completed sessions with duration, TODAY ONLY
    const completed = sessions
      .filter(s => s.duration_ms > 0 && (s.started_at || s.startedAt))
      .map(s => ({
        ...s,
        startMs: new Date(s.started_at || s.startedAt).getTime(),
        endMs: new Date(s.ended_at || s.endedAt || s.started_at || s.startedAt).getTime(),
        durationMs: s.duration_ms,
      }))
      .filter(s => s.startMs >= todayStart && s.startMs < todayEnd)
      .sort((a, b) => a.startMs - b.startMs);

    if (!completed.length) return { segments: [], timeRange: null, categoryTotals: {} };

    const earliest = completed[0].startMs;
    const latest = Math.max(...completed.map(s => s.endMs || s.startMs + s.durationMs));
    const totalSpan = latest - earliest;

    // Calculate category totals
    const totals = {};
    completed.forEach(s => {
      const cat = s.category || 'unknown';
      totals[cat] = (totals[cat] || 0) + s.durationMs;
    });

    // Build segments with position info
    const segs = completed.map(s => {
      const left = totalSpan > 0 ? ((s.startMs - earliest) / totalSpan) * 100 : 0;
      const width = totalSpan > 0 ? (s.durationMs / totalSpan) * 100 : 100;
      return {
        ...s,
        left,
        width: Math.max(width, 0.3), // Minimum visible width
        color: CATEGORY_COLORS[s.category] || CATEGORY_COLORS.unknown,
      };
    });

    return {
      segments: segs,
      timeRange: { earliest, latest, totalSpan },
      categoryTotals: totals,
    };
  }, [sessions]);

  // Generate minute markers
  const minuteMarkers = useMemo(() => {
    if (!timeRange || timeRange.totalSpan < 60000) return [];

    const markers = [];
    const intervalMs = timeRange.totalSpan > 3600000 * 4
      ? 3600000  // hour markers for 4+ hour spans
      : timeRange.totalSpan > 3600000
        ? 1800000 // 30 min markers for 1-4 hour spans
        : timeRange.totalSpan > 1800000
          ? 600000 // 10 min markers for 30min-1hr spans
          : 300000; // 5 min markers for shorter spans

    // Round to the nearest interval
    const firstMarker = Math.ceil(timeRange.earliest / intervalMs) * intervalMs;

    for (let t = firstMarker; t < timeRange.latest; t += intervalMs) {
      const pos = ((t - timeRange.earliest) / timeRange.totalSpan) * 100;
      if (pos > 1 && pos < 99) {
        markers.push({
          pos,
          label: new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        });
      }
    }

    return markers;
  }, [timeRange]);

  const handleMouseMove = useCallback((e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Don't render if companion is not connected and no cached data
  if (!connected && sessions.length === 0) {
    return null;
  }

  // No sessions yet (companion connected but no activity)
  if (sessions.length === 0 || segments.length === 0) {
    if (!connected) return null;
    return (
      <div style={{
        padding: compact ? '8px' : '12px 16px',
        marginBottom: compact ? '8px' : '12px',
        borderRadius: 'var(--radius-md, 8px)',
        background: 'var(--color-surface, rgba(255,255,255,0.03))',
        border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        fontSize: '12px',
        color: 'var(--color-text-muted, #5a6270)',
        textAlign: 'center',
      }}>
        🖥️ Desktop companion connected — waiting for activity...
      </div>
    );
  }

  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      marginBottom: compact ? '8px' : '12px',
      borderRadius: 'var(--radius-md, 8px)',
      background: 'var(--color-surface, rgba(255,255,255,0.03))',
      border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
      padding: compact ? '8px' : '12px 16px',
      backdropFilter: 'var(--surface-blur, blur(12px))',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-text-muted, #5a6270)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          🖥️ Desktop Activity — Today
          <span style={{
            fontSize: '9px',
            opacity: 0.7,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 'normal',
          }}>
            {timeRange && (
              <>
                {formatTimeOfDay(new Date(timeRange.earliest).toISOString())}
                {' → '}
                {formatTimeOfDay(new Date(timeRange.latest).toISOString())}
              </>
            )}
          </span>
        </div>
        <span style={{
          fontSize: '10px',
          color: connected ? '#10ac84' : 'var(--color-text-muted, #5a6270)',
          fontWeight: 500,
        }}>
          {segments.length} sessions
        </span>
      </div>

      {/* Timeline Bar */}
      <div
        ref={barRef}
        style={{
          position: 'relative',
          height: compact ? '16px' : '24px',
          borderRadius: '4px',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          cursor: 'crosshair',
        }}
        onMouseMove={handleMouseMove}
      >
        {segments.map((seg, i) => (
          <div
            key={seg.id || i}
            onMouseEnter={() => setHoveredSession(seg)}
            onMouseLeave={() => setHoveredSession(null)}
            style={{
              position: 'absolute',
              left: `${seg.left}%`,
              width: `${seg.width}%`,
              top: 0,
              bottom: 0,
              background: seg.color,
              opacity: hoveredSession === seg ? 1 : 0.75,
              transition: 'opacity 0.15s ease',
              borderRight: seg.width > 0.5 ? '1px solid rgba(0,0,0,0.2)' : 'none',
            }}
          />
        ))}

        {/* Minute markers */}
        {!compact && minuteMarkers.map((marker, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${marker.pos}%`,
              top: 0,
              bottom: 0,
              width: '1px',
              background: 'rgba(255,255,255,0.15)',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      {/* Time markers below the bar */}
      {!compact && minuteMarkers.length > 0 && (
        <div style={{ position: 'relative', height: '14px', marginTop: '2px' }}>
          {minuteMarkers.map((marker, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${marker.pos}%`,
                transform: 'translateX(-50%)',
                fontSize: '8px',
                color: 'var(--color-text-muted, #5a6270)',
                opacity: 0.6,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {marker.label}
            </span>
          ))}
        </div>
      )}

      {/* Hover Tooltip — portaled to body to escape parent backdrop-filter containing block */}
      {hoveredSession && ReactDOM.createPortal(
        (() => {
          const barRect = barRef.current?.getBoundingClientRect();
          const tipTop = barRect ? barRect.top - 80 : tooltipPos.y - 80;
          return (
            <div style={{
              position: 'fixed',
              left: tooltipPos.x + 12,
              top: Math.max(8, tipTop),
              background: 'rgba(20, 22, 28, 0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '11px',
              color: '#e8eaf0',
              pointerEvents: 'none',
              zIndex: 2147483647,
              maxWidth: '280px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: hoveredSession.color,
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600 }}>
                  {CATEGORY_EMOJI[hoveredSession.category] || '❓'} {hoveredSession.app_display_name || hoveredSession.appDisplayName || hoveredSession.app_name}
                </span>
              </div>
              <div style={{
                fontSize: '10px',
                color: '#8b93a1',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: '4px',
              }}>
                {hoveredSession.window_title || hoveredSession.windowTitle}
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#a0a8b8' }}>
                <span style={{ fontWeight: 600, color: hoveredSession.color }}>
                  {formatDuration(hoveredSession.durationMs || hoveredSession.duration_ms)}
                </span>
                <span>{formatTimeOfDay(hoveredSession.started_at || hoveredSession.startedAt)}</span>
                {hoveredSession.matched_focus_id && (
                  <span style={{ color: '#10ac84' }}>🎯 Focus matched</span>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Legend — category totals */}
      {!compact && (
        <div style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          marginTop: '8px',
          paddingTop: '6px',
          borderTop: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}>
          {sortedCategories.map(([cat, totalMs]) => (
            <div key={cat} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              color: 'var(--color-text-muted, #5a6270)',
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: CATEGORY_COLORS[cat] || CATEGORY_COLORS.unknown,
                flexShrink: 0,
              }} />
              <span>{CATEGORY_EMOJI[cat] || '❓'}</span>
              <span style={{ textTransform: 'capitalize' }}>{cat}</span>
              <span style={{
                fontWeight: 600,
                color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.unknown,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatDuration(totalMs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
