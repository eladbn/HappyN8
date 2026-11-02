import type { Execution, TaskData } from '../api/types';

export type RunState = 'success' | 'error' | 'running' | 'waiting';

export interface NodeRunInfo {
  state: RunState;
  items: number;
  runs: number;
  timeMs: number;
  startTime: number;
  error?: string;
}

export type Item = { json: Record<string, unknown>; binary?: Record<string, unknown> };

export function runData(exec: Execution | undefined | null): Record<string, TaskData[]> {
  return exec?.data?.resultData?.runData ?? {};
}

function countItems(task: TaskData): number {
  let n = 0;
  for (const outputs of Object.values(task.data || {})) for (const out of outputs || []) n += out?.length ?? 0;
  return n;
}

/** Per-node status summary for overlaying an execution on the canvas. */
export function nodeRunStates(exec: Execution | undefined | null): Map<string, NodeRunInfo> {
  const out = new Map<string, NodeRunInfo>();
  const rd = runData(exec);
  for (const [name, tasks] of Object.entries(rd)) {
    if (!tasks?.length) continue;
    const last = tasks[tasks.length - 1];
    const err = tasks.find((t) => t.error)?.error;
    let state: RunState = 'success';
    if (err || last.executionStatus === 'error') state = 'error';
    else if (last.executionStatus === 'running') state = 'running';
    else if (last.executionStatus === 'waiting') state = 'waiting';
    out.set(name, {
      state,
      items: tasks.reduce((s, t) => s + countItems(t), 0),
      runs: tasks.length,
      timeMs: tasks.reduce((s, t) => s + (t.executionTime || 0), 0),
      startTime: tasks[0].startTime,
      error: err ? err.message || err.description || 'Error' : undefined,
    });
  }
  const top = exec?.data?.resultData?.error;
  const errNode = top?.node?.name;
  if (errNode && !out.has(errNode)) {
    out.set(errNode, { state: 'error', items: 0, runs: 1, timeMs: 0, startTime: Number.MAX_SAFE_INTEGER, error: top?.message });
  }
  if (exec?.status === 'running' || exec?.status === 'waiting') {
    const lastName = exec.data?.resultData?.lastNodeExecuted;
    const info = lastName ? out.get(lastName) : undefined;
    if (info && info.state === 'success' && exec.status === 'waiting') info.state = 'waiting';
  }
  return out;
}

/** Nodes in the order they ran. */
export function runOrder(exec: Execution | undefined | null): Array<{ name: string; info: NodeRunInfo }> {
  return [...nodeRunStates(exec).entries()]
    .map(([name, info]) => ({ name, info }))
    .sort((a, b) => a.info.startTime - b.info.startTime);
}

export interface NodeIO {
  input: Item[];
  inputFrom?: string;
  outputs: Item[][];
  outputType: string;
  error?: TaskData['error'];
  runCount: number;
}

/** Input and output items of one node run. Input is reconstructed from the parent's output. */
export function nodeIO(exec: Execution | undefined | null, name: string, runIndex = 0): NodeIO | null {
  const rd = runData(exec);
  const tasks = rd[name];
  if (!tasks?.length) return null;
  const task = tasks[Math.min(runIndex, tasks.length - 1)];
  const outputType = Object.keys(task.data || {})[0] || 'main';
  const outputs = (task.data?.[outputType] || []).map((o) => (o || []) as Item[]);
  let input: Item[] = [];
  let inputFrom: string | undefined;
  if (task.inputOverride) {
    const k = Object.keys(task.inputOverride)[0];
    input = ((task.inputOverride[k] || [])[0] || []) as Item[];
  } else {
    const src = task.source?.[0];
    if (src?.previousNode) {
      inputFrom = src.previousNode;
      const parent = rd[src.previousNode];
      const pTask = parent?.[Math.min(runIndex, (parent?.length ?? 1) - 1)];
      input = ((pTask?.data?.main || [])[src.previousNodeOutput ?? 0] || []) as Item[];
    }
  }
  return { input, inputFrom, outputs, outputType, error: task.error, runCount: tasks.length };
}

/** Collects dotted field paths from sample items, for the data-mapping picker. */
export function fieldPaths(items: Item[], max = 200): Array<{ path: string; sample: unknown }> {
  const out = new Map<string, unknown>();
  const walk = (val: unknown, prefix: string, depth: number) => {
    if (out.size >= max) return;
    if (val && typeof val === 'object' && !Array.isArray(val) && depth < 4) {
      for (const [k, v] of Object.entries(val)) walk(v, prefix ? `${prefix}.${k}` : k, depth + 1);
    } else if (prefix && !out.has(prefix)) out.set(prefix, val);
  };
  for (const it of items.slice(0, 5)) walk(it.json, '', 0);
  return [...out.entries()].map(([path, sample]) => ({ path, sample }));
}

export function accessor(path: string): string {
  return path
    .split('.')
    .map((p) => (/^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`))
    .join('');
}

export function executionDuration(e: Pick<Execution, 'startedAt' | 'stoppedAt'>): number | null {
  if (!e.startedAt) return null;
  const end = e.stoppedAt ? Date.parse(e.stoppedAt) : Date.now();
  return end - Date.parse(e.startedAt);
}
