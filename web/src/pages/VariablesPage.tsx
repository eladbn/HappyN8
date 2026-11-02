import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAll } from '../api/client';
import {
  VARIABLES_TABLE, VARIABLE_KEY, refreshTables, tableOps, useDataTables, useNativeVariables, useVariableMode, variableOps,
  type DataRow, type DataTable,
} from '../api/dataTables';
import { Icon } from '../components/Icon';
import { Spinner, errMsg, useToast } from '../components/ui';
import { useCanEdit } from '../lib/session';

interface Item { ref: string; key: string; value: string }
interface Ops {
  add: (key: string, value: string) => Promise<unknown>;
  save: (item: Item, value: string) => Promise<unknown>;
  remove: (item: Item) => Promise<unknown>;
}

function keyProblem(key: string, items: Item[]): string | null {
  if (!key) return null;
  if (!VARIABLE_KEY.test(key)) return 'Use letters, numbers and _ only, starting with a letter or _.';
  if (items.some((i) => i.key === key)) return 'This variable already exists.';
  return null;
}

function Copy({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn sm ghost icon" aria-label={label} title={`Copy ${text}`}
      onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied', 'ok'), () => toast(text))}>
      <Icon name="copy" size={15} />
    </button>
  );
}

function VarRow({ item, canEdit, expr, ops }: { item: Item; canEdit: boolean; expr: (k: string) => string; ops: Ops }) {
  const toast = useToast();
  const [val, setVal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const editing = val !== null;
  async function save() {
    if (saving.current) return;
    if (val === null || val === item.value) { setVal(null); return; }
    setBusy(true); saving.current = true;
    try { await ops.save(item, val); toast(`Saved ${item.key}`, 'ok'); setVal(null); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); saving.current = false; }
  }
  return (
    <div className="list-row var-row">
      <code className="var-key">{item.key}</code>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <input className="input" autoFocus value={val} disabled={busy} aria-label={`Value of ${item.key}`} onChange={(e) => setVal(e.target.value)}
            onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setVal(null); }} />
        ) : (
          <button type="button" className={`var-value${canEdit ? ' editable' : ''}`} disabled={!canEdit} onClick={() => setVal(item.value)} aria-label={`Edit ${item.key}`}>
            {item.value || <span className="cell-empty">empty</span>}
          </button>
        )}
      </div>
      <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
        <code className="var-expr small" title="Use this in a step">{expr(item.key)}</code>
        <Copy text={expr(item.key)} label={`Copy expression for ${item.key}`} />
        {canEdit && (
          <button type="button" className="btn sm ghost icon" aria-label={`Delete ${item.key}`} onClick={async () => {
            if (!window.confirm(`Delete ${item.key}? Workflows that use it will get an empty value.`)) return;
            try { await ops.remove(item); toast(`Deleted ${item.key}`, 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
          }}><Icon name="trash" size={15} /></button>
        )}
      </div>
    </div>
  );
}

