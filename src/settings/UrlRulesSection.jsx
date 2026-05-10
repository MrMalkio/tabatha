import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';
import { sendMessage } from '../hooks/useChromeStorage';

// ── Stub marker styles ──
const STUB_STYLE = { color: '#ffab40', fontStyle: 'italic', opacity: 0.7 };
const STUB_BADGE = { fontSize: '8px', padding: '1px 5px', borderRadius: '3px', background: '#ffab4022', color: '#ffab40', fontWeight: 700, marginLeft: '6px', letterSpacing: '0.05em' };

// Shared styles
const fieldRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' };
const fieldLabel = { fontSize: '12px', fontWeight: 500 };
const inputStyle = { background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '5px 10px', fontSize: '12px', width: '100%' };
const btnSmall = { background: 'var(--color-accent-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#000', padding: '4px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' };
const btnDanger = { ...btnSmall, background: '#ef535022', color: '#ef5350' };

/**
 * URL Rules Settings Section
 * - Domain groups from browsing data
 * - URL pattern rules with default intents
 * - Link variations per domain
 * - Intent change history log
 */
export default function UrlRulesSection({ urlRules, setUrlRules, intentChangeLog, skippedDomains }) {
  const [tab, setTab] = useState('rules'); // 'rules' | 'domains' | 'changelog'
  const [tabs, setTabs] = useState({});
  const [newRule, setNewRule] = useState({ pattern: '', intent: '', context: '' });
  const [editingRule, setEditingRule] = useState(null);

  // Fetch all tab data to compute domain groups
  useEffect(() => {
    sendMessage('GET_ALL_TABS').then(res => {
      if (res?.tabs) setTabs(res.tabs);
    }).catch(() => {});
  }, []);

  // ── Computed: domain groups with tab counts and link variations ──
  const domainGroups = useMemo(() => {
    const groups = {};
    for (const [tabId, tabData] of Object.entries(tabs)) {
      if (!tabData?.url) continue;
      try {
        const u = new URL(tabData.url);
        const domain = u.hostname.replace(/^www\./, '');
        if (!groups[domain]) {
          groups[domain] = {
            domain,
            tabs: [],
            paths: new Set(),
            intents: new Set(),
            contexts: new Set(),
            lastSeen: null,
          };
        }
        groups[domain].tabs.push({ tabId, ...tabData });
        groups[domain].paths.add(u.pathname);
        if (tabData.intent) groups[domain].intents.add(tabData.intent);
        if (tabData.context) groups[domain].contexts.add(tabData.context);
        const ts = tabData.lastActive || tabData.createdAt;
        if (ts && (!groups[domain].lastSeen || ts > groups[domain].lastSeen)) {
          groups[domain].lastSeen = ts;
        }
      } catch (e) { /* skip invalid URLs */ }
    }
    // Convert Sets to arrays and sort by tab count
    return Object.values(groups)
      .map(g => ({ ...g, paths: [...g.paths], intents: [...g.intents], contexts: [...g.contexts] }))
      .sort((a, b) => b.tabs.length - a.tabs.length);
  }, [tabs]);

  // ── Match url rules to domains ──
  const matchedRules = useMemo(() => {
    const matched = {};
    for (const rule of urlRules) {
      for (const group of domainGroups) {
        if (group.domain.includes(rule.pattern) || rule.pattern.includes(group.domain)) {
          if (!matched[group.domain]) matched[group.domain] = [];
          matched[group.domain].push(rule);
        }
      }
    }
    return matched;
  }, [urlRules, domainGroups]);

  // ── Add a new URL rule ──
  const addRule = () => {
    if (!newRule.pattern.trim()) return;
    const rule = {
      id: Date.now().toString(),
      pattern: newRule.pattern.trim(),
      defaultIntent: newRule.intent.trim() || null,
      defaultContext: newRule.context.trim() || null,
      autoApply: true,
      createdAt: new Date().toISOString(),
    };
    setUrlRules(prev => [...prev, rule]);
    setNewRule({ pattern: '', intent: '', context: '' });
  };

  const removeRule = (ruleId) => {
    setUrlRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const updateRule = (ruleId, updates) => {
    setUrlRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...updates } : r));
    setEditingRule(null);
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>🔗 URL Rules</h2>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Manage URL patterns, default intents per domain, and see how intents change over time.
      </p>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
        {[
          { id: 'rules', label: '📐 URL Rules' },
          { id: 'domains', label: '🌐 Domain Groups' },
          { id: 'changelog', label: '📋 Intent Changes' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? 'var(--color-accent-primary)' : 'var(--color-surface)',
            color: tab === t.id ? '#000' : 'var(--color-text-primary)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '5px 14px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'rules' && (
            <RulesTab
              urlRules={urlRules}
              newRule={newRule}
              setNewRule={setNewRule}
              addRule={addRule}
              removeRule={removeRule}
              updateRule={updateRule}
              editingRule={editingRule}
              setEditingRule={setEditingRule}
            />
          )}
          {tab === 'domains' && (
            <DomainsTab
              domainGroups={domainGroups}
              matchedRules={matchedRules}
              skippedDomains={skippedDomains}
            />
          )}
          {tab === 'changelog' && (
            <ChangelogTab intentChangeLog={intentChangeLog} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════
// Rules Tab — Add/Edit URL pattern rules
// ═══════════════════════════════════════
function RulesTab({ urlRules, newRule, setNewRule, addRule, removeRule, updateRule, editingRule, setEditingRule }) {
  return (
    <div>
      {/* Add New Rule */}
      <GlassCard style={{ padding: '12px 16px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>Add URL Rule</div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <Tooltip text="Domain or URL pattern to match. Examples: github.com, *.asana.com/1/*, docs.google.com">
            <input
              style={{ ...inputStyle, flex: 2 }}
              placeholder="URL pattern (e.g. github.com)"
              value={newRule.pattern}
              onChange={e => setNewRule(p => ({ ...p, pattern: e.target.value }))}
            />
          </Tooltip>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <Tooltip text="Intent automatically assigned when visiting this URL pattern">
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Default intent (optional)"
              value={newRule.intent}
              onChange={e => setNewRule(p => ({ ...p, intent: e.target.value }))}
            />
          </Tooltip>
          <Tooltip text="Context label assigned when visiting this URL">
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Default context (optional)"
              value={newRule.context}
              onChange={e => setNewRule(p => ({ ...p, context: e.target.value }))}
            />
          </Tooltip>
          <button onClick={addRule} style={btnSmall}>+ Add</button>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
          When a tab matches this pattern, Tabatha auto-assigns the intent/context. Supports wildcards: <code>*</code>
        </div>
      </GlassCard>

      {/* Existing Rules */}
      {urlRules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
          No URL rules yet. Add a pattern above to auto-assign intents.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {urlRules.map(rule => (
            <GlassCard key={rule.id} style={{ padding: '10px 14px' }}>
              {editingRule === rule.id ? (
                <EditRuleForm rule={rule} onSave={updateRule} onCancel={() => setEditingRule(null)} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' }}>{rule.pattern}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {rule.defaultIntent && <span>Intent: <strong style={{ color: 'var(--color-accent-primary)' }}>{rule.defaultIntent}</strong> · </span>}
                      {rule.defaultContext && <span>Context: <strong>{rule.defaultContext}</strong> · </span>}
                      {rule.autoApply ? '✅ Auto-apply' : '⏸ Manual'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setEditingRule(rule.id)} style={{ ...btnSmall, background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>✏️</button>
                    <button onClick={() => removeRule(rule.id)} style={btnDanger}>🗑</button>
                  </div>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit form for existing rule ──
function EditRuleForm({ rule, onSave, onCancel }) {
  const [pattern, setPattern] = useState(rule.pattern);
  const [intent, setIntent] = useState(rule.defaultIntent || '');
  const [context, setContext] = useState(rule.defaultContext || '');
  const [autoApply, setAutoApply] = useState(rule.autoApply !== false);

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <input style={{ ...inputStyle, flex: 2 }} value={pattern} onChange={e => setPattern(e.target.value)} placeholder="Pattern" />
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <input style={{ ...inputStyle, flex: 1 }} value={intent} onChange={e => setIntent(e.target.value)} placeholder="Default intent" />
        <input style={{ ...inputStyle, flex: 1 }} value={context} onChange={e => setContext(e.target.value)} placeholder="Default context" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoApply} onChange={e => setAutoApply(e.target.checked)} />
          Auto-apply on match
        </label>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={onCancel} style={{ ...btnSmall, background: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button onClick={() => onSave(rule.id, { pattern, defaultIntent: intent || null, defaultContext: context || null, autoApply })} style={btnSmall}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Domains Tab — Browse domain groups
// ═══════════════════════════════════════
function DomainsTab({ domainGroups, matchedRules, skippedDomains }) {
  const [expanded, setExpanded] = useState(null);

  if (domainGroups.length === 0) {
    return <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '12px' }}>No tabs tracked yet. Browse some sites first.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
        Showing {domainGroups.length} domains from your current browsing session. Click to expand link variations.
      </div>
      {domainGroups.map(group => {
        const isExpanded = expanded === group.domain;
        const isSkipped = (skippedDomains || []).includes(group.domain);
        const rules = matchedRules[group.domain] || [];

        return (
          <GlassCard key={group.domain} style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : group.domain)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>🌐</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' }}>{group.domain}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                    {group.tabs.length} tab{group.tabs.length !== 1 ? 's' : ''} · {group.paths.length} path{group.paths.length !== 1 ? 's' : ''}
                    {isSkipped && <span style={{ color: '#ffa726', marginLeft: '6px' }}>⏭ skipped</span>}
                    {rules.length > 0 && <span style={{ color: 'var(--color-accent-primary)', marginLeft: '6px' }}>📐 {rules.length} rule{rules.length > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {group.intents.length > 0 && (
                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                    {group.intents.slice(0, 3).map((intent, i) => (
                      <span key={i} style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '8px', background: 'var(--color-accent-primary)22', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{intent}</span>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
              </div>
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                  <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '8px', paddingTop: '8px' }}>
                    {/* Link Variations */}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', letterSpacing: '0.08em' }}>Link Variations ({group.paths.length})</div>
                      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                        {group.paths.slice(0, 20).map((path, i) => (
                          <div key={i} style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--color-text-muted)', padding: '1px 0', borderBottom: '1px solid var(--color-border)' }}>
                            {path}
                          </div>
                        ))}
                        {group.paths.length > 20 && (
                          <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', padding: '4px 0' }}>...and {group.paths.length - 20} more</div>
                        )}
                      </div>
                    </div>

                    {/* Intents used on this domain */}
                    {group.intents.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', letterSpacing: '0.08em' }}>Intents Applied</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {group.intents.map((intent, i) => (
                            <span key={i} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'var(--color-accent-primary)11', border: '1px solid var(--color-accent-primary)44', color: 'var(--color-accent-primary)', fontWeight: 500 }}>{intent}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contexts */}
                    {group.contexts.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', letterSpacing: '0.08em' }}>Contexts</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {group.contexts.map((ctx, i) => (
                            <span key={i} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontWeight: 500 }}>{ctx}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Matched rules */}
                    {rules.length > 0 && (
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px', letterSpacing: '0.08em' }}>Active Rules</div>
                        {rules.map(r => (
                          <div key={r.id} style={{ fontSize: '10px', padding: '3px 8px', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', marginBottom: '2px' }}>
                            📐 <span style={{ fontFamily: 'monospace' }}>{r.pattern}</span>
                            {r.defaultIntent && <span> → <strong style={{ color: 'var(--color-accent-primary)' }}>{r.defaultIntent}</strong></span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stub: Quick actions */}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
                      <button disabled style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', padding: '3px 8px', fontSize: '10px', cursor: 'not-allowed', opacity: 0.6 }}>
                        + Create Rule <span style={STUB_BADGE}>SOON</span>
                      </button>
                      <button disabled style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', padding: '3px 8px', fontSize: '10px', cursor: 'not-allowed', opacity: 0.6 }}>
                        🚫 Block Domain <span style={STUB_BADGE}>SOON</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// Intent Change Log Tab
// ═══════════════════════════════════════
function ChangelogTab({ intentChangeLog }) {
  if (!intentChangeLog || intentChangeLog.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '30px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>No intent changes recorded yet.</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '10px', marginTop: '4px' }}>Changes will appear here when you set or modify tab intents.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
        Showing the last {Math.min(intentChangeLog.length, 100)} intent changes.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '500px', overflowY: 'auto' }}>
        {intentChangeLog.slice(0, 100).map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', padding: '5px 10px', background: i % 2 === 0 ? 'var(--color-surface)' : 'transparent', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                {new Date(entry.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                {entry.domain || entry.url || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {entry.oldIntent && (
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '6px', background: '#ef535022', color: '#ef5350', textDecoration: 'line-through' }}>{entry.oldIntent}</span>
              )}
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>→</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '6px', background: 'var(--color-accent-primary)22', color: 'var(--color-accent-primary)', fontWeight: 600 }}>{entry.newIntent || '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
