import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/global.css';
import UnifiedTimeline from '../components/UnifiedTimeline';

function ActivityEditor() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [trimFrom, setTrimFrom] = useState('12:00');
  const [trimTo, setTrimTo] = useState('13:00');
  const [confirmTrim, setConfirmTrim] = useState(false);
  const [companionSessions, setCompanionSessions] = useState([]);
  const [flashMessage, setFlashMessage] = useState('');

  // Load companionRecentSessions from storage
  useEffect(() => {
    chrome.storage.local.get(['companionRecentSessions'], (result) => {
      setCompanionSessions(result.companionRecentSessions || []);
    });

    const listener = (changes) => {
      if (changes.companionRecentSessions) {
        setCompanionSessions(changes.companionRecentSessions.newValue || []);
      }
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  const flash = (msg) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(''), 5000);
  };

  const handleTrim = async () => {
    if (!confirmTrim) {
      setConfirmTrim(true);
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const [fh, fm] = trimFrom.split(':').map(Number);
    const [th, tm] = trimTo.split(':').map(Number);

    const rangeStart = new Date(year, month - 1, day, fh, fm).getTime();
    const rangeEnd = new Date(year, month - 1, day, th, tm).getTime();

    if (rangeEnd <= rangeStart) {
      flash('❌ Error: End time must be after Start time.');
      setConfirmTrim(false);
      return;
    }

    const updated = companionSessions.filter(s => {
      const ts = new Date(s.started_at || s.startedAt).getTime();
      return !(ts >= rangeStart && ts < rangeEnd);
    });

    const removed = companionSessions.length - updated.length;

    await chrome.storage.local.set({ companionRecentSessions: updated });
    setCompanionSessions(updated);
    setConfirmTrim(false);
    flash(`✓ Successfully deleted ${removed} activity segment(s) between ${trimFrom} – ${trimTo} on ${selectedDate}.`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg-base, #0a0e17)',
      color: 'var(--color-text-primary, #ffffff)',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      padding: '40px 24px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Header Banner */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
        paddingBottom: '20px',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            background: 'linear-gradient(135deg, var(--color-accent-primary, #a3b59a) 0%, #ffffff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            letterSpacing: '-0.02em'
          }}>
            🖥️ Context Activity Editor
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--color-text-muted, #8a92a3)',
            marginTop: '4px',
            margin: 0
          }}>
            Filter, inspect, and surgically trim desktop context sync logs.
          </p>
        </div>
        <button
          onClick={() => window.close()}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--color-text-muted, #8a92a3)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          ✕ Close Editor
        </button>
      </header>

      {flashMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md, 8px)',
          background: flashMessage.includes('❌') ? 'rgba(239, 83, 80, 0.15)' : 'rgba(52, 168, 83, 0.15)',
          border: `1px solid ${flashMessage.includes('❌') ? '#ef5350' : '#34A853'}`,
          color: flashMessage.includes('❌') ? '#ef5350' : '#81c784',
          fontSize: '13px',
          fontWeight: 500,
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <span>{flashMessage}</span>
          <button onClick={() => setFlashMessage('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}>✕</button>
        </div>
      )}

      {/* Main Split Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: '32px',
        alignItems: 'start'
      }}>
        {/* Controls Sidebar */}
        <aside style={{
          background: 'var(--color-surface, rgba(255,255,255,0.02))',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '24px',
          backdropFilter: 'blur(16px)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px 0' }}>⚙️ Controls</h2>

          {/* Date Picker */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-muted, #8a92a3)',
              fontWeight: 600,
              marginBottom: '6px'
            }}>
              Select Target Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setConfirmTrim(false);
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
                background: 'rgba(0,0,0,0.2)',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Trim Section */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{
              fontSize: '13px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent-primary, #a3b59a)',
              fontWeight: 700,
              margin: '0 0 16px 0'
            }}>
              ✂️ Range Trim Tool
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--color-text-muted, #8a92a3)', display: 'block', marginBottom: '4px' }}>From</label>
                <input
                  type="time"
                  value={trimFrom}
                  onChange={(e) => {
                    setTrimFrom(e.target.value);
                    setConfirmTrim(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--color-text-muted, #8a92a3)', display: 'block', marginBottom: '4px' }}>To</label>
                <input
                  type="time"
                  value={trimTo}
                  onChange={(e) => {
                    setTrimTo(e.target.value);
                    setConfirmTrim(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleTrim}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md, 8px)',
                background: confirmTrim ? '#ef5350' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${confirmTrim ? '#ef5350' : 'rgba(255,255,255,0.1)'}`,
                color: confirmTrim ? '#fff' : 'var(--color-text-primary, #ffffff)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: confirmTrim ? '0 0 12px rgba(239, 83, 80, 0.3)' : 'none'
              }}
            >
              {confirmTrim ? '⚠️ Click to Confirm Delete' : 'Confirm Delete Range'}
            </button>
            
            {confirmTrim && (
              <button
                onClick={() => setConfirmTrim(false)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted, #8a92a3)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  marginTop: '8px',
                  textDecoration: 'underline'
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </aside>

        {/* Timeline Visualizer and Future Stubs */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Interactive Timeline Visualizer */}
          <section style={{
            background: 'var(--color-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '24px',
            backdropFilter: 'blur(16px)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📊 Interactive Timeline Map
            </h2>
            <UnifiedTimeline compact={false} selectedDate={selectedDate} />
          </section>

          {/* Level 2: Retroactive Log Editing Stub */}
          <section style={{
            background: 'rgba(255,255,255,0.01)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '32px',
            textAlign: 'center',
            opacity: 0.8
          }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>✏️</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
              Level 2 Retroactive Log Editing
            </h3>
            <p style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #8a92a3)',
              maxWidth: '500px',
              margin: '0 auto 16px'
            }}>
              Coming soon: Directly drag-and-drop handles, split/merge blocks, and inject custom activity logs with System/Human error classifications.
            </p>
            <span style={{
              display: 'inline-block',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--color-text-muted)',
              padding: '4px 10px',
              borderRadius: '20px'
            }}>
              🛠️ Under Development — Phase 2 Block
            </span>
          </section>

          {/* Level 3: Review Queue Stub */}
          <section style={{
            background: 'rgba(255,255,255,0.01)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '32px',
            textAlign: 'center',
            opacity: 0.8
          }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
              Retroactive Review & Approval Queue
            </h3>
            <p style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #8a92a3)',
              maxWidth: '500px',
              margin: '0 auto 16px'
            }}>
              Coming soon: Admin role-gating pipeline. Retroactive revisions must go through a structured approval flow before updating historical sync indices.
            </p>
            <span style={{
              display: 'inline-block',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--color-text-muted)',
              padding: '4px 10px',
              borderRadius: '20px'
            }}>
              👑 Enterprise Compliance Block
            </span>
          </section>
        </main>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<ActivityEditor />);
