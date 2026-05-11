import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../components/ui/GlassCard';
import { Tooltip } from '../components/ui/Tooltip';

/**
 * InitiativesPanel — Tree view for Operations → Initiatives → Clients → Projects → Tasks.
 * Shows the full org hierarchy with drill-down, inline CRUD, and cascade counts.
 */
export function InitiativesPanel({ orgData }) {
  const [view, setView] = useState('tree'); // 'tree' | 'operations' | 'initiatives'
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [createMode, setCreateMode] = useState(null); // null | 'operation' | 'initiative'
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState('');

  const { org, operationList, initiativeList, clientList, projectList, taskList,
    addOperation, addInitiative, addClient, addProject, archiveEntity, updateEntity } = orgData;

  const toggleNode = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    if (createMode === 'operation') {
      await addOperation(createName.trim());
    } else if (createMode === 'initiative') {
      await addInitiative(createName.trim(), createParent || null);
    }
    setCreateName('');
    setCreateParent('');
    setCreateMode(null);
  };

  // Get children counts for display
  const getInitiativesForOp = (opId) => initiativeList.filter(i => i.operationId === opId);
  const getClientsForInit = (initId) => clientList.filter(c => c.initiativeId === initId);
  const getUnassignedClients = () => clientList.filter(c => !c.initiativeId);
  const getProjectsForClient = (clientId) => projectList.filter(p => p.clientId === clientId);
  const getTasksForProject = (projectId) => taskList.filter(t => t.projectId === projectId);
  const getUnassignedProjects = () => projectList.filter(p => !p.clientId);

  const btnStyle = (active) => ({
    background: active ? 'var(--color-accent-primary)' : 'transparent',
    color: active ? '#000' : 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', borderRadius: '4px',
    padding: '2px 8px', fontSize: '10px', cursor: 'pointer', fontWeight: 600,
  });

  const actionBtn = {
    background: 'transparent', border: '1px solid var(--color-border)',
    color: 'var(--color-text-muted)', borderRadius: '4px',
    padding: '1px 6px', fontSize: '10px', cursor: 'pointer',
  };

  const indent = (level) => ({ paddingLeft: `${level * 16 + 8}px` });

  // ── Render a task row ──
  const TaskRow = ({ task, level }) => (
    <div style={{ ...indent(level), display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', fontSize: '11px', borderBottom: '1px solid var(--color-border)', opacity: task.status === 'complete' ? 0.5 : 1 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>✏️</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'complete' ? 'line-through' : 'none' }}>{task.name}</span>
      <span style={{ fontSize: '8px', color: task.status === 'complete' ? '#66bb6a' : 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{task.status}</span>
    </div>
  );

  // ── Render a project row with expandable tasks ──
  const ProjectRow = ({ project, level }) => {
    const tasks = getTasksForProject(project.id);
    const isExpanded = expandedNodes.has(project.id);
    return (
      <>
        <div onClick={() => toggleNode(project.id)} style={{ ...indent(level), display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', width: '12px', textAlign: 'center' }}>{tasks.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}</span>
          <span style={{ color: 'var(--color-accent-secondary)' }}>📁</span>
          <span style={{ flex: 1, fontWeight: 500 }}>{project.name}</span>
          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{tasks.length}t</span>
        </div>
        {isExpanded && tasks.map(t => <TaskRow key={t.id} task={t} level={level + 1} />)}
      </>
    );
  };

  // ── Render a client row with expandable projects ──
  const ClientRow = ({ client, level }) => {
    const projects = getProjectsForClient(client.id);
    const isExpanded = expandedNodes.has(client.id);
    return (
      <>
        <div onClick={() => toggleNode(client.id)} style={{ ...indent(level), display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', width: '12px', textAlign: 'center' }}>{projects.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}</span>
          <span>👤</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{client.name}</span>
          <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{projects.length}p</span>
        </div>
        {isExpanded && projects.map(p => <ProjectRow key={p.id} project={p} level={level + 1} />)}
      </>
    );
  };

  // ── Tree View ──
  const TreeView = () => (
    <div>
      {/* Operations */}
      {operationList.length === 0 && initiativeList.length === 0 ? (
        <GlassCard style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏛️</div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', margin: '0 0 8px' }}>
            No operations yet. Create one to organize your work hierarchy.
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '10px', margin: 0, lineHeight: 1.5 }}>
            Operations → Initiatives → Clients → Projects → Tasks
          </p>
        </GlassCard>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {operationList.map(op => {
            const inits = getInitiativesForOp(op.id);
            const isExpanded = expandedNodes.has(op.id);
            return (
              <div key={op.id}>
                {/* Operation row */}
                <div onClick={() => toggleNode(op.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', width: '12px', textAlign: 'center' }}>{isExpanded ? '▾' : '▸'}</span>
                  <span>🏢</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 700 }}>{op.name}</span>
                  <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', background: 'var(--color-accent-primary)15', padding: '1px 6px', borderRadius: '3px' }}>OP · {inits.length} init</span>
                  <Tooltip text="Archive operation">
                    <button onClick={(e) => { e.stopPropagation(); archiveEntity('operations', op.id); }} style={actionBtn}>🗑</button>
                  </Tooltip>
                </div>
                {/* Initiatives under this operation */}
                {isExpanded && inits.map(init => {
                  const clients = getClientsForInit(init.id);
                  const initExpanded = expandedNodes.has(init.id);
                  return (
                    <div key={init.id}>
                      <div onClick={() => toggleNode(init.id)} style={{ ...indent(1), display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', background: 'rgba(var(--color-accent-primary-rgb, 0,0,0), 0.03)' }}>
                        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', width: '12px', textAlign: 'center' }}>{clients.length > 0 ? (initExpanded ? '▾' : '▸') : '·'}</span>
                        <span>🎯</span>
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{init.name}</span>
                        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{clients.length}c</span>
                        <Tooltip text="Archive initiative">
                          <button onClick={(e) => { e.stopPropagation(); archiveEntity('initiatives', init.id); }} style={actionBtn}>🗑</button>
                        </Tooltip>
                      </div>
                      {initExpanded && clients.map(c => <ClientRow key={c.id} client={c} level={2} />)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Unassigned clients (no initiative) */}
          {getUnassignedClients().length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                📋 Unassigned Clients ({getUnassignedClients().length})
              </div>
              {getUnassignedClients().map(c => <ClientRow key={c.id} client={c} level={1} />)}
            </div>
          )}

          {/* Unassigned projects (no client) */}
          {getUnassignedProjects().length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                📂 Unassigned Projects ({getUnassignedProjects().length})
              </div>
              {getUnassignedProjects().map(p => <ProjectRow key={p.id} project={p} level={1} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <motion.div key="initiatives" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Tooltip text="Add Operation">
            <button onClick={() => { setCreateMode(createMode === 'operation' ? null : 'operation'); setCreateName(''); }} style={btnStyle(createMode === 'operation')}>+ Operation</button>
          </Tooltip>
          <Tooltip text="Add Initiative">
            <button onClick={() => { setCreateMode(createMode === 'initiative' ? null : 'initiative'); setCreateName(''); }} style={btnStyle(createMode === 'initiative')}>+ Initiative</button>
          </Tooltip>
        </div>
        {/* Stats */}
        <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', display: 'flex', gap: '8px' }}>
          <span>🏢 {operationList.length}</span>
          <span>🎯 {initiativeList.length}</span>
          <span>👤 {clientList.length}</span>
          <span>📁 {projectList.length}</span>
          <span>✏️ {taskList.length}</span>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {createMode && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '10px' }}>
            <GlassCard style={{ padding: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                New {createMode}
              </div>
              <input type="text" placeholder={`${createMode} name...`} value={createName} onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
                style={{ width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '5px 8px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
              />
              {createMode === 'initiative' && operationList.length > 0 && (
                <select value={createParent} onChange={e => setCreateParent(e.target.value)}
                  style={{ width: '100%', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-text-primary)', fontSize: '11px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}>
                  <option value="">No parent operation</option>
                  {operationList.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                </select>
              )}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button onClick={() => setCreateMode(null)} style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleCreate} disabled={!createName.trim()} style={{ background: 'var(--color-accent-primary)', border: 'none', color: '#000', borderRadius: '4px', padding: '3px 10px', fontSize: '10px', cursor: 'pointer', fontWeight: 600, opacity: createName.trim() ? 1 : 0.5 }}>Create</button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tree */}
      <TreeView />
    </motion.div>
  );
}
