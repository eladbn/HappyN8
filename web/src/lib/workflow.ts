import type { Connections, ConnectionTarget, N8nNode, Workflow } from '../api/types';

export const STICKY = 'n8n-nodes-base.stickyNote';

/** Editable part of a workflow held by the editor. */
export interface Draft {
  name: string;
  nodes: N8nNode[];
  connections: Connections;
  settings: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  staticData?: unknown;
  description?: string;
}

const NODE_KEYS = [
  'id', 'name', 'webhookId', 'disabled', 'notesInFlow', 'notes', 'type', 'typeVersion', 'executeOnce',
  'alwaysOutputData', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'continueOnFail', 'onError', 'position',
  'parameters', 'credentials', 'customTelemetryTags', 'extendsCredential',
];

const SETTINGS_KEYS = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution',
  'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'callerPolicy', 'callerIds', 'timeSavedMode',
  'timeSavedPerExecution', 'redactionPolicy', 'availableInMCP', 'customTelemetryTags', 'credentialResolverId',
];

const TRIGGER_TYPES = new Set([
  'n8n-nodes-base.start', 'n8n-nodes-base.webhook', 'n8n-nodes-base.formTrigger', 'n8n-nodes-base.cron',
  'n8n-nodes-base.interval', 'n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.executeWorkflowTrigger', 'n8n-nodes-base.errorTrigger', '@n8n/n8n-nodes-langchain.chatTrigger',
  '@n8n/n8n-nodes-langchain.mcpTrigger',
]);

export function isTriggerType(type: string): boolean {
  return TRIGGER_TYPES.has(type) || /trigger$/i.test(type);
}

export function toDraft(wf: Pick<Workflow, 'name' | 'nodes' | 'connections' | 'settings' | 'pinData' | 'staticData'> & { description?: string | null }): Draft {
  return {
    name: wf.name,
    nodes: structuredClone(wf.nodes || []),
    connections: structuredClone(wf.connections || {}),
    settings: structuredClone(wf.settings || {}),
    pinData: wf.pinData ? structuredClone(wf.pinData) : undefined,
    staticData: wf.staticData ?? undefined,
    description: wf.description ?? undefined,
  };
}

export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  const stem = base.replace(/\d+$/, '');
  let i = 1;
  while (set.has(`${stem}${i}`)) i += 1;
  return `${stem}${i}`;
}

export function newId(): string {
  return crypto.randomUUID();
}

function cleanConnections(conns: Connections): Connections {
  const out: Connections = {};
  for (const [src, byType] of Object.entries(conns)) {
    const types: Record<string, Array<ConnectionTarget[] | null>> = {};
    for (const [type, outputs] of Object.entries(byType || {})) {
      const arr = (outputs || []).map((targets) => targets ?? []);
      while (arr.length && arr[arr.length - 1].length === 0) arr.pop();
      if (arr.length) types[type] = arr;
    }
    if (Object.keys(types).length) out[src] = types;
  }
  return out;
}

export function addConnection(conns: Connections, src: string, type: string, outIdx: number, tgt: string, inIdx: number): Connections {
  const next = structuredClone(conns);
  next[src] ||= {};
  next[src][type] ||= [];
  const outs = next[src][type];
  while (outs.length <= outIdx) outs.push([]);
  const list = outs[outIdx] ?? [];
  if (!list.some((t) => t.node === tgt && t.type === type && t.index === inIdx)) list.push({ node: tgt, type, index: inIdx });
  outs[outIdx] = list;
  return next;
}

export function removeConnection(conns: Connections, src: string, type: string, outIdx: number, tgt: string, inIdx: number): Connections {
  const next = structuredClone(conns);
  const list = next[src]?.[type]?.[outIdx];
  if (list) next[src][type][outIdx] = list.filter((t) => !(t.node === tgt && t.index === inIdx && t.type === type));
  return cleanConnections(next);
}

export function removeNodes(d: Draft, names: string[]): Draft {
  const gone = new Set(names);
  const connections: Connections = {};
  for (const [src, byType] of Object.entries(d.connections)) {
    if (gone.has(src)) continue;
    connections[src] = {};
    for (const [type, outs] of Object.entries(byType)) {
      connections[src][type] = outs.map((ts) => (ts ?? []).filter((t) => !gone.has(t.node)));
    }
  }
  const pinData = d.pinData ? Object.fromEntries(Object.entries(d.pinData).filter(([k]) => !gone.has(k))) : undefined;
  return { ...d, nodes: d.nodes.filter((n) => !gone.has(n.name)), connections: cleanConnections(connections), pinData };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renameInValue(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') {
    if (!value.includes(from)) return value;
    const f = escapeRe(from);
    return value
      .replace(new RegExp(`\\$\\((['"])${f}\\1\\)`, 'g'), (_m, q) => `$(${q}${to}${q})`)
      .replace(new RegExp(`\\$node\\[(['"])${f}\\1\\]`, 'g'), (_m, q) => `$node[${q}${to}${q}]`)
      .replace(new RegExp(`\\$items\\((['"])${f}\\1`, 'g'), (_m, q) => `$items(${q}${to}${q}`);
  }
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameInValue(v, from, to)]));
  }
  return value;
}

