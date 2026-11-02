import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCredentials, useNodeDetail } from '../api/hooks';
import type { Execution, N8nNode, NodeTypeDetail, Params } from '../api/types';
import { Icon } from '../components/Icon';
import { NodeRunData } from '../components/ExecutionDetail';
import { NodeIcon, Spinner } from '../components/ui';
import { useCatalog } from '../lib/catalog';
import { isDisplayed } from '../lib/params';
import { STICKY, newId, removeNodes, renameNode, uniqueName, type Draft } from '../lib/workflow';
import { PropList } from './params/collections';
import { ParamContext, type MappingField } from './params/context';
import { JsonInput } from './params/inputs';

type Tab = 'params' | 'settings' | 'data';

interface Props {
  name: string;
  draft: Draft;
  update: (fn: (d: Draft) => Draft, history?: boolean) => void;
  exec: Execution | null;
  fields: MappingField[];
  canLoad: boolean;
  onClose: () => void;
  onRename: (to: string) => void;
  onRunTo?: (name: string) => void;
  readOnly?: boolean;
}

export function NodePanel({ name, draft, update, exec, fields, canLoad, onClose, onRename, onRunTo, readOnly }: Props) {
  const node = draft.nodes.find((n) => n.name === name);
  const catalog = useCatalog();
  const detail = useNodeDetail(node?.type, node?.typeVersion, canLoad && !!node && node.type !== STICKY);
  const [tab, setTab] = useState<Tab>('params');
  const [asJson, setAsJson] = useState(false);
  const lastEdit = useRef(0);

  const [width, setWidth] = useState(() => { try { return Number(localStorage.getItem('fb.panelWidth')) || 560; } catch { return 560; } });
  const startResize = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    const move = (ev: PointerEvent) => { w = Math.min(Math.max(startW + (startX - ev.clientX), 380), Math.min(1000, window.innerWidth - 320)); setWidth(w); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('fb.panelWidth', String(Math.round(w))); } catch { /* ignore */ } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!node) return null;

  const patch = (p: Partial<N8nNode>, history = true) => update((d) => ({ ...d, nodes: d.nodes.map((n) => (n.name === name ? { ...n, ...p } : n)) }), history);
  const setParams = (params: Params) => {
    const now = Date.now();
    const history = now - lastEdit.current > 1200;
    lastEdit.current = now;
    patch({ parameters: params }, history);
  };

  const summary = catalog.get(node.type);
  return (
    <aside className="side panel" aria-label={`${node.name} settings`} style={{ width }}>
      <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize panel" onPointerDown={startResize} />
      <div className="side-head">
        <NodeIcon type={node.type} size={36} />
        <div className="grow">
          <NameInput value={node.name} disabled={readOnly} onCommit={(to) => {
            const clean = to.trim();
            if (!clean || clean === node.name) return;
            const unique = uniqueName(clean, draft.nodes.filter((n) => n.name !== node.name).map((n) => n.name));
            update((d) => renameNode(d, node.name, unique));
            onRename(unique);
          }} />
          <div className="small muted" style={{ paddingLeft: 8 }}>{summary?.displayName ?? node.type} · v{node.typeVersion}</div>
        </div>
        <button type="button" className="btn ghost icon" aria-label="Close panel" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="tabs" role="tablist" style={{ padding: '0 12px' }}>
        <button type="button" role="tab" aria-selected={tab === 'params'} onClick={() => setTab('params')}>Parameters</button>
        <button type="button" role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>Settings</button>
        <button type="button" role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}>Input &amp; output</button>
      </div>
      {node.disabled && (
        <div className="panel-banner">
          <span className="grow">This step is turned off. Runs skip it and pass its input straight through.</span>
          {!readOnly && <button type="button" className="btn sm" onClick={() => patch({ disabled: false })}>Turn on</button>}
        </div>
      )}
      <div className="side-body">
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'contents' }}>
          {tab === 'params' && (node.type === STICKY ? <StickyEditor node={node} patch={patch} /> : (
            <>
              <CredentialPicker node={node} detail={detail.data} patch={patch} />
              {detail.isLoading && canLoad && <div className="center" style={{ minHeight: 80 }}><Spinner /></div>}
              {!canLoad && <div className="notice accent small">Forms for every module need the n8n login (N8N_EMAIL / N8N_PASSWORD). Until then, edit parameters as JSON.</div>}
              {detail.error && <div className="notice bad small">Could not load this module's form: {String((detail.error as Error).message)}</div>}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn ghost sm" onClick={() => setAsJson(!asJson)}><Icon name="code" size={14} />{asJson || !detail.data ? 'JSON' : 'Edit as JSON'}</button>
              </div>
              {detail.data && !asJson ? (
                <ParamContext.Provider value={{ node, root: node.parameters, rootProps: detail.data.properties, fields, canLoad }}>
                  <PropList props={detail.data.properties} value={node.parameters} path={[]} onChange={setParams} />
                </ParamContext.Provider>
              ) : (
                <JsonInput value={node.parameters} rows={18} label="Parameters JSON" onChange={(v) => setParams((v && typeof v === 'object' ? v : {}) as Params)} />
              )}
            </>
          ))}
          {tab === 'settings' && <NodeSettings node={node} patch={patch} draft={draft} update={update} />}
        </fieldset>
        {tab === 'data' && (exec && exec.data?.resultData?.runData?.[node.name]
          ? <><div className="small muted">From execution #{exec.id}</div><NodeRunData exec={exec} name={node.name} /></>
          : <div className="empty">No data for this step yet. Use “Test this step”, or open a run from the Runs tab.</div>)}
      </div>
      {!readOnly && (
        <div className="panel-foot">
          <button type="button" className="btn ghost sm danger" onClick={() => { update((d) => removeNodes(d, [node.name])); onClose(); }}><Icon name="trash" size={14} />Delete step</button>
          <span className="grow" />
          {onRunTo && node.type !== STICKY && (
            <button type="button" className="btn go" title="Runs the workflow from its trigger up to this step" onClick={() => { setTab('data'); onRunTo(node.name); }}><Icon name="play" size={12} />Test this step</button>
          )}
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      )}
    </aside>
  );
}

