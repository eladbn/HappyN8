import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { VARIABLES_TABLE, tableUsage, useDataTables } from '../api/dataTables';
import { useWorkflows } from '../api/hooks';
import { Icon } from '../components/Icon';
import { Spinner, errMsg } from '../components/ui';
import { timeAgo } from '../lib/format';
import { useCanEdit } from '../lib/session';
import { CreateTableDialog, TYPE_GLYPH } from './datatables/dialogs';
import { size } from './datatables/TablePage';

/** n8n data tables: small built-in tables that workflows read from and write to. */
export function DataTablesPage() {
  const tables = useDataTables();
  const workflows = useWorkflows();
  const canEdit = useCanEdit();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const usage = useMemo(() => tableUsage(workflows.data, tables.data), [workflows.data, tables.data]);

  const list = (tables.data ?? []).filter((t) => !q || `${t.name} ${t.columns.map((c) => c.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const cols = 'minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,1fr) 120px';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Data tables</h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 640 }}>Tables stored inside n8n. Workflows can look up, add and update rows with the Data table step, and you can edit them here.</p>
        </div>
        {canEdit && <button type="button" className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New table</button>}
      </header>
      <div className="toolbar">
        <label className="search" style={{ flex: '0 1 340px' }}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tables and columns" aria-label="Search tables" />
        </label>
      </div>
      <div className="card">
        <div className="list-row list-head dt-list-row" style={{ gridTemplateColumns: cols }}><span>Table</span><span>Columns</span><span>Used in</span><span>Updated</span></div>
        {tables.isLoading && <div className="center" style={{ minHeight: 120 }}><Spinner /></div>}
        {tables.error && <div className="empty">Couldn't load data tables: {errMsg(tables.error)}</div>}
        {tables.data && !list.length && (
          <div className="empty">
            {q ? `No tables match “${q}”.` : 'No data tables yet. Create one to keep lists such as customers, processed orders or settings that workflows share.'}
          </div>
        )}
        {list.map((t) => {
          const used = usage.get(t.id) ?? [];
          return (
            <div key={t.id} className="list-row clickable dt-list-row" style={{ gridTemplateColumns: cols }} onClick={() => nav(`/data-tables/${t.id}`)}>
              <div className="row" style={{ minWidth: 0, gap: 12 }}>
                <span className="dt-icon"><Icon name={t.name === VARIABLES_TABLE ? 'braces' : 'table'} size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <Link to={`/data-tables/${t.id}`} className="dt-name" onClick={(e) => e.stopPropagation()}>{t.name}</Link>
                  <div className="small muted">{size(t.sizeBytes) || 'Empty'}</div>
                </div>
              </div>
              <div className="dt-cols">
                {t.columns.slice(0, 5).map((c) => <span key={c.id} className="col-chip"><span className="type-glyph" aria-hidden="true">{TYPE_GLYPH[c.type]}</span>{c.name}</span>)}
                {t.columns.length > 5 && <span className="small muted">+{t.columns.length - 5}</span>}
              </div>
              <div className="small" style={{ minWidth: 0 }}>
                {used.length ? (
                  <span className="dt-used" title={used.map((w) => w.name).join(', ')}>{used.slice(0, 2).map((w) => w.name).join(', ')}{used.length > 2 ? ` and ${used.length - 2} more` : ''}</span>
                ) : <span className="muted">Not used yet</span>}
              </div>
              <div className="small muted">{timeAgo(t.updatedAt)}</div>
            </div>
          );
        })}
      </div>
      {creating && <CreateTableDialog existing={(tables.data ?? []).map((t) => t.name)} onClose={() => setCreating(false)} />}
    </div>
  );
}
