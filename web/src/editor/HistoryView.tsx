import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { n8n } from '../api/client';
import { qk, useHistory, useVersion, useVersionAuthors } from '../api/hooks';
import { ActivityFeed } from '../components/ActivityFeed';
import { Avatar, useCanEdit } from '../lib/session';
import type { VersionEntry, Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { Spinner, errMsg, useToast } from '../components/ui';
import { diffWorkflows, toDraft, type Draft } from '../lib/workflow';
import { Canvas } from './Canvas';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Version history: a timeline of saves, a preview with what changed, restore and publish. */
export function HistoryView({ wf, draft, onRestore }: { wf: Workflow; draft: Draft; onRestore: (d: Draft) => void }) {
  const hist = useHistory(wf.id);
  const [sel, setSel] = useState<string | null>(null);
  const version = useVersion(wf.id, sel);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'versions' | 'activity'>('versions');
  const authors = useVersionAuthors(wf.id).data ?? {};
  const canEdit = useCanEdit();
  const items = useMemo(() => hist.data?.pages.flatMap((p) => p.data) ?? [], [hist.data]);

  const groups = useMemo(() => {
    const m = new Map<string, VersionEntry[]>();
    for (const v of items) { const k = dayLabel(v.createdAt); if (!m.has(k)) m.set(k, []); m.get(k)!.push(v); }
    return [...m.entries()];
  }, [items]);

  const diff = useMemo(() => (version.data ? diffWorkflows(version.data, draft) : null), [version.data, draft]);
  // Only nodes present in the old version can be drawn on it: changed ones, and ones the editor no longer has.
  const marks = useMemo(() => {
    if (!diff) return undefined;
    const m = new Map<string, 'changed' | 'removed'>();
    diff.changed.forEach((n) => m.set(n, 'changed'));
    diff.removed.forEach((n) => m.set(n, 'removed'));
    return m;
  }, [diff]);
  const preview = useMemo(() => (version.data ? toDraft({ name: version.data.name ?? '', nodes: version.data.nodes, connections: version.data.connections, settings: {} }) : null), [version.data]);

  async function publish(versionId: string) {
    setBusy(true);
    try {
      await n8n.post(`/workflows/${wf.id}/publish`, { versionId });
      toast('Published. Triggers now run this version.', 'ok');
      await qc.invalidateQueries({ queryKey: qk.workflow(wf.id) });
      await qc.invalidateQueries({ queryKey: qk.workflows });
    } catch (e) {
      toast(`Couldn't publish: ${errMsg(e)}`, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const same = diff && diff.added.length + diff.removed.length + diff.changed.length === 0 && !diff.connectionsChanged;

  return (
    <div className="editor-body">
      <div className="side-list" aria-label="Versions">
        <div className="list-intro">
          <div className="seg" role="tablist" aria-label="History view" style={{ marginBottom: 8 }}>
            <button type="button" role="tab" aria-selected={mode === 'versions'} onClick={() => setMode('versions')}>Versions</button>
            <button type="button" role="tab" aria-selected={mode === 'activity'} onClick={() => setMode('activity')}>Activity</button>
          </div>
          <p className="small muted">{mode === 'versions' ? 'Each save keeps a version. The published one is what triggers run.' : 'Everything people did to this workflow in HappyN8.'}</p>
        </div>
        {mode === 'activity' && <div style={{ padding: '0 12px 12px' }}><ActivityFeed compact filter={{ entityType: 'workflow', entityId: wf.id }} empty="No activity recorded for this workflow yet." /></div>}
        {mode === 'versions' && <>
        {hist.isLoading && <div className="center"><Spinner /></div>}
        {hist.error && <div className="empty">Couldn't load versions: {errMsg(hist.error)}</div>}
        {groups.map(([day, list]) => (
          <div key={day} className="timeline">
            <div className="timeline-day">{day}</div>
            {list.map((v) => {
              const live = wf.active && v.versionId === wf.activeVersionId;
              const latest = v.versionId === wf.versionId;
              return (
                <button key={v.versionId} type="button" onClick={() => setSel(v.versionId)} aria-pressed={sel === v.versionId} className={`timeline-item${sel === v.versionId ? ' on' : ''}${live ? ' live' : ''}`}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v.name || time(v.createdAt)}</span>
                      {live && <span className="state-pill ok sm">Published</span>}
                      {latest && !live && <span className="state-pill live sm">Latest save</span>}
                    </span>
                    <span className="small muted row" style={{ gap: 6, marginTop: 2 }}>
                      {authors[v.versionId] ? <><Avatar name={authors[v.versionId].name} size={18} />{authors[v.versionId].name}</> : <span title="Saved outside HappyN8, or before HappyN8 tracked users">{v.authors} (in n8n)</span>}
                    </span>
                    {v.description && <span className="small" style={{ display: 'block' }}>{v.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {hist.hasNextPage && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button type="button" className="btn sm" onClick={() => hist.fetchNextPage()} disabled={hist.isFetchingNextPage}>Load older versions</button>
          </div>
        )}
        </>}
      </div>

      <div className="editor-stage" style={{ display: 'flex', flexDirection: 'column' }}>
        {!sel && (
          <div className="empty" style={{ margin: 'auto', maxWidth: 420 }}>
            <Icon name="history" size={28} />
            <p>Pick a version to preview it. Steps that differ from what's in the editor are highlighted.</p>
          </div>
        )}
        {sel && version.isLoading && <div className="center" style={{ margin: 'auto' }}><Spinner /></div>}
        {version.data && diff && preview && (
          <>
            <div className="compare-bar">
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{dayLabel(version.data.createdAt)}, {time(version.data.createdAt)}</div>
                <div className="row wrap small" style={{ gap: 10, marginTop: 4 }}>
                  {same ? <span className="muted">Same steps as the editor{diff.moved.length ? ' (only positions differ)' : ''}.</span> : (
                    <>
                      <span className="muted">Compared with the editor:</span>
                      {diff.changed.length > 0 && <span className="legend"><span className="legend-dot" style={{ background: 'var(--warn)' }} />{diff.changed.length} changed since</span>}
                      {diff.removed.length > 0 && <span className="legend"><span className="legend-dot" style={{ background: 'var(--bad)' }} />{diff.removed.length} no longer in the editor</span>}
                      {diff.added.length > 0 && <span className="legend" title={diff.added.join(', ')}><span className="legend-dot" style={{ background: 'var(--ok)' }} />{diff.added.length} added since ({diff.added.slice(0, 3).join(', ')}{diff.added.length > 3 ? '…' : ''})</span>}
                      {diff.connectionsChanged && <span className="legend">Connections differ</span>}
                    </>
                  )}
                </div>
              </div>
              {canEdit && <button type="button" className="btn" onClick={() => onRestore(toDraft({ nodes: version.data!.nodes, connections: version.data!.connections, name: draft.name, settings: draft.settings, pinData: draft.pinData, description: draft.description }))}>
                <Icon name="retry" size={16} />Restore in editor
              </button>}
              {canEdit && version.data.versionId !== wf.activeVersionId && (
                <button type="button" className="btn primary" disabled={busy} onClick={() => publish(version.data!.versionId)}>Publish this version</button>
              )}
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <Canvas draft={preview} readOnly fitKey={sel ?? undefined} marks={marks} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
