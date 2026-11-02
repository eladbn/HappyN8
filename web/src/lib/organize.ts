import type { N8nNode, Tag, Workflow } from '../api/types';
import { STICKY, isTriggerType, moduleTypes } from './workflow';

/** Categories are n8n tags with this prefix, so they also show up (and persist) inside n8n. */
export const CATEGORY_PREFIX = 'Category: ';

export function isCategoryTag(t: Pick<Tag, 'name'>): boolean {
  return t.name.startsWith(CATEGORY_PREFIX);
}

export function categoryName(t: Pick<Tag, 'name'>): string {
  return t.name.slice(CATEGORY_PREFIX.length).trim();
}

export function categoryOf(wf: Pick<Workflow, 'tags'>): Tag | undefined {
  return (wf.tags ?? []).find(isCategoryTag);
}

export function labelTags(wf: Pick<Workflow, 'tags'>): Tag[] {
  return (wf.tags ?? []).filter((t) => !isCategoryTag(t));
}

/** Muted, distinguishable hues for category dots; picked by name so a category keeps its colour. */
const HUES = ['#4F46E5', '#0E7490', '#B45309', '#15803D', '#BE185D', '#1D4ED8', '#7C3AED', '#9A3412', '#0F766E', '#4D7C0F'];

export function categoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 33 + name.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

export type TriggerKind = 'schedule' | 'webhook' | 'chat' | 'form' | 'manual' | 'subworkflow' | 'error' | 'app' | 'none';

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  schedule: 'Schedule',
  webhook: 'Webhook',
  chat: 'Chat',
  form: 'Form',
  manual: 'Manual only',
  subworkflow: 'Called by another workflow',
  error: 'Error handler',
  app: 'App event',
  none: 'No trigger',
};

function kindOf(n: N8nNode): TriggerKind {
  const t = n.type;
  if (/scheduleTrigger|\.cron$|\.interval$/.test(t)) return 'schedule';
  if (/\.webhook$/.test(t)) return 'webhook';
  if (/chatTrigger/.test(t)) return 'chat';
  if (/formTrigger/.test(t)) return 'form';
  if (/manualTrigger|\.start$/.test(t)) return 'manual';
  if (/executeWorkflowTrigger/.test(t)) return 'subworkflow';
  if (/errorTrigger/.test(t)) return 'error';
  return 'app';
}

/** The most meaningful way this workflow starts (manual is only reported if nothing else exists). */
export function triggerKind(nodes: N8nNode[]): TriggerKind {
  const kinds = nodes.filter((n) => !n.disabled && n.type !== STICKY && isTriggerType(n.type)).map(kindOf);
  if (!kinds.length) return 'none';
  return kinds.find((k) => k !== 'manual') ?? 'manual';
}

/** App/module types worth filtering by (core plumbing like Set/If/Code is left out). */
const PLUMBING = /\.(set|if|switch|merge|code|function|functionItem|noOp|wait|filter|splitInBatches|splitOut|aggregate|sort|limit|removeDuplicates|stickyNote|manualTrigger|start|executeWorkflowTrigger|respondToWebhook|dateTime|itemLists|renameKeys|compareDatasets|summarize)$/;

export function appTypes(nodes: N8nNode[]): string[] {
  return moduleTypes(nodes).filter((t) => !PLUMBING.test(t));
}

export interface Facet<K = string> { key: K; label: string; count: number }

export function countBy<K extends string>(items: Workflow[], keysOf: (w: Workflow) => K[]): Map<K, number> {
  const m = new Map<K, number>();
  for (const w of items) for (const k of new Set(keysOf(w))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
