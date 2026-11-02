import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  refreshTables, tableOps, tableUsage, toCsv, useDataRows, useDataTable, useDataTables,
  type DataColumn, type DataRow, type DataTable,
} from '../../api/dataTables';
import { useWorkflows } from '../../api/hooks';
import type { Page } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Menu, Spinner, errMsg, useToast } from '../../components/ui';
import { timeAgo } from '../../lib/format';
import { useCanEdit } from '../../lib/session';
import { ColumnDialog, RenameDialog, columnNameProblem } from './dialogs';
import { Grid, type Sort } from './Grid';

export function size(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TablePage() {
  const { id = '' } = useParams();
  const table = useDataTable(id);
  const tables = useDataTables();
  const workflows = useWorkflows();
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>({ col: 'id', dir: 'desc' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState(false);
  const [dialog, setDialog] = useState<null | 'column' | 'rename' | { renameCol: DataColumn }>(null);

  useEffect(() => { const t = setTimeout(() => setSearch(typed.trim()), 300); return () => clearTimeout(t); }, [typed]);
  const rowsQ = useDataRows(id, { search, sortBy: `${sort.col}:${sort.dir}` });
  const rows = useMemo(() => rowsQ.data?.pages.flatMap((p) => p.data) ?? [], [rowsQ.data]);
  const usedIn = useMemo(() => tableUsage(workflows.data, tables.data).get(id) ?? [], [workflows.data, tables.data, id]);

  if (table.isLoading) return <div className="center" style={{ minHeight: 300 }}><Spinner /></div>;
  if (table.error || !table.data) {
    return (
      <div className="page">
        <Link to="/data-tables" className="back-link"><Icon name="back" size={16} />Data tables</Link>
        <div className="empty">Couldn't open this table: {errMsg(table.error)}</div>
      </div>
    );
  }
  const t: DataTable = table.data;

  const patchRows = (fn: (r: DataRow[]) => DataRow[]) => qc.setQueriesData<InfiniteData<Page<DataRow>>>({ queryKey: ['data-rows', id] },
    (d) => d && { ...d, pages: d.pages.map((p, i) => ({ ...p, data: i === 0 ? fn(p.data) : p.data })) });
  const patchRow = (u: DataRow) => qc.setQueriesData<InfiniteData<Page<DataRow>>>({ queryKey: ['data-rows', id] },
    (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.map((r) => (r.id === u.id ? u : r)) })) });

  async function act(fn: () => Promise<unknown>, done: string) {
    try { await fn(); refreshTables(qc, id); toast(done, 'ok'); } catch (e) { toast(errMsg(e), 'bad'); }
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!window.confirm(`Delete ${ids.length} row${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    await act(() => tableOps.removeRows(id, ids), `Deleted ${ids.length} row${ids.length === 1 ? '' : 's'}`);
    setSelected(new Set());
  }

  const columnMenu = (c: DataColumn, close: () => void) => {
    const i = t.columns.findIndex((x) => x.id === c.id);
    return (
      <>
        <button type="button" onClick={() => { close(); setDialog({ renameCol: c }); }}><Icon name="edit" size={16} />Rename</button>
        <button type="button" disabled={i === 0} onClick={() => { close(); act(() => tableOps.moveColumn(id, c.id, i - 1), `Moved ${c.name}`); }}><Icon name="left" size={16} />Move left</button>
        <button type="button" disabled={i === t.columns.length - 1} onClick={() => { close(); act(() => tableOps.moveColumn(id, c.id, i + 1), `Moved ${c.name}`); }}><Icon name="right" size={16} />Move right</button>
        <div className="sep" />
        <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => {
          close();
          if (window.confirm(`Delete column ${c.name} and everything in it?`)) act(() => tableOps.removeColumn(id, c.id), `Deleted column ${c.name}`);
        }}><Icon name="trash" size={16} />Delete column</button>
      </>
    );
  };

  return (
    <div className="page dt-page">
      <Link to="/data-tables" className="back-link"><Icon name="back" size={16} />Data tables</Link>
      <header className="page-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="dt-title"><span className="dt-icon"><Icon name="table" size={20} /></span>{t.name}</h1>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            {t.columns.length} column{t.columns.length === 1 ? '' : 's'}{size(t.sizeBytes) ? `, ${size(t.sizeBytes)}` : ''}, updated {timeAgo(t.updatedAt)}
          </p>
          <div className="used-in">
            {usedIn.length ? <>Used in {usedIn.map((w) => <Link key={w.id} to={`/workflows/${w.id}`} className="tag-chip static">{w.name}</Link>)}</>
              : <span className="muted">Not used by any workflow yet. In a workflow, add a Data table step and pick {t.name}.</span>}
          </div>
        </div>
        {canEdit && (
          <div className="row">
            <button type="button" className="btn" onClick={() => setDialog('column')}><Icon name="plus" size={16} />Add column</button>
            <button type="button" className="btn primary" disabled={!t.columns.length} onClick={() => setDraft(true)}><Icon name="plus" size={16} />Add row</button>
            <Menu label="Table options">
              {(close) => (
                <>
                  <button type="button" onClick={() => { close(); setDialog('rename'); }}><Icon name="edit" size={16} />Rename table</button>
                  <button type="button" onClick={() => { close(); download(t.name, toCsv(['id', ...t.columns.map((c) => c.name), 'createdAt', 'updatedAt'], rows)); }}><Icon name="download" size={16} />Download loaded rows (CSV)</button>
                  <div className="sep" />
                  <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => {
                    close();
                    if (window.confirm(`Delete every row in ${t.name}? The columns stay.`)) act(() => tableOps.clear(id), `Cleared ${t.name}`);
                  }}><Icon name="close" size={16} />Delete all rows</button>
                  <button type="button" style={{ color: 'var(--bad-text)' }} onClick={async () => {
                    close();
                    const warn = usedIn.length ? ` ${usedIn.length} workflow${usedIn.length === 1 ? ' uses' : 's use'} it and will fail.` : '';
                    if (!window.confirm(`Delete the table ${t.name} and all its rows?${warn}`)) return;
                    try { await tableOps.remove(id); refreshTables(qc); toast(`Deleted ${t.name}`, 'ok'); nav('/data-tables'); } catch (e) { toast(errMsg(e), 'bad'); }
                  }}><Icon name="trash" size={16} />Delete table</button>
                </>
              )}
            </Menu>
          </div>
        )}
      </header>

      <div className="toolbar">
        <label className="search" style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <Icon name="search" size={16} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search text columns" aria-label="Search rows" />
          {typed && <button type="button" className="chip-x" aria-label="Clear search" onClick={() => setTyped('')}><Icon name="close" size={14} /></button>}
        </label>
        {selected.size > 0 && (
          <div className="row bulk-bar">
            <span className="small"><strong>{selected.size}</strong> selected</span>
            <button type="button" className="btn sm danger" onClick={removeSelected}><Icon name="trash" size={14} />Delete</button>
            <button type="button" className="btn sm ghost" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        {!canEdit && <span className="chip">View only</span>}
      </div>

      {!t.columns.length ? (
        <div className="card empty">This table has no columns yet. {canEdit ? 'Add one to start entering rows.' : ''}</div>
      ) : (
        <div className="card dt-card">
          <Grid table={t} rows={rows} canEdit={canEdit} sort={sort} onSort={setSort} selected={selected} onSelect={setSelected}
            onSaveCell={async (row, col, value) => {
              const [u] = await tableOps.update(id, row.id, { [col.name]: value });
              if (u) patchRow(u);
              qc.invalidateQueries({ queryKey: ['audit'] });
            }}
            draft={draft}
            onDraftSave={async (values) => {
              const added = await tableOps.insert(id, [values]);
              patchRows((r) => (sort.col === 'id' && sort.dir === 'desc' ? [...added, ...r] : [...r, ...added]));
              qc.invalidateQueries({ queryKey: ['data-tables'] });
              qc.invalidateQueries({ queryKey: ['audit'] });
              toast('Row added', 'ok');
            }}
            onDraftCancel={() => setDraft(false)}
            columnMenu={columnMenu} />
          {rowsQ.isLoading && <div className="center" style={{ minHeight: 120 }}><Spinner /></div>}
          {rowsQ.error && <div className="empty">Couldn't load rows: {errMsg(rowsQ.error)}</div>}
          {!rowsQ.isLoading && !rows.length && !draft && (
            <div className="empty">{search ? `No rows match “${search}”.` : canEdit ? 'No rows yet. Add one here, or let a workflow fill the table.' : 'No rows yet.'}</div>
          )}
          {rowsQ.hasNextPage && (
            <div style={{ textAlign: 'center', padding: 12 }}>
              <button type="button" className="btn sm" disabled={rowsQ.isFetchingNextPage} onClick={() => rowsQ.fetchNextPage()}>{rowsQ.isFetchingNextPage ? 'Loading…' : 'Show more rows'}</button>
            </div>
          )}
        </div>
      )}

      {dialog === 'column' && <ColumnDialog table={t} onClose={() => setDialog(null)} />}
      {dialog === 'rename' && (
        <RenameDialog title="Rename table" label="Name" initial={t.name} onClose={() => setDialog(null)}
          note="Workflow steps that picked this table from the list keep working. Steps that refer to it by name need the new name."
          check={(v) => ((tables.data ?? []).some((x) => x.id !== id && x.name.toLowerCase() === v.toLowerCase()) ? 'A table with this name already exists.' : null)}
          onSave={async (v) => { await tableOps.rename(id, v); refreshTables(qc, id); toast(`Renamed to ${v}`, 'ok'); }} />
      )}
      {dialog && typeof dialog === 'object' && (
        <RenameDialog title={`Rename column ${dialog.renameCol.name}`} label="Column name" initial={dialog.renameCol.name} onClose={() => setDialog(null)}
          note="Workflow steps that use the old column name need updating."
          check={(v) => columnNameProblem(v, t.columns.filter((c) => c.id !== dialog.renameCol.id).map((c) => c.name))}
          onSave={async (v) => { await tableOps.renameColumn(id, dialog.renameCol.id, v); refreshTables(qc, id); toast(`Renamed column to ${v}`, 'ok'); }} />
      )}
    </div>
  );
}