function VarList({ items, loading, error, canEdit, expr, ops }: { items: Item[]; loading: boolean; error: unknown; canEdit: boolean; expr: (k: string) => string; ops: Ops }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const problem = keyProblem(key.trim(), items);
  async function add() {
    setBusy(true);
    try { await ops.add(key.trim(), value); toast(`Added ${key.trim()}`, 'ok'); setKey(''); setValue(''); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }
  const shown = items.filter((i) => !q || `${i.key} ${i.value}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.key.localeCompare(b.key));
  return (
    <>
      {items.length > 6 && (
        <label className="search" style={{ maxWidth: 340 }}>
          <Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search variables" aria-label="Search variables" />
        </label>
      )}
      <div className="card">
        <div className="list-row list-head var-row"><span>Name</span><span>Value</span><span style={{ textAlign: 'right' }}>Use in a step</span></div>
        {canEdit && (
          <form className="list-row var-row var-add" onSubmit={(e) => { e.preventDefault(); if (key.trim() && !problem) add(); }}>
            <div>
              <input className="input code" value={key} onChange={(e) => setKey(e.target.value.replace(/\s+/g, '_'))} placeholder="NEW_VARIABLE" aria-label="New variable name" aria-invalid={!!problem} />
              {problem && <span className="hint" style={{ color: 'var(--bad-text)', display: 'block', marginTop: 4 }}>{problem}</span>}
            </div>
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" aria-label="New variable value" />
            <div style={{ textAlign: 'right' }}><button type="submit" className="btn primary sm" disabled={!key.trim() || !!problem || busy}><Icon name="plus" size={14} />{busy ? 'Adding…' : 'Add variable'}</button></div>
          </form>
        )}
        {loading && <div className="center" style={{ minHeight: 100 }}><Spinner /></div>}
        {!!error && <div className="empty">Couldn't load variables: {errMsg(error)}</div>}
        {!loading && !error && !items.length && <div className="empty">No variables yet.{canEdit ? ' Add values that several workflows share, such as a base URL or a team email.' : ''}</div>}
        {shown.map((i) => <VarRow key={i.ref} item={i} canEdit={canEdit} expr={expr} ops={ops} />)}
      </div>
    </>
  );
}

function NativeVariables({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const vars = useNativeVariables(true);
  const done = () => { qc.invalidateQueries({ queryKey: ['variables'] }); qc.invalidateQueries({ queryKey: ['audit'] }); };
  const items = (vars.data ?? []).map((v) => ({ ref: v.id, key: v.key, value: v.value }));
  return (
    <VarList items={items} loading={vars.isLoading} error={vars.error} canEdit={canEdit} expr={(k) => `{{ $vars.${k} }}`} ops={{
      add: async (k, v) => { await variableOps.create(k, v); done(); },
      save: async (i, v) => { await variableOps.update(i.ref, i.key, v); done(); },
      remove: async (i) => { await variableOps.remove(i.ref); done(); },
    }} />
  );
}

function TableVariables({ table, canEdit }: { table: DataTable; canEdit: boolean }) {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ['data-rows', table.id, 'all'], queryFn: () => getAll<DataRow>(`/data-tables/${table.id}/rows`) });
  const done = () => refreshTables(qc, table.id);
  const hasCols = ['key', 'value'].every((c) => table.columns.some((x) => x.name === c));
  if (!hasCols) {
    return (
      <div className="notice bad">
        The <Link to={`/data-tables/${table.id}`}>{VARIABLES_TABLE}</Link> table needs text columns named <code>key</code> and <code>value</code>.
        {canEdit && (
          <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={async () => {
            for (const c of ['key', 'value']) if (!table.columns.some((x) => x.name === c)) await tableOps.addColumn(table.id, c, 'string');
            done();
          }}>Add the missing columns</button>
        )}
      </div>
    );
  }
  const items = (rows.data ?? []).filter((r) => typeof r.key === 'string' && r.key).map((r) => ({ ref: String(r.id), key: String(r.key), value: r.value == null ? '' : String(r.value) }));
  return (
    <VarList items={items} loading={rows.isLoading} error={rows.error} canEdit={canEdit}
      expr={(k) => `{{ $('Variables').all().find(v => v.json.key === '${k}')?.json.value }}`}
      ops={{
        add: async (k, v) => { await tableOps.insert(table.id, [{ key: k, value: v }]); done(); },
        save: async (i, v) => { await tableOps.update(table.id, Number(i.ref), { value: v }); done(); },
        remove: async (i) => { await tableOps.removeRows(table.id, [Number(i.ref)]); done(); },
      }} />
  );
}

/** Values shared by many workflows. Uses n8n variables when the licence allows, otherwise a data table. */
export function VariablesPage() {
  const mode = useVariableMode();
  const tables = useDataTables();
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const toast = useToast();
  const table = (tables.data ?? []).find((t) => t.name === VARIABLES_TABLE);

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <header className="page-head">
        <div>
          <h1>Variables</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 680 }}>Named values that many workflows share, such as a base URL or a team email. Change one here and every workflow that uses it picks up the new value.</p>
        </div>
      </header>
      {mode.isLoading && <div className="center" style={{ minHeight: 120 }}><Spinner /></div>}
      {mode.error && <div className="notice bad">Couldn't reach n8n: {errMsg(mode.error)}</div>}
      {mode.data === 'n8n' && <NativeVariables canEdit={canEdit} />}
      {mode.data === 'table' && (
        <>
          <div className="var-how">
            <div>
              <strong>Stored in the {table ? <Link to={`/data-tables/${table.id}`}>{VARIABLES_TABLE}</Link> : VARIABLES_TABLE} data table</strong>
              <p className="small muted" style={{ margin: '4px 0 0' }}>Your n8n plan doesn't include n8n's own variables, so HappyN8 keeps them in a data table instead.</p>
            </div>
            <ol className="small">
              <li>In a workflow, add a <strong>Data table</strong> step named <code>Variables</code> that gets all rows from <code>{VARIABLES_TABLE}</code>.</li>
              <li>In any later step, paste the expression copied from the list below.</li>
            </ol>
          </div>
          {tables.isLoading && <div className="center" style={{ minHeight: 100 }}><Spinner /></div>}
          {tables.data && !table && (
            <div className="card empty">
              <p style={{ margin: '0 0 12px' }}>There's no variables table yet.</p>
              {canEdit && (
                <button type="button" className="btn primary" onClick={async () => {
                  try { await variableOps.createTable(); refreshTables(qc); toast('Variables table created', 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
                }}><Icon name="plus" size={16} />Create the variables table</button>
              )}
            </div>
          )}
          {table && <TableVariables table={table} canEdit={canEdit} />}
        </>
      )}
    </div>
  );
}
