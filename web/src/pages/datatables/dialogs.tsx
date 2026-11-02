import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { COLUMN_NAME, COLUMN_TYPES, SYSTEM_COLUMNS, refreshTables, tableOps, type ColumnType, type DataTable } from '../../api/dataTables';
import { Icon } from '../../components/Icon';
import { Modal, errMsg, useToast } from '../../components/ui';

export const TYPE_GLYPH: Record<ColumnType, string> = { string: 'Aa', number: '#', boolean: '✓', date: '📅' };

export function columnNameProblem(name: string, taken: string[]): string | null {
  if (!name) return null;
  if (!COLUMN_NAME.test(name)) return 'Start with a letter; then use letters, numbers or _ (no spaces).';
  if (SYSTEM_COLUMNS.includes(name)) return `“${name}” is reserved by n8n.`;
  if (taken.includes(name)) return 'A column with this name already exists.';
  return null;
}

/** Suggests a valid column name from free text, e.g. "Email address" → "email_address". */
export function toColumnName(s: string): string {
  const v = s.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z]/.test(v) ? v : v ? `c_${v}` : '';
}

interface DraftCol { key: number; name: string; type: ColumnType }

export function CreateTableDialog({ onClose, existing }: { onClose: () => void; existing: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [cols, setCols] = useState<DraftCol[]>([{ key: 1, name: '', type: 'string' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const named = cols.filter((c) => c.name.trim());
  const problems = cols.map((c, i) => columnNameProblem(c.name.trim(), cols.slice(0, i).map((x) => x.name.trim())));
  const nameTaken = existing.some((e) => e.toLowerCase() === name.trim().toLowerCase());
  const ok = name.trim() && !nameTaken && named.length > 0 && problems.every((p) => !p);

  const setCol = (key: number, patch: Partial<DraftCol>) => setCols((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  async function create() {
    setBusy(true); setError('');
    try {
      const t = await tableOps.create(name.trim(), named.map((c) => ({ name: c.name.trim(), type: c.type })));
      refreshTables(qc);
      toast(`Created ${t.name}`, 'ok');
      nav(`/data-tables/${t.id}`);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title="New data table" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!ok || busy} onClick={create}>{busy ? 'Creating…' : 'Create table'}</button></>}>
      <label className="field"><span className="label">Name</span>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. customers or processed_orders" />
        {nameTaken && <span className="hint" style={{ color: 'var(--bad-text)' }}>A table with this name already exists.</span>}
      </label>
      <div className="field">
        <span className="label">Columns</span>
        <span className="hint" style={{ marginTop: -2 }}>Every row also gets an id and created/updated times automatically. You can add more columns later.</span>
        <div className="col-drafts">
          {cols.map((c, i) => (
            <div key={c.key} className="col-draft">
              <input className="input" aria-label={`Column ${i + 1} name`} value={c.name} placeholder="column_name"
                onChange={(e) => setCol(c.key, { name: e.target.value })}
                onBlur={(e) => { const v = toColumnName(e.target.value); if (v !== e.target.value) setCol(c.key, { name: v }); }} />
              <select className="select" aria-label={`Column ${i + 1} type`} value={c.type} onChange={(e) => setCol(c.key, { type: e.target.value as ColumnType })}>
                {COLUMN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button type="button" className="btn ghost icon" aria-label={`Remove column ${i + 1}`} disabled={cols.length === 1}
                onClick={() => setCols((cs) => cs.filter((x) => x.key !== c.key))}><Icon name="close" size={16} /></button>
              {problems[i] && <span className="hint col-problem">{problems[i]}</span>}
            </div>
          ))}
        </div>
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }}
          onClick={() => setCols((cs) => [...cs, { key: Date.now(), name: '', type: 'string' }])}><Icon name="plus" size={14} />Add column</button>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
    </Modal>
  );
}

export function ColumnDialog({ table, onClose }: { table: DataTable; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('string');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = columnNameProblem(name.trim(), table.columns.map((c) => c.name));

  async function add() {
    setBusy(true); setError('');
    try {
      await tableOps.addColumn(table.id, name.trim(), type);
      refreshTables(qc, table.id);
      toast(`Added column ${name.trim()}`, 'ok');
      onClose();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title="Add column" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!name.trim() || !!problem || busy} onClick={add}>{busy ? 'Adding…' : 'Add column'}</button></>}>
      <label className="field"><span className="label">Name</span>
        <input className="input" autoFocus value={name} placeholder="column_name" onChange={(e) => setName(e.target.value)}
          onBlur={(e) => setName(toColumnName(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !problem) add(); }} />
        <span className="hint" style={problem ? { color: 'var(--bad-text)' } : undefined}>{problem ?? 'Workflows refer to the column by this name.'}</span>
      </label>
      <div className="field"><span className="label">Type</span>
        <div className="type-pick" role="radiogroup" aria-label="Column type">
          {COLUMN_TYPES.map(([v, l]) => (
            <label key={v} className={`type-opt${type === v ? ' on' : ''}`}>
              <input type="radio" name="coltype" checked={type === v} onChange={() => setType(v)} />
              <span className="type-glyph" aria-hidden="true">{TYPE_GLYPH[v]}</span>{l}
            </label>
          ))}
        </div>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
    </Modal>
  );
}

export function RenameDialog({ title, label, initial, check, note, onSave, onClose }: {
  title: string; label: string; initial: string; note?: string; check?: (v: string) => string | null; onSave: (v: string) => Promise<void>; onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = v.trim() && v.trim() !== initial ? check?.(v.trim()) ?? null : null;
  const can = v.trim() && v.trim() !== initial && !problem && !busy;
  async function save() {
    setBusy(true); setError('');
    try { await onSave(v.trim()); onClose(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!can} onClick={save}>{busy ? 'Saving…' : 'Rename'}</button></>}>
      <label className="field"><span className="label">{label}</span>
        <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && can) save(); }} />
        {problem && <span className="hint" style={{ color: 'var(--bad-text)' }}>{problem}</span>}
      </label>
      {note && <div className="notice">{note}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
    </Modal>
  );
}
