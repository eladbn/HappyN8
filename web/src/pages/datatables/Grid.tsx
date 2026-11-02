import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cellText, parseCell, type Cell, type DataColumn, type DataRow, type DataTable } from '../../api/dataTables';
import { Menu, errMsg } from '../../components/ui';
import { dateTime, timeAgo } from '../../lib/format';
import { TYPE_GLYPH } from './dialogs';

export interface Sort { col: string; dir: 'asc' | 'desc' }

interface GridProps {
  table: DataTable;
  rows: DataRow[];
  canEdit: boolean;
  sort: Sort;
  onSort: (s: Sort) => void;
  selected: Set<number>;
  onSelect: (ids: Set<number>) => void;
  onSaveCell: (row: DataRow, col: DataColumn, value: Cell) => Promise<void>;
  draft: boolean;
  onDraftSave: (values: Record<string, Cell>) => Promise<void>;
  onDraftCancel: () => void;
  columnMenu: (col: DataColumn, close: () => void) => ReactNode;
}

function Display({ col, v }: { col: DataColumn; v: Cell | undefined }) {
  if (v === null || v === undefined || v === '') return <span className="cell-empty">empty</span>;
  if (col.type === 'boolean') return <span className={`cell-bool ${v ? 'yes' : 'no'}`}>{v ? 'Yes' : 'No'}</span>;
  if (col.type === 'date') return <span title={dateTime(String(v))}>{cellText('date', v)}</span>;
  if (col.type === 'number') return <span className="cell-num">{Number(v).toLocaleString()}</span>;
  return <span title={String(v).length > 60 ? String(v) : undefined}>{String(v)}</span>;
}

