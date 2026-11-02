import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { ApiError, getAll, n8n } from './client';
import type { Page, Workflow } from './types';

export type ColumnType = 'string' | 'number' | 'boolean' | 'date';
export const COLUMN_TYPES: Array<[ColumnType, string]> = [['string', 'Text'], ['number', 'Number'], ['boolean', 'Yes / no'], ['date', 'Date']];
export const SYSTEM_COLUMNS = ['id', 'createdAt', 'updatedAt'];
/** n8n's rule for column names. */
export const COLUMN_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export interface DataColumn { id: string; name: string; type: ColumnType; index: number }
export interface DataTable {
  id: string;
  name: string;
  columns: DataColumn[];
  projectId: string;
  createdAt: string;
  updatedAt: string;
  sizeBytes?: number;
}
export type Cell = string | number | boolean | null;
export interface DataRow { id: number; createdAt: string; updatedAt: string; [col: string]: Cell }

export interface Variable { id: string; key: string; value: string }

const sorted = (t: DataTable): DataTable => ({ ...t, columns: [...t.columns].sort((a, b) => a.index - b.index) });

export function useDataTables() {
  return useQuery({
    queryKey: ['data-tables'],
    queryFn: async () => (await getAll<DataTable>('/data-tables', { sortBy: 'name:asc' })).map(sorted),
  });
}

export function useDataTable(id: string | undefined) {
  return useQuery({
    queryKey: ['data-table', id],
    queryFn: async () => sorted(await n8n.get<DataTable>(`/data-tables/${id}`)),
    enabled: !!id,
  });
}

export interface RowQuery { search?: string; sortBy?: string }

export function useDataRows(id: string | undefined, q: RowQuery, pageSize = 100) {
  return useInfiniteQuery({
    queryKey: ['data-rows', id, q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => n8n.get<Page<DataRow>>(`/data-tables/${id}/rows`, {
      limit: pageSize, cursor: pageParam, search: q.search || undefined, sortBy: q.sortBy || undefined,
    }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!id,
  });
}

const byId = (id: number) => ({ type: 'and', filters: [{ columnName: 'id', condition: 'eq', value: id }] });

export const tableOps = {
  create: (name: string, columns: Array<{ name: string; type: ColumnType }>) => n8n.post<DataTable>('/data-tables', { name, columns }),
  rename: (id: string, name: string) => n8n.patch<DataTable>(`/data-tables/${id}`, { name }),
  remove: (id: string) => n8n.del(`/data-tables/${id}`),
  addColumn: (id: string, name: string, type: ColumnType) => n8n.post<DataColumn>(`/data-tables/${id}/columns`, { name, type }),
  renameColumn: (id: string, colId: string, name: string) => n8n.patch<DataColumn>(`/data-tables/${id}/columns/${colId}`, { name }),
  moveColumn: (id: string, colId: string, index: number) => n8n.patch<DataColumn>(`/data-tables/${id}/columns/${colId}`, { index }),
  removeColumn: (id: string, colId: string) => n8n.del(`/data-tables/${id}/columns/${colId}`),
  insert: (id: string, rows: Array<Record<string, Cell>>) => n8n.post<DataRow[]>(`/data-tables/${id}/rows`, { data: rows, returnType: 'all' }),
  update: (id: string, rowId: number, data: Record<string, Cell>) =>
    n8n.patch<DataRow[]>(`/data-tables/${id}/rows/update`, { filter: byId(rowId), data, returnData: true }),
  removeRows: (id: string, rowIds: number[]) => n8n.del<DataRow[]>(`/data-tables/${id}/rows/delete?returnData=true&filter=${encodeURIComponent(JSON.stringify({
    type: 'or', filters: rowIds.map((r) => ({ columnName: 'id', condition: 'eq', value: r })),
  }))}`),
  clear: (id: string) => n8n.del<{ deletedCount: number }>(`/data-tables/${id}/rows/clear`),
};

export function refreshTables(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: ['data-tables'] });
  if (id) {
    qc.invalidateQueries({ queryKey: ['data-table', id] });
    qc.invalidateQueries({ queryKey: ['data-rows', id] });
  }
  qc.invalidateQueries({ queryKey: ['audit'] });
}

