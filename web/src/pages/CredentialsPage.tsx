import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { n8n } from '../api/client';
import { qk, useCredentials, useCredentialTypes, useMeta } from '../api/hooks';
import type { Credential, CredentialType } from '../api/types';
import { Icon } from '../components/Icon';
import { Menu, Modal, Spinner, errMsg, useToast } from '../components/ui';
import { timeAgo } from '../lib/format';
import { useCanEdit } from '../lib/session';

interface JsonSchema {
  properties?: Record<string, { type?: string; enum?: unknown[]; description?: string; default?: unknown }>;
  required?: string[];
}

export function CredentialsPage() {
  const creds = useCredentials();
  const meta = useMeta();
  const types = useCredentialTypes(!!meta.data?.login);
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const canEdit = useCanEdit();
  const typeName = useMemo(() => new Map((types.data ?? []).map((t) => [t.name, t.displayName])), [types.data]);

  const rows = (creds.data ?? [])
    .filter((c) => !q || `${c.name} ${c.type} ${typeName.get(c.type) ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function test(c: Credential) {
    try {
      const r = await n8n.post<{ status?: string; message?: string }>(`/credentials/${c.id}/test`);
      toast(r.status === 'OK' || r.status === 'success' ? `“${c.name}” works` : `Test result: ${r.message ?? r.status ?? 'unknown'}`, r.status === 'Error' ? 'bad' : 'ok');
    } catch (e) {
      toast(`Test failed: ${errMsg(e)}`, 'bad');
    }
  }

  async function remove(c: Credential) {
    if (!window.confirm(`Delete credential “${c.name}”? Workflows using it will fail.`)) return;
    try {
      await n8n.del(`/credentials/${c.id}`);
      await qc.invalidateQueries({ queryKey: qk.credentials });
      toast('Credential deleted', 'ok');
    } catch (e) {
      toast(`Delete failed: ${errMsg(e)}`, 'bad');
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><div className="eyebrow">Stored securely in n8n. Secret values are never shown here.</div><h1>Credentials</h1></div>
        <div className="row wrap">
          <label className="search"><Icon name="search" size={16} /><span className="sr-only">Search credentials</span>
            <input type="search" placeholder="Search credentials" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {canEdit && <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New credential</button>}
        </div>
      </header>
      <div className="card">
        <div className="list-row list-head stack-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 220px 140px 44px' }}><span>Name</span><span>Type</span><span>Updated</span><span /></div>
        {creds.isLoading && <div className="center"><Spinner /></div>}
        {creds.error && <div className="empty">Could not load credentials: {errMsg(creds.error)}</div>}
        {!creds.isLoading && rows.length === 0 && !creds.error && <div className="empty">No credentials.</div>}
        {rows.map((c) => (
          <div key={c.id} className="list-row stack-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 220px 140px 44px' }}>
            <span style={{ fontWeight: 600 }}>{c.name}</span>
            <span className="small" style={{ color: 'var(--ink-2)' }}>{typeName.get(c.type) ?? c.type}</span>
            <span className="small muted">{timeAgo(c.updatedAt)}</span>
            <Menu label={`Actions for ${c.name}`}>
              {(close) => (
                <>
                  {canEdit && <button type="button" onClick={() => { close(); test(c); }}><Icon name="check" size={16} />Test connection</button>}
                  {meta.data && <a href={`${meta.data.n8nUrl}/home/credentials/${c.id}`} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Edit in n8n</a>}
                  {canEdit && <><div className="sep" />
                  <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => { close(); remove(c); }}><Icon name="trash" size={16} />Delete</button></>}
                </>
              )}
            </Menu>
          </div>
        ))}
      </div>
      {creating && <CreateCredential types={types.data} onClose={() => setCreating(false)} onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: qk.credentials }); }} />}
    </div>
  );
}

function CreateCredential({ types, onClose, onDone }: { types?: CredentialType[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('');
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const schema = useQuery({
    queryKey: ['cred-schema', type],
    queryFn: () => n8n.get<JsonSchema>(`/credentials/schema/${encodeURIComponent(type)}`),
    enabled: !!type,
    retry: false,
  });
  const ctype = types?.find((t) => t.name === type);
  const options = (types ?? []).filter((t) => !filter || t.displayName.toLowerCase().includes(filter.toLowerCase()) || t.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 60);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await n8n.post('/credentials', { name: name.trim() || ctype?.displayName || type, type, data });
      toast('Credential created', 'ok');
      onDone();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  const props = schema.data?.properties ?? {};
  const required = new Set(schema.data?.required ?? []);
  const secret = (k: string) => /password|secret|token|key/i.test(k) || ctype?.properties.find((p) => p.name === k)?.typeOptions?.password;

  return (
    <Modal title="New credential" onClose={onClose} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!type || busy} onClick={submit}>{busy ? 'Saving…' : 'Create'}</button></>}>
      {!type ? (
        types?.length ? (
          <>
            <input className="input" autoFocus placeholder="Search apps (Slack, Google, OpenAI…)" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search credential types" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {options.map((t) => <button key={t.name} type="button" className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => setType(t.name)}>{t.displayName}</button>)}
            </div>
          </>
        ) : (
          <label className="field"><span className="label">Credential type</span>
            <input className="input" placeholder="e.g. slackApi, openAiApi, httpHeaderAuth" onKeyDown={(e) => { if (e.key === 'Enter') setType((e.target as HTMLInputElement).value.trim()); }} />
            <span className="hint">Type the internal name and press Enter. Add the n8n login to browse types instead.</span>
          </label>
        )
      ) : (
        <>
          <div className="row"><strong className="grow">{ctype?.displayName ?? type}</strong><button type="button" className="btn ghost sm" onClick={() => { setType(''); setData({}); }}>Change type</button></div>
          <label className="field"><span className="label">Name</span><input className="input" value={name} placeholder={ctype?.displayName ?? type} onChange={(e) => setName(e.target.value)} /></label>
          {schema.isLoading && <Spinner />}
          {schema.error && <div className="notice bad">{errMsg(schema.error)}</div>}
          {Object.entries(props).map(([k, p]) => {
            const label = ctype?.properties.find((x) => x.name === k)?.displayName ?? k;
            const v = data[k] ?? p.default ?? '';
            return (
              <label key={k} className="field">
                <span className="label">{label}{required.has(k) && <span className="req"> *</span>}</span>
                {p.enum ? (
                  <select className="select" value={String(v)} onChange={(e) => setData({ ...data, [k]: e.target.value })}>
                    {p.enum.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                  </select>
                ) : p.type === 'boolean' ? (
                  <button type="button" role="switch" className="switch" aria-checked={!!v} aria-label={label} onClick={() => setData({ ...data, [k]: !v })} />
                ) : (
                  <input className="input" type={secret(k) ? 'password' : p.type === 'number' ? 'number' : 'text'} autoComplete="off" value={String(v)}
                    onChange={(e) => setData({ ...data, [k]: p.type === 'number' ? Number(e.target.value) : e.target.value })} />
                )}
                {p.description && <span className="hint">{p.description}</span>}
              </label>
            );
          })}
          <div className="small muted">OAuth2 credentials still have to be connected in n8n itself after creating them (“Edit in n8n”).</div>
        </>
      )}
      {error && <div className="notice bad">{error}</div>}
    </Modal>
  );
}