function NameInput({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input className="input" aria-label="Module name" value={v} disabled={disabled}
      style={{ fontWeight: 700, fontSize: 15, border: '1px solid transparent', background: 'transparent', minHeight: 32, padding: '2px 8px' }}
      onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function CredentialPicker({ node, detail, patch }: { node: N8nNode; detail?: NodeTypeDetail; patch: (p: Partial<N8nNode>) => void }) {
  const creds = useCredentials();
  const types = useMemo(() => {
    const fromDetail = (detail?.credentials as Array<{ name: string; required?: boolean; displayOptions?: NodeTypeDetail['properties'][0]['displayOptions'] }> | undefined)
      ?.filter((c) => isDisplayed(c, { root: node.parameters, parent: node.parameters, typeVersion: node.typeVersion, rootProps: detail?.properties ?? [] }))
      .map((c) => ({ name: c.name, required: c.required }));
    const existing = Object.keys(node.credentials || {}).map((name) => ({ name, required: false }));
    const all = [...(fromDetail ?? []), ...existing];
    return all.filter((c, i) => all.findIndex((x) => x.name === c.name) === i);
  }, [detail, node.parameters, node.credentials, node.typeVersion]);
  if (!types.length) return null;
  return (
    <div className="group">
      {types.map((t) => {
        const options = (creds.data ?? []).filter((c) => c.type === t.name);
        const current = node.credentials?.[t.name];
        return (
          <label key={t.name} className="field">
            <span className="label"><Icon name="key" size={14} />Credential: {t.name}{t.required && <span className="req">*</span>}</span>
            <select className="select" value={current?.id ?? ''} onChange={(e) => {
              const c = options.find((x) => x.id === e.target.value);
              const next = { ...(node.credentials || {}) };
              if (c) next[t.name] = { id: c.id, name: c.name }; else delete next[t.name];
              patch({ credentials: next });
            }}>
              <option value="">{current && !options.some((o) => o.id === current.id) ? `Current: ${current.name}` : 'Select a credential…'}</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="hint">{options.length === 0 ? 'No saved credential of this type. ' : ''}<Link to="/credentials">Manage credentials</Link></span>
          </label>
        );
      })}
    </div>
  );
}

function StickyEditor({ node, patch }: { node: N8nNode; patch: (p: Partial<N8nNode>, h?: boolean) => void }) {
  const p = node.parameters as { content?: string; color?: number };
  return (
    <>
      <label className="field"><span className="label">Note (Markdown)</span>
        <textarea className="textarea" rows={10} value={p.content ?? ''} onChange={(e) => patch({ parameters: { ...node.parameters, content: e.target.value } }, false)} />
      </label>
      <label className="field"><span className="label">Color</span>
        <select className="select" value={p.color ?? 1} onChange={(e) => patch({ parameters: { ...node.parameters, color: Number(e.target.value) } })}>
          {['Yellow', 'Red', 'Green', 'Blue', 'Purple', 'Orange', 'Gray'].map((c, i) => <option key={c} value={i + 1}>{c}</option>)}
        </select>
      </label>
    </>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div><div style={{ fontWeight: 600 }}>{label}</div>{hint && <div className="small muted">{hint}</div>}</div>
      <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}

function NodeSettings({ node, patch, draft, update }: { node: N8nNode; patch: (p: Partial<N8nNode>) => void; draft: Draft; update: Props['update'] }) {
  return (
    <>
      <Toggle label="Enabled" hint="Disabled modules are skipped and pass their input through." checked={!node.disabled} onChange={(v) => patch({ disabled: !v })} />
      <Toggle label="Always output data" hint="Output an empty item when nothing is returned." checked={!!node.alwaysOutputData} onChange={(v) => patch({ alwaysOutputData: v })} />
      <Toggle label="Execute once" hint="Run only for the first input item." checked={!!node.executeOnce} onChange={(v) => patch({ executeOnce: v })} />
      <Toggle label="Retry on fail" checked={!!node.retryOnFail} onChange={(v) => patch({ retryOnFail: v })} />
      {node.retryOnFail && (
        <div className="row">
          <label className="field grow"><span className="label">Max tries</span>
            <input className="input" type="number" min={2} max={5} value={node.maxTries ?? 3} onChange={(e) => patch({ maxTries: Number(e.target.value) })} /></label>
          <label className="field grow"><span className="label">Wait between (ms)</span>
            <input className="input" type="number" min={0} max={5000} step={100} value={node.waitBetweenTries ?? 1000} onChange={(e) => patch({ waitBetweenTries: Number(e.target.value) })} /></label>
        </div>
      )}
      <label className="field"><span className="label">On error</span>
        <select className="select" value={node.onError ?? (node.continueOnFail ? 'continueRegularOutput' : 'stopWorkflow')} onChange={(e) => patch({ onError: e.target.value, continueOnFail: undefined })}>
          <option value="stopWorkflow">Stop the workflow</option>
          <option value="continueRegularOutput">Continue</option>
          <option value="continueErrorOutput">Continue using an error output</option>
        </select>
      </label>
      <label className="field"><span className="label">Notes</span>
        <textarea className="textarea" rows={3} value={node.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} />
      </label>
      <Toggle label="Show notes on the canvas" checked={!!node.notesInFlow} onChange={(v) => patch({ notesInFlow: v })} />
      <div className="small muted">Type <code>{node.type}</code> · version {node.typeVersion} · id <code>{node.id}</code></div>
      <div className="row wrap">
        <button type="button" className="btn sm" onClick={() => update((d) => {
          const copy: N8nNode = { ...structuredClone(node), id: newId(), name: uniqueName(node.name, d.nodes.map((n) => n.name)), position: [node.position[0] + 40, node.position[1] + 140] };
          if (copy.webhookId) copy.webhookId = newId();
          return { ...d, nodes: [...d.nodes, copy] };
        })}><Icon name="copy" size={14} />Duplicate</button>
      </div>
      {draft.pinData?.[node.name] !== undefined && (
        <div className="notice small row" style={{ justifyContent: 'space-between' }}>
          <span><Icon name="pin" size={14} /> This module has pinned test data.</span>
          <button type="button" className="btn sm" onClick={() => update((d) => { const p = { ...(d.pinData || {}) }; delete p[node.name]; return { ...d, pinData: p }; })}>Unpin</button>
        </div>
      )}
    </>
  );
}
