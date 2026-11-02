import type { AuditEntry } from '../api/types';
import { CATEGORY_PREFIX } from './organize';

const KIND: Record<string, string> = {
  workflow: 'workflow', credential: 'credential', tag: 'tag', execution: 'run', variable: 'variable', user: 'user', datatable: 'data table',
};

function list(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** One-line description of what changed, e.g. "added Slack, changed If". */
export function changeSummary(e: AuditEntry): string | null {
  const d = e.details;
  if (!d) return null;
  if (e.entityType === 'workflow' && e.action === 'updated') {
    const parts: string[] = [];
    if (d.renamed) parts.push(`renamed from “${d.renamed.from}”`);
    if (d.added?.length) parts.push(`added ${list(d.added)}`);
    if (d.removed?.length) parts.push(`removed ${list(d.removed)}`);
    if (d.changed?.length) parts.push(`changed ${list(d.changed)}`);
    if (!parts.length && d.connections) parts.push('rewired steps');
    if (d.settings) parts.push('updated settings');
    if (d.description) parts.push('edited the description');
    return parts.length ? parts.join('; ') : 'saved without step changes';
  }
  if (e.action === 'retagged' && Array.isArray(d.tags)) {
    const cats = d.tags.filter((t: string) => typeof t === 'string' && t.startsWith(CATEGORY_PREFIX)).map((t: string) => t.slice(CATEGORY_PREFIX.length));
    const labels = d.tags.filter((t: string) => typeof t === 'string' && !t.startsWith(CATEGORY_PREFIX));
    const parts = [];
    parts.push(cats.length ? `category ${cats[0]}` : 'no category');
    parts.push(labels.length ? `tags ${labels.join(', ')}` : 'no tags');
    return parts.join('; ');
  }
  if (e.action === 'ran' || e.action === 'tested a step') {
    return [d.step ? `up to ${d.step}` : null, d.executionId ? `run #${d.executionId}` : null].filter(Boolean).join(', ') || null;
  }
  if (e.entityType === 'user' && e.action === 'updated user') {
    const parts = [];
    if (d.role) parts.push(`role ${d.role.from} → ${d.role.to}`);
    if (d.disabled !== undefined) parts.push(d.disabled ? 'disabled' : 'enabled');
    if (d.password) parts.push('reset password');
    if (d.name) parts.push(`renamed to ${d.name.to}`);
    return parts.join('; ') || null;
  }
  if (e.entityType === 'user' && e.action === 'added user') return d.role ? `as ${d.role}` : null;
  if (e.entityType === 'datatable') {
    if (e.action === 'created') return d.columns?.length ? `columns ${list(d.columns, 5)}` : null;
    if (e.action === 'renamed') return d.from ? `was ${d.from}` : null;
    if (d.column) return d.from ? `${d.from} → ${d.column}` : d.column;
    const n = typeof d.rows === 'number' ? `${d.rows} row${d.rows === 1 ? '' : 's'}` : null;
    const f = Array.isArray(d.fields) && d.fields.length ? `changed ${list(d.fields)}` : null;
    return [n, f].filter(Boolean).join(', ') || null;
  }
  if (e.entityType === 'setting' && d.to) return d.from ? `${d.from} → ${d.to}` : `set to ${d.to}`;
  if (e.entityType === 'credential' && d.type) return d.type;
  if (e.entityType === 'execution' && d.newExecutionId) return `new run #${d.newExecutionId}`;
  return null;
}

/** The object of the sentence: “the workflow Lead intake”, “run #42”… */
export function subject(e: AuditEntry): string {
  if (e.entityType === 'execution') return `run #${e.entityId ?? ''}${e.entityName ? ` of ${e.entityName}` : ''}`;
  if (e.entityType === 'user' && (e.action === 'signed in' || e.action === 'changed their password')) return '';
  if (e.entityType === 'setting') return '';
  if (e.entityType === 'user') return e.entityName ?? 'a user';
  if (e.entityType === 'tag' && e.entityName?.startsWith(CATEGORY_PREFIX)) return `category ${e.entityName.slice(CATEGORY_PREFIX.length)}`;
  const kind = KIND[e.entityType] ?? e.entityType;
  return e.entityName ? `${kind} ${e.entityName}` : `a ${kind}`;
}

export const ACTION_FILTERS: Array<[string, string]> = [
  ['', 'All changes'],
  ['workflow', 'Workflows'],
  ['execution', 'Runs'],
  ['credential', 'Credentials'],
  ['tag', 'Categories and tags'],
  ['datatable', 'Data tables'],
  ['variable', 'Variables'],
  ['user', 'Users and sign-ins'],
];