/** Turns what someone typed into the value n8n expects for the column type. */
export function parseCell(type: ColumnType, raw: string): Cell {
  const v = raw.trim();
  if (v === '') return null;
  if (type === 'number') {
    const n = Number(v.replace(/,/g, ''));
    if (!Number.isFinite(n)) throw new Error(`“${raw}” isn't a number`);
    return n;
  }
  if (type === 'boolean') {
    if (/^(true|yes|y|1)$/i.test(v)) return true;
    if (/^(false|no|n|0)$/i.test(v)) return false;
    throw new Error(`Use yes or no, not “${raw}”`);
  }
  if (type === 'date') {
    // A plain date means midnight where the person is, not midnight UTC.
    const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(`“${raw}” isn't a date`);
    return d.toISOString();
  }
  return raw;
}

/** The text shown in an edit box for a stored value. */
export function cellText(type: ColumnType, v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (type === 'date' && typeof v === 'string') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = (n: number) => String(n).padStart(2, '0');
    const time = d.getHours() || d.getMinutes() ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '';
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${time}`;
  }
  if (type === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** Workflow ids that use a data table, keyed by table id (also matches by name when picked by name). */
export function tableUsage(workflows: Workflow[] | undefined, tables: DataTable[] | undefined): Map<string, Workflow[]> {
  const out = new Map<string, Workflow[]>();
  if (!workflows || !tables) return out;
  const byName = new Map(tables.map((t) => [t.name, t.id]));
  for (const wf of workflows) {
    const hit = new Set<string>();
    for (const n of wf.nodes || []) {
      if (!/dataTable/i.test(n.type)) continue;
      const p = (n.parameters as Record<string, unknown> | undefined)?.dataTableId as { mode?: string; value?: unknown } | string | undefined;
      const value = typeof p === 'object' && p ? p.value : p;
      if (typeof value !== 'string') continue;
      const id = typeof p === 'object' && p?.mode === 'name' ? byName.get(value) : value;
      if (id) hit.add(id);
    }
    for (const id of hit) out.set(id, [...(out.get(id) ?? []), wf]);
  }
  return out;
}

export function toCsv(columns: string[], rows: DataRow[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\r\n');
}

/* ---------- Variables ---------- */

export const VARIABLES_TABLE = 'variables';

/**
 * n8n's own variables need a paid licence. Without it, HappyN8 keeps variables
 * in a data table called "variables" (columns key and value), which any workflow can read.
 */
export function useVariableMode() {
  return useQuery({
    queryKey: ['variables-mode'],
    queryFn: async (): Promise<'n8n' | 'table'> => {
      try {
        await n8n.get('/variables', { limit: 1 });
        return 'n8n';
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 401 || e.status === 404)) return 'table';
        throw e;
      }
    },
    staleTime: Infinity,
  });
}

export function useNativeVariables(enabled: boolean) {
  return useQuery({ queryKey: ['variables'], queryFn: () => getAll<Variable>('/variables'), enabled });
}

export const variableOps = {
  create: (key: string, value: string) => n8n.post<Variable>('/variables', { key, value }),
  update: (id: string, key: string, value: string) => n8n.put<Variable>(`/variables/${id}`, { key, value }),
  remove: (id: string) => n8n.del(`/variables/${id}`),
  createTable: () => tableOps.create(VARIABLES_TABLE, [{ name: 'key', type: 'string' }, { name: 'value', type: 'string' }]),
};

/** Variable names follow n8n's rule: letters, digits and underscores, starting with a letter or underscore. */
export const VARIABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
