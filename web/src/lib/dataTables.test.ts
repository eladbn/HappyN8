import { describe, expect, it } from 'vitest';
import { cellText, parseCell, tableUsage, toCsv, type DataTable } from '../api/dataTables';
import type { Workflow } from '../api/types';
import { columnNameProblem, toColumnName } from '../pages/datatables/dialogs';
import { changeSummary } from './activity';

describe('data table cells', () => {
  it('parses typed values and rejects bad ones', () => {
    expect(parseCell('number', '1,250.5')).toBe(1250.5);
    expect(() => parseCell('number', 'abc')).toThrow(/number/);
    expect(parseCell('boolean', 'Yes')).toBe(true);
    expect(parseCell('boolean', '0')).toBe(false);
    expect(() => parseCell('boolean', 'maybe')).toThrow();
    expect(parseCell('string', '  keep spaces ')).toBe('  keep spaces ');
    expect(parseCell('string', '   ')).toBeNull();
    expect(parseCell('date', '2026-03-04')).toMatch(/^2026-03-0[34]T/);
    expect(() => parseCell('date', 'soon')).toThrow(/date/);
    expect(cellText('date', parseCell('date', '2025-05-17'))).toBe('2025-05-17');
  });

  it('shows stored values for editing', () => {
    expect(cellText('boolean', true)).toBe('yes');
    expect(cellText('number', null)).toBe('');
    const d = new Date(2026, 0, 2).toISOString();
    expect(cellText('date', d)).toBe('2026-01-02');
  });

  it('validates column names', () => {
    expect(toColumnName('Email address')).toBe('Email_address');
    expect(toColumnName('2nd try')).toBe('c_2nd_try');
    expect(columnNameProblem('id', [])).toMatch(/reserved/);
    expect(columnNameProblem('my col', [])).toMatch(/letter/);
    expect(columnNameProblem('email', ['email'])).toMatch(/exists/);
    expect(columnNameProblem('email', [])).toBeNull();
  });
});

describe('data table helpers', () => {
  const tables = [{ id: 'T1', name: 'customers', columns: [] }, { id: 'T2', name: 'orders', columns: [] }] as unknown as DataTable[];
  const wf = (id: string, params: unknown) => ({ id, name: id, nodes: [{ name: 'D', type: 'n8n-nodes-base.dataTable', parameters: { dataTableId: params } }] }) as unknown as Workflow;

  it('finds workflows that use a table, by id or by name', () => {
    const usage = tableUsage([wf('a', { __rl: true, mode: 'list', value: 'T1' }), wf('b', { __rl: true, mode: 'name', value: 'customers' }), wf('c', { mode: 'id', value: 'T2' })], tables);
    expect(usage.get('T1')?.map((w) => w.id)).toEqual(['a', 'b']);
    expect(usage.get('T2')?.map((w) => w.id)).toEqual(['c']);
  });

  it('writes CSV with quoting', () => {
    const csv = toCsv(['id', 'note'], [{ id: 1, note: 'a, "b"', createdAt: '', updatedAt: '' }]);
    expect(csv).toBe('id,note\r\n1,"a, ""b"""');
  });

  it('describes data table changes in the activity log', () => {
    const base = { id: 1, ts: '', userId: 1, user: 'Dana', entityType: 'datatable', entityId: 'T1', entityName: 'customers' };
    expect(changeSummary({ ...base, action: 'added rows to', details: { rows: 3 } })).toBe('3 rows');
    expect(changeSummary({ ...base, action: 'edited rows in', details: { rows: 1, fields: ['email'] } })).toBe('1 row, changed email');
    expect(changeSummary({ ...base, action: 'changed a column in', details: { column: 'mail', from: 'email' } })).toBe('email → mail');
  });
});