export function renameNode(d: Draft, from: string, to: string): Draft {
  if (from === to || d.nodes.some((n) => n.name === to)) return d;
  const nodes = d.nodes.map((n) => ({
    ...n,
    name: n.name === from ? to : n.name,
    parameters: renameInValue(n.parameters, from, to) as N8nNode['parameters'],
  }));
  const connections: Connections = {};
  for (const [src, byType] of Object.entries(d.connections)) {
    const key = src === from ? to : src;
    connections[key] = {};
    for (const [type, outs] of Object.entries(byType)) {
      connections[key][type] = outs.map((ts) => (ts ?? []).map((t) => (t.node === from ? { ...t, node: to } : t)));
    }
  }
  let pinData = d.pinData;
  if (pinData && from in pinData) {
    pinData = { ...pinData, [to]: pinData[from] };
    delete pinData[from];
  }
  return { ...d, nodes, connections, pinData };
}

/** Adds nodes from an n8n clipboard payload, renaming on collision and offsetting positions. */
export function pasteNodes(d: Draft, clip: { nodes: N8nNode[]; connections?: Connections }, offset: [number, number]): { draft: Draft; names: string[] } {
  const taken = new Set(d.nodes.map((n) => n.name));
  const map = new Map<string, string>();
  const added: N8nNode[] = [];
  for (const n of clip.nodes) {
    const name = uniqueName(n.name, taken);
    taken.add(name);
    map.set(n.name, name);
    const copy: N8nNode = { ...structuredClone(n), id: newId(), name, position: [n.position[0] + offset[0], n.position[1] + offset[1]] };
    if (copy.webhookId) copy.webhookId = newId();
    added.push(copy);
  }
  let connections = d.connections;
  for (const [src, byType] of Object.entries(clip.connections || {})) {
    if (!map.has(src)) continue;
    for (const [type, outs] of Object.entries(byType)) {
      outs.forEach((ts, oi) => (ts ?? []).forEach((t) => {
        if (map.has(t.node)) connections = addConnection(connections, map.get(src)!, type, oi, map.get(t.node)!, t.index);
      }));
    }
  }
  return { draft: { ...d, nodes: [...d.nodes, ...added], connections }, names: added.map((n) => n.name) };
}

export function copyPayload(d: Draft, names: string[]): { nodes: N8nNode[]; connections: Connections } {
  const set = new Set(names);
  const nodes = d.nodes.filter((n) => set.has(n.name));
  const connections: Connections = {};
  for (const [src, byType] of Object.entries(d.connections)) {
    if (!set.has(src)) continue;
    for (const [type, outs] of Object.entries(byType)) {
      const kept = outs.map((ts) => (ts ?? []).filter((t) => set.has(t.node)));
      if (kept.some((k) => k.length)) (connections[src] ||= {})[type] = kept;
    }
  }
  return { nodes, connections };
}

function pickKeys(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Body for PUT/POST /workflows — strips everything the public API rejects. */
export function toSaveBody(d: Draft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: d.name.trim() || 'Untitled workflow',
    nodes: d.nodes.map((n) => pickKeys(n as Record<string, unknown>, NODE_KEYS)),
    connections: cleanConnections(d.connections),
    settings: pickKeys(d.settings || {}, SETTINGS_KEYS),
  };
  if (d.staticData && typeof d.staticData === 'object') body.staticData = d.staticData;
  if (d.pinData && Object.keys(d.pinData).length) body.pinData = d.pinData;
  if (d.description !== undefined) body.description = d.description;
  return body;
}

function nodeSignature(n: N8nNode) {
  return JSON.stringify([n.type, n.typeVersion, n.parameters, n.credentials ?? null, !!n.disabled, n.onError ?? null]);
}

export interface WorkflowDiff {
  added: string[];
  removed: string[];
  changed: string[];
  moved: string[];
  connectionsChanged: boolean;
}

export function diffWorkflows(from: Pick<Draft, 'nodes' | 'connections'>, to: Pick<Draft, 'nodes' | 'connections'>): WorkflowDiff {
  const a = new Map(from.nodes.map((n) => [n.name, n]));
  const b = new Map(to.nodes.map((n) => [n.name, n]));
  const diff: WorkflowDiff = { added: [], removed: [], changed: [], moved: [], connectionsChanged: false };
  for (const [name, n] of b) {
    const old = a.get(name);
    if (!old) diff.added.push(name);
    else if (nodeSignature(old) !== nodeSignature(n)) diff.changed.push(name);
    else if (old.position[0] !== n.position[0] || old.position[1] !== n.position[1]) diff.moved.push(name);
  }
  for (const name of a.keys()) if (!b.has(name)) diff.removed.push(name);
  diff.connectionsChanged = JSON.stringify(cleanConnections(from.connections)) !== JSON.stringify(cleanConnections(to.connections));
  return diff;
}

/** Distinct node types in rough flow order (triggers first, then left→right), sticky notes excluded. */
export function moduleTypes(nodes: N8nNode[]): string[] {
  const sorted = nodes
    .filter((n) => n.type !== STICKY)
    .sort((x, y) => Number(isTriggerType(y.type)) - Number(isTriggerType(x.type)) || x.position[0] - y.position[0] || x.position[1] - y.position[1]);
  return [...new Set(sorted.map((n) => n.type))];
}

/** Names of nodes that feed `name` through main connections, nearest first. */
export function ancestors(conns: Connections, name: string): string[] {
  const parents = new Map<string, string[]>();
  for (const [src, byType] of Object.entries(conns)) {
    for (const ts of byType.main || []) for (const t of ts ?? []) {
      if (!parents.has(t.node)) parents.set(t.node, []);
      parents.get(t.node)!.push(src);
    }
  }
  const out: string[] = [];
  const queue = [...(parents.get(name) || [])];
  while (queue.length) {
    const n = queue.shift()!;
    if (out.includes(n) || n === name) continue;
    out.push(n);
    queue.push(...(parents.get(n) || []));
  }
  return out;
}