function EditCell({ row, col, canEdit, onSave }: { row: DataRow; col: DataColumn; canEdit: boolean; onSave: GridProps['onSaveCell'] }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const value = row[col.name];

  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  async function commit() {
    // Enter disables the box while saving, which also fires blur; save only once.
    if (saving.current) return;
    let parsed: Cell;
    try { parsed = parseCell(col.type, text); } catch (e) { setError(errMsg(e)); return; }
    if (parsed === (value ?? null) || (col.type === 'date' && cellText('date', parsed) === cellText('date', value))) { setEditing(false); return; }
    setBusy(true); saving.current = true;
    try { await onSave(row, col, parsed); setEditing(false); setError(''); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); saving.current = false; }
  }

  if (col.type === 'boolean' && canEdit) {
    return (
      <td className="cell">
        <button type="button" className="cell-toggle" role="switch" aria-checked={!!value} aria-label={`${col.name} for row ${row.id}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onSave(row, col, !value); } finally { setBusy(false); } }}>
          <Display col={col} v={value} />
        </button>
      </td>
    );
  }
  if (!editing) {
    return (
      <td className={`cell${canEdit ? ' editable' : ''}`} tabIndex={canEdit ? 0 : undefined}
        onClick={canEdit ? () => { setText(cellText(col.type, value)); setEditing(true); } : undefined}
        onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setText(cellText(col.type, value)); setEditing(true); } } : undefined}>
        <Display col={col} v={value} />
      </td>
    );
  }
  return (
    <td className="cell editing">
      <input ref={ref} className={`cell-input${error ? ' bad' : ''}`} value={text} disabled={busy} aria-label={`${col.name} for row ${row.id}`}
        aria-invalid={!!error} placeholder={col.type === 'date' ? 'YYYY-MM-DD' : ''} inputMode={col.type === 'number' ? 'decimal' : undefined}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setError(''); }
        }} />
      {error && <span className="cell-error" role="alert">{error}</span>}
    </td>
  );
}

function DraftRow({ table, onSave, onCancel }: { table: DataTable; onSave: GridProps['onDraftSave']; onCancel: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const out: Record<string, Cell> = {};
    try {
      for (const c of table.columns) out[c.name] = c.type === 'boolean' ? vals[c.name] === 'true' : parseCell(c.type, vals[c.name] ?? '');
    } catch (e) { setError(errMsg(e)); return; }
    setBusy(true);
    try { await onSave(out); setVals({}); setError(''); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') onCancel();
  };
  return (
    <>
      <tr className="draft-row">
        <td className="cell-check" />
        <td className="cell-id muted">new</td>
        {table.columns.map((c, i) => (
          <td key={c.id} className="cell editing">
            {c.type === 'boolean' ? (
              <label className="row small" style={{ padding: '0 8px' }}>
                <input type="checkbox" checked={vals[c.name] === 'true'} onChange={(e) => setVals((v) => ({ ...v, [c.name]: String(e.target.checked) }))} onKeyDown={keys} />Yes
              </label>
            ) : (
              <input className="cell-input" autoFocus={i === 0} aria-label={`New ${c.name}`} value={vals[c.name] ?? ''} disabled={busy}
                placeholder={c.type === 'date' ? 'YYYY-MM-DD' : c.name} onChange={(e) => setVals((v) => ({ ...v, [c.name]: e.target.value }))} onKeyDown={keys} />
            )}
          </td>
        ))}
        <td className="cell-meta">
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="btn sm primary" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add'}</button>
            <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
          </span>
        </td>
      </tr>
      {error && <tr className="draft-row"><td /><td colSpan={table.columns.length + 2}><span className="cell-error static" role="alert">{error}</span></td></tr>}
    </>
  );
}

function SortHead({ label, col, sort, onSort, children, className }: { label: ReactNode; col: string; sort: Sort; onSort: GridProps['onSort']; children?: ReactNode; className?: string }) {
  const on = sort.col === col;
  return (
    <th className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <span className="th-inner">
        <button type="button" className="th-sort" onClick={() => onSort({ col, dir: on && sort.dir === 'asc' ? 'desc' : 'asc' })}>
          {label}{on && <span className="th-arrow" aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
        </button>
        {children}
      </span>
    </th>
  );
}

/** Spreadsheet-style view of a data table. Click a cell to edit it; Enter saves, Esc cancels. */
export function Grid(p: GridProps) {
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const toggle = (id: number) => {
    const next = new Set(p.selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    p.onSelect(next);
  };
  return (
    <div className="grid-wrap">
      <table className="dgrid">
        <thead>
          <tr>
            <th className="cell-check">
              {p.canEdit && <input type="checkbox" aria-label="Select all loaded rows" checked={allOn} onChange={() => p.onSelect(allOn ? new Set() : new Set(p.rows.map((r) => r.id)))} />}
            </th>
            <SortHead label="#" col="id" sort={p.sort} onSort={p.onSort} className="cell-id" />
            {p.table.columns.map((c) => (
              <SortHead key={c.id} col={c.name} sort={p.sort} onSort={p.onSort}
                label={<><span className="type-glyph" title={c.type} aria-label={c.type}>{TYPE_GLYPH[c.type]}</span>{c.name}</>}>
                {p.canEdit && <Menu label={`Column ${c.name} options`} icon="down">{(close) => p.columnMenu(c, close)}</Menu>}
              </SortHead>
            ))}
            <SortHead label="Updated" col="updatedAt" sort={p.sort} onSort={p.onSort} className="cell-meta" />
          </tr>
        </thead>
        <tbody>
          {p.draft && <DraftRow table={p.table} onSave={p.onDraftSave} onCancel={p.onDraftCancel} />}
          {p.rows.map((r) => (
            <tr key={r.id} className={p.selected.has(r.id) ? 'selected' : undefined}>
              <td className="cell-check">
                {p.canEdit && <input type="checkbox" aria-label={`Select row ${r.id}`} checked={p.selected.has(r.id)} onChange={() => toggle(r.id)} />}
              </td>
              <td className="cell-id">{r.id}</td>
              {p.table.columns.map((c) => <EditCell key={c.id} row={r} col={c} canEdit={p.canEdit} onSave={p.onSaveCell} />)}
              <td className="cell-meta" title={dateTime(r.updatedAt)}>{timeAgo(r.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
