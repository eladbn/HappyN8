import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { n8n, request } from '../api/client';
import { qk, useExecution, useExecutions, useMeta, useWorkflow } from '../api/hooks';
import type { Execution, Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { Spinner, StatusChip, errMsg, useToast } from '../components/ui';
import { useCatalog } from '../lib/catalog';
import { accessor, fieldPaths, nodeIO, nodeRunStates } from '../lib/execution';
import { STATUS_LABEL } from '../lib/format';
import { STICKY, ancestors, isTriggerType, toDraft, toSaveBody, type Draft } from '../lib/workflow';
import { Canvas, type AddRequest } from './Canvas';
import { EditorBar, type Tab } from './EditorBar';
import { ExecutionsView } from './ExecutionsView';
import { HistoryView } from './HistoryView';
import { NodePanel } from './NodePanel';
import { NodePicker } from './NodePicker';
import { SettingsView } from './SettingsView';
import type { MappingField } from './params/context';
import { useDraft } from './store';
import { useCanEdit } from '../lib/session';


function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function mappingFields(exec: Execution | null | undefined, d: Draft, name: string): MappingField[] {
  if (!exec) return [];
  const direct = Object.entries(d.connections).filter(([, t]) => (t.main || []).some((o) => (o ?? []).some((x) => x.node === name))).map(([s]) => s);
  const out: MappingField[] = [];
  for (const a of ancestors(d.connections, name)) {
    const items = nodeIO(exec, a)?.outputs[0] ?? [];
    for (const f of fieldPaths(items)) {
      const acc = accessor(f.path);
      out.push({ node: a, path: f.path, sample: f.sample, expr: a === direct[0] ? `$json${acc}` : `$('${a.replace(/'/g, "\\'")}').item.json${acc}` });
    }
  }
  return out;
}

export function EditorPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'editor';
  const execParam = params.get('exec');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const meta = useMeta();
  const catalog = useCatalog();
  const wfq = useWorkflow(id);
  const wf = wfq.data;
  const { draft, dirty, canUndo, canRedo, load, update, undo, redo, markSaved } = useDraft();
  const [panel, setPanel] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const canEdit = useCanEdit();
  const canRun = !!meta.data?.login && canEdit;

  const setTab = (t: Tab, extra: Record<string, string | null> = {}) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    for (const [k, v] of Object.entries(extra)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };

  // Load the editor document once per workflow.
  useEffect(() => { if (wf && (!draft || wf.id !== id)) load(toDraft(wf)); }, [wf, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const latestList = useExecutions({ workflowId: id }, { live: false, pageSize: 1 });
  const latestId = latestList.data?.pages[0]?.data[0]?.id ?? null;
  const overlayId = tab === 'executions' ? execParam : runId;
  const overlayExec = useExecution(overlayId, !!runId && overlayId === runId);
  const dataExec = useExecution(overlayId ? null : latestId);
  const sampleExec = overlayExec.data ?? dataExec.data ?? null;
  const overlay = useMemo(() => (overlayExec.data ? nodeRunStates(overlayExec.data) : null), [overlayExec.data]);

  useEffect(() => {
    const s = overlayExec.data?.status;
    if (runId && s && s !== 'running' && s !== 'new' && s !== 'waiting') {
      qc.invalidateQueries({ queryKey: ['executions'] });
      toast(s === 'success' ? 'Run finished successfully' : `Run ${STATUS_LABEL[s]?.toLowerCase() ?? s}`, s === 'success' ? 'ok' : 'bad');
    }
  }, [overlayExec.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (): Promise<Workflow | null> => {
    if (!draft) return null;
    setSaving(true);
    try {
      const saved = await n8n.put<Workflow>(`/workflows/${id}`, toSaveBody(draft));
      qc.setQueryData(qk.workflow(id), saved);
      qc.invalidateQueries({ queryKey: qk.workflows });
      qc.invalidateQueries({ queryKey: qk.history(id) });
      qc.invalidateQueries({ queryKey: ['ownership'] });
      qc.invalidateQueries({ queryKey: ['version-authors', id] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      markSaved();
      toast(saved.active ? 'Saved. Publish to make these changes live.' : 'Saved', 'ok');
      return saved;
    } catch (e) {
      toast(`Save failed: ${errMsg(e)}`, 'bad');
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, id, qc, markSaved, toast]);

  async function setActive(on: boolean) {
    if (on && dirty && !(await save())) return;
    try {
      const res = await n8n.post<Workflow>(`/workflows/${id}/${on ? 'activate' : 'deactivate'}`);
      qc.setQueryData(qk.workflow(id), res);
      qc.invalidateQueries({ queryKey: qk.workflows });
      qc.invalidateQueries({ queryKey: ['ownership'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      toast(on ? 'Workflow is live' : 'Workflow deactivated', 'ok');
    } catch (e) {
      toast(`${on ? 'Publishing' : 'Deactivating'} failed: ${errMsg(e)}`, 'bad');
    }
  }

  const triggers = (draft?.nodes ?? []).filter((n) => !n.disabled && n.type !== STICKY && (catalog.get(n.type)?.isTrigger ?? isTriggerType(n.type)));
  const [trigger, setTrigger] = useState('');
  const chosenTrigger = triggers.find((t) => t.name === trigger) ?? triggers.find((t) => /manual/i.test(t.type)) ?? triggers[0];

  async function run(destination?: string) {
    if (!chosenTrigger) { toast('Add a trigger module first', 'bad'); return; }
    if (dirty && !(await save())) return;
    try {
      const res = await request<{ executionId?: string; waitingForWebhook?: boolean }>('POST', `/api/workflows/${id}/run`, {
        triggerName: chosenTrigger.name,
        destinationNode: destination ? { nodeName: destination, mode: 'inclusive' } : undefined,
      });
      if (res.waitingForWebhook) {
        const path = (chosenTrigger.parameters as { path?: string }).path || chosenTrigger.webhookId;
        toast(`Waiting for a test event. Send a request to ${meta.data?.n8nUrl}/webhook-test/${path}`, 'info');
      }
      if (res.executionId) {
        setRunId(res.executionId);
        if (tab !== 'editor') setTab('editor');
        toast(`Running… (execution #${res.executionId})`);
      }
    } catch (e) {
      toast(`Run failed: ${errMsg(e)}`, 'bad');
    }
  }

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && canEdit) save(); return; }
      if (isTyping(e.target) || tab !== 'editor') return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, [dirty, save, undo, redo, tab, canEdit]);

  if (wfq.isLoading || (wf && !draft)) return <div className="center" style={{ minHeight: '100vh' }}><Spinner /></div>;
  if (wfq.error || !wf || !draft) {
    return <div className="page"><div className="empty">Could not open this workflow: {errMsg(wfq.error)} <button type="button" className="btn" onClick={() => navigate('/workflows')}>Back</button></div></div>;
  }


  return (
    <div className="editor">
      <EditorBar wf={wf} name={draft.name} onName={(v) => update((d) => ({ ...d, name: v }), false)} tab={tab} onTab={(t) => setTab(t)}
        dirty={dirty} saving={saving} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} onSave={() => save()} onActive={setActive}
        onBack={() => { if (!dirty || window.confirm('You have unsaved changes. Leave anyway?')) navigate('/workflows'); }} />

      {tab === 'editor' && (
        <div className="editor-body">
          <div className="editor-stage">
            <Canvas draft={draft} update={canEdit ? update : undefined} readOnly={!canEdit} overlay={overlay} activeNode={panel} onOpenNode={setPanel} onRequestAdd={canEdit ? setAdding : undefined} fitKey={id} />
            {canEdit && <div className="run-dock">
              {canRun ? (
                <>
                  <button type="button" className="btn go" onClick={() => run()} disabled={!chosenTrigger}><Icon name="play" size={14} />Run once</button>
                  {triggers.length > 1 && (
                    <select className="select" style={{ width: 'auto' }} aria-label="Trigger to start from" value={chosenTrigger?.name} onChange={(e) => setTrigger(e.target.value)}>
                      {triggers.map((t) => <option key={t.name} value={t.name}>from {t.name}</option>)}
                    </select>
                  )}
                </>
              ) : <span className="small muted" style={{ padding: '0 6px' }}>Running from here needs the n8n login (N8N_EMAIL / N8N_PASSWORD)</span>}
              {overlayExec.data && (
                <>
                  <StatusChip status={overlayExec.data.status} />
                  <button type="button" className="btn ghost sm" onClick={() => setTab('executions', { exec: overlayExec.data!.id })}>See run</button>
                  <button type="button" className="btn ghost sm" onClick={() => setRunId(null)}>Clear</button>
                </>
              )}
            </div>}
          </div>
          {panel && (
            <NodePanel key={panel} name={panel} draft={draft} update={update} exec={sampleExec} fields={mappingFields(sampleExec, draft, panel)}
              canLoad={!!meta.data?.login} onClose={() => setPanel(null)} onRename={setPanel} onRunTo={canRun ? (n) => run(n) : undefined} readOnly={!canEdit} />
          )}
        </div>
      )}

      {tab === 'executions' && (
        <ExecutionsView wf={wf} draft={draft} selected={execParam} onSelect={(x) => setTab('executions', { exec: x })} />
      )}

      {tab === 'history' && <HistoryView wf={wf} draft={draft} onRestore={(d) => { update(() => d); setTab('editor'); toast('Version restored into the editor. Save to keep it.'); }} />}
      {tab === 'settings' && <SettingsView wf={wf} draft={draft} update={(fn) => update(fn)} dirty={dirty} saving={saving} onSave={() => save()} />}

      {adding && (
        <NodePicker request={adding} draft={draft} onClose={() => setAdding(null)}
          onPick={(next, name) => { update(() => next); setAdding(null); setPanel(name); }} />
      )}
    </div>
  );
}
