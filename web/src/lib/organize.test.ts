import { describe, expect, it } from 'vitest';
import type { N8nNode, Workflow } from '../api/types';
import { appTypes, categoryColor, categoryName, categoryOf, isCategoryTag, labelTags, triggerKind } from './organize';
import { EMPTY, applyFilters, readFilters, writeFilters } from '../pages/workflows/filters';

const n = (type: string, extra: Partial<N8nNode> = {}): N8nNode => ({ id: type, name: type, type, typeVersion: 1, position: [0, 0], parameters: {}, ...extra });
const wf = (id: string, nodes: N8nNode[], tags: Array<[string, string]> = [], extra: Partial<Workflow> = {}): Workflow => ({
  id, name: `wf ${id}`, active: false, versionId: 'v', nodes, connections: {}, settings: {}, createdAt: '', updatedAt: '2026-01-01T00:00:00Z',
  tags: tags.map(([tid, name]) => ({ id: tid, name })), ...extra,
});

describe('categories', () => {
  const w = wf('1', [], [['c1', 'Category: Sales'], ['t1', 'crm']]);
  it('splits category from labels', () => {
    expect(isCategoryTag({ name: 'Category: Sales' })).toBe(true);
    expect(categoryName(categoryOf(w)!)).toBe('Sales');
    expect(labelTags(w).map((t) => t.name)).toEqual(['crm']);
  });
  it('keeps a stable colour per category', () => {
    expect(categoryColor('Sales')).toBe(categoryColor('Sales'));
  });
});

describe('triggers and apps', () => {
  it('prefers a real trigger over manual', () => {
    expect(triggerKind([n('n8n-nodes-base.manualTrigger'), n('n8n-nodes-base.scheduleTrigger')])).toBe('schedule');
    expect(triggerKind([n('n8n-nodes-base.manualTrigger')])).toBe('manual');
    expect(triggerKind([n('n8n-nodes-base.slack')])).toBe('none');
    expect(triggerKind([n('n8n-nodes-base.webhook', { disabled: true })])).toBe('none');
    expect(triggerKind([n('n8n-nodes-base.gmailTrigger')])).toBe('app');
  });
  it('leaves out core plumbing when listing apps', () => {
    expect(appTypes([n('n8n-nodes-base.webhook'), n('n8n-nodes-base.set'), n('n8n-nodes-base.slack'), n('n8n-nodes-base.if')]))
      .toEqual(['n8n-nodes-base.webhook', 'n8n-nodes-base.slack']);
  });
});

describe('filters', () => {
  const all = [
    wf('a', [n('n8n-nodes-base.scheduleTrigger'), n('n8n-nodes-base.slack')], [['c1', 'Category: Sales'], ['t1', 'crm']], { active: true }),
    wf('b', [n('n8n-nodes-base.webhook'), n('n8n-nodes-base.gmail')], [['c2', 'Category: Ops']]),
    wf('c', [n('n8n-nodes-base.manualTrigger')], [], { isArchived: true }),
  ];
  const ids = (f: Partial<typeof EMPTY>, failing = new Set<string>()) => applyFilters(all, { ...EMPTY, ...f }, failing).map((w) => w.id);

  it('hides archived unless asked', () => {
    expect(ids({})).toEqual(['a', 'b']);
    expect(ids({ view: 'archived' })).toEqual(['c']);
  });
  it('filters by category, uncategorized, tag, app, trigger, status and text', () => {
    expect(ids({ category: 'Ops' })).toEqual(['b']);
    expect(ids({ category: '', view: 'archived' })).toEqual(['c']);
    expect(ids({ tags: new Set(['t1']) })).toEqual(['a']);
    expect(ids({ apps: new Set(['n8n-nodes-base.gmail']) })).toEqual(['b']);
    expect(ids({ trigger: 'schedule' })).toEqual(['a']);
    expect(ids({ status: 'inactive' })).toEqual(['b']);
    expect(ids({ q: 'slack' })).toEqual(['a']);
    expect(ids({ view: 'attention' }, new Set(['b']))).toEqual(['b']);
  });
  it('round-trips through the URL', () => {
    const f = { ...EMPTY, category: '', tags: new Set(['t1']), apps: new Set(['x.y']), trigger: 'webhook' as const, q: 'hi' };
    const back = readFilters(writeFilters(f));
    expect(back.category).toBe('');
    expect([...back.tags]).toEqual(['t1']);
    expect(back.trigger).toBe('webhook');
    expect(readFilters(new URLSearchParams()).category).toBeNull();
  });
});
