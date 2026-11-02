import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from '../api/client';
import { useN8nConnection } from '../api/hooks';
import type { N8nConnection } from '../api/types';
import { Spinner, errMsg, useToast } from '../components/ui';

type Proto = 'http' | 'https';
interface Parts { proto: Proto; host: string; port: string; path: string }

const EMPTY: Parts = { proto: 'http', host: '', port: '5678', path: '' };

/** Splits a saved URL into the form fields. */
function split(url: string): Parts {
  if (!url) return EMPTY;
  try {
    const u = new URL(url);
    return { proto: u.protocol === 'https:' ? 'https' : 'http', host: u.hostname, port: u.port, path: u.pathname === '/' ? '' : u.pathname };
  } catch {
    return EMPTY;
  }
}

function portError(port: string): string {
  if (!port.trim()) return '';
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? '' : 'Port must be a whole number between 1 and 65535';
}

function join(p: Parts): string {
  const host = p.host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!host) return '';
  const port = p.port.trim() ? `:${p.port.trim()}` : '';
  const path = p.path.trim() ? `/${p.path.trim().replace(/^\/+|\/+$/g, '')}` : '';
  return `${p.proto}://${host}${port}${path}`;
}

/** Admin page: where HappyN8 finds n8n (IP or host name and port). */
export function ConnectionPage() {
  const conn = useN8nConnection();
  const qc = useQueryClient();
  const toast = useToast();
  const [parts, setParts] = useState<Parts>(EMPTY);
  const [publicUrl, setPublicUrl] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('');
  const [result, setResult] = useState<{ ok: boolean; message: string; unreachable?: boolean } | null>(null);

  useEffect(() => {
    if (!conn.data) return;
    setParts(split(conn.data.url));
    setPublicUrl(conn.data.saved.publicUrl);
  }, [conn.data]);

  const set = (patch: Partial<Parts>) => { setParts((p) => ({ ...p, ...patch })); setResult(null); };
  const url = join(parts);
  const badPort = portError(parts.port);
  const canSubmit = !!url && !badPort && !busy;

  async function test() {
    setBusy('test'); setResult(null);
    try { setResult(await request<{ ok: boolean; message: string }>('POST', '/api/n8n-connection/test', { url })); }
    catch (e) { setResult({ ok: false, message: errMsg(e) }); }
    setBusy('');
  }

  async function save(body: { url: string; publicUrl: string }, force = false) {
    setBusy('save'); setResult(null);
    try {
      const out = await request<N8nConnection>('PUT', '/api/n8n-connection', { ...body, force });
      qc.setQueryData(['n8n-connection'], out);
      await qc.invalidateQueries(); // meta, status, catalog and lists now come from the new n8n
      toast(`HappyN8 now uses n8n at ${out.url}`, 'ok');
    } catch (e) {
      setResult({ ok: false, message: errMsg(e), unreachable: e instanceof ApiError && e.status === 409 });
    }
    setBusy('');
  }

  const d = conn.data;
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <header className="page-head">
        <div>
          <h1>n8n connection</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Where HappyN8 finds your n8n server. Changes apply right away for everyone, with no restart needed.</p>
        </div>
      </header>
      {conn.isLoading && <div className="center"><Spinner /></div>}
      {conn.error && <div className="notice bad">Couldn't load the connection settings: {errMsg(conn.error)}</div>}
      {d && (
        <div className="card" style={{ padding: 20 }}>
          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) save({ url, publicUrl }); }}>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <label className="field" style={{ width: 110 }}><span className="label">Protocol</span>
                <select className="select" value={parts.proto} onChange={(e) => set({ proto: e.target.value as Proto })}>
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select></label>
              <label className="field grow" style={{ minWidth: 200 }}><span className="label">IP or host name</span>
                <input className="input" autoComplete="off" spellCheck={false} value={parts.host} onChange={(e) => set({ host: e.target.value })} placeholder="e.g. 192.168.1.20 or n8n" /></label>
              <label className="field" style={{ width: 120 }}><span className="label">Port</span>
                <input className="input" inputMode="numeric" autoComplete="off" value={parts.port} onChange={(e) => set({ port: e.target.value.replace(/[^\d]/g, '') })} placeholder={parts.proto === 'https' ? '443' : '80'} aria-invalid={!!badPort} /></label>
            </div>
            {badPort && <div className="notice bad" role="alert" style={{ marginBottom: 12 }}>{badPort}</div>}
            <span className="hint small muted" style={{ display: 'block', marginTop: -4, marginBottom: 14 }}>
              n8n listens on port 5678 by default. Leave the port empty to use {parts.proto === 'https' ? '443' : '80'}. HappyN8's server must be able to reach this address. If HappyN8 runs in Docker, "localhost" means the container itself.
            </span>
            <label className="field"><span className="label">Path (optional)</span>
              <input className="input" autoComplete="off" spellCheck={false} value={parts.path} onChange={(e) => set({ path: e.target.value })} placeholder="Only if n8n is served under a sub-path, e.g. /n8n" /></label>
            <label className="field"><span className="label">Browser address (optional)</span>
              <input className="input" autoComplete="off" spellCheck={false} value={publicUrl} onChange={(e) => { setPublicUrl(e.target.value); setResult(null); }} placeholder={url || 'Same as above'} />
              <span className="hint">Used for "Open in n8n" links. Set it only if your browser reaches n8n at a different address or port than the HappyN8 server.</span></label>

            <div className="notice" style={{ marginBottom: 14 }}>
              HappyN8 will connect to <strong>{url || '…'}</strong>
              {d.env.url && <><br /><span className="small">From .env (N8N_URL): {d.env.url}{d.saved.url ? '. The address saved here overrides it.' : '. In use now.'}</span></>}
            </div>

            {result && (
              <div className={`notice ${result.ok ? 'accent' : 'bad'}`} role="status" style={{ marginBottom: 14 }}>
                {result.message}
                {result.unreachable && <div style={{ marginTop: 8 }}><button type="button" className="btn" disabled={!!busy} onClick={() => save({ url, publicUrl }, true)}>Save anyway</button></div>}
              </div>
            )}

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn primary" disabled={!canSubmit}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn" disabled={!canSubmit} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
              {d.saved.url && d.env.url && (
                <button type="button" className="btn ghost" disabled={!!busy} onClick={() => save({ url: '', publicUrl: '' })}>Use the .env address</button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
