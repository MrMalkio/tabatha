import React from 'react';

// ============================================================
// Tabatha — shared changelog renderer (FIX-11).
// Renders the parsed changelog.json releases. Used by both the newtab
// WhatsNewModal and Settings → About changelog view so the two surfaces stay
// visually consistent. Intentionally a lightweight inline-markdown renderer
// (bold + `code` + bullet lists) — no markdown dependency for an MV3 bundle.
// ============================================================

const SECTION_ICON = {
  Added: '✨',
  Changed: '🔧',
  Fixed: '🐛',
  Removed: '🗑️',
  Deprecated: '⚠️',
  Security: '🔒',
  Migration: '🧬',
};

// Very small inline formatter: **bold**, `code`. Returns an array of React
// nodes. No HTML injection — everything is plain text split on markers.
function renderInline(text, keyPrefix) {
  const nodes = [];
  // Split on **bold** and `code` while keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.9em', background: 'var(--color-surface)', padding: '1px 4px', borderRadius: '3px' }}
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>);
    }
  });
  return nodes;
}

function SectionBody({ body, keyPrefix }) {
  const lines = body.split('\n');
  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`${keyPrefix}-ul-${out.length}`} style={{ margin: '4px 0 8px', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
              {renderInline(b, `${keyPrefix}-li-${i}`)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(
        <p key={`${keyPrefix}-p-${i}`} style={{ fontSize: '12px', lineHeight: 1.5, margin: '4px 0', color: 'var(--color-text-primary)' }}>
          {renderInline(line, `${keyPrefix}-p-${i}`)}
        </p>
      );
    }
  });
  flush();
  return <>{out}</>;
}

// Render a single release block.
export function ReleaseEntry({ release }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>v{release.version}</span>
        {release.date && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{release.date}</span>
        )}
      </div>
      {release.title && (
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-text-primary)' }}>{release.title}</div>
      )}
      {release.intro && (
        <div style={{ marginBottom: '8px', opacity: 0.9 }}>
          <SectionBody body={release.intro} keyPrefix={`${release.version}-intro`} />
        </div>
      )}
      {(release.sections || []).map((section, si) => {
        // Pull a leading emoji-free bucket name for the icon lookup.
        const bucket = Object.keys(SECTION_ICON).find((k) => section.label.includes(k));
        return (
          <div key={si} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '2px' }}>
              {bucket ? `${SECTION_ICON[bucket]} ` : ''}{section.label}
            </div>
            <SectionBody body={section.body} keyPrefix={`${release.version}-${si}`} />
          </div>
        );
      })}
    </div>
  );
}

// Render a list of releases (newest first — the MD order is already newest
// first). `limit` caps how many are shown.
export function ChangelogView({ releases, limit }) {
  const list = Array.isArray(releases) ? releases : [];
  const shown = typeof limit === 'number' ? list.slice(0, limit) : list;
  if (shown.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No changelog entries available.</div>;
  }
  return (
    <div>
      {shown.map((r, i) => (
        <div key={r.version || i}>
          <ReleaseEntry release={r} />
          {i < shown.length - 1 && <div style={{ height: '1px', background: 'var(--color-border)', margin: '0 0 16px', opacity: 0.5 }} />}
        </div>
      ))}
    </div>
  );
}
