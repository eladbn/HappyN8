import type { Connections, N8nNode, NodeTypeSummary, PortSpec } from '../api/types';
import { isTriggerType } from './workflow';

export interface Port {
  type: string;
  index: number;
  label?: string;
  required?: boolean;
}

export interface NodePorts {
  inputs: Port[];
  outputs: Port[];
}

const AGENT = '@n8n/n8n-nodes-langchain.agent';
const AI_LABELS: Record<string, string> = {
  ai_languageModel: 'Model',
  ai_memory: 'Memory',
  ai_tool: 'Tool',
  ai_outputParser: 'Parser',
  ai_embedding: 'Embedding',
  ai_document: 'Document',
  ai_textSplitter: 'Splitter',
  ai_retriever: 'Retriever',
  ai_vectorStore: 'Vector store',
  ai_reranker: 'Reranker',
};

export function aiLabel(type: string) {
  return AI_LABELS[type] || type.replace(/^ai_/, '');
}

function fromSpec(list: PortSpec[], names?: string[]): Port[] {
  const counters: Record<string, number> = {};
  return list.map((s, i) => {
    const type = typeof s === 'string' ? s : s.type;
    const index = counters[type] ?? 0;
    counters[type] = index + 1;
    const label = typeof s === 'object' && s.displayName ? s.displayName : names?.[i];
    return { type, index, label, required: typeof s === 'object' ? s.required : undefined };
  });
}

/** Guesses the AI output type of a LangChain sub-node from its type name. */
export function guessSubnodeOutput(type: string): string | null {
  if (!type.startsWith('@n8n/n8n-nodes-langchain.')) return null;
  const t = type.split('.')[1];
  if (/^lmChat|^lm[A-Z]/.test(t)) return 'ai_languageModel';
  if (/^memory/.test(t)) return 'ai_memory';
  if (/^tool|Tool$/.test(t)) return 'ai_tool';
  if (/^embeddings/.test(t)) return 'ai_embedding';
  if (/^outputParser/.test(t)) return 'ai_outputParser';
  if (/^textSplitter/.test(t)) return 'ai_textSplitter';
  if (/^document/.test(t)) return 'ai_document';
  if (/^retriever/.test(t)) return 'ai_retriever';
  if (/^reranker/.test(t)) return 'ai_reranker';
  return null;
}

function maxIndex(conns: Connections, name: string, type: string): number {
  return (conns[name]?.[type]?.length ?? 0) - 1;
}

function incomingByType(conns: Connections, name: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const byType of Object.values(conns)) {
    for (const [type, outs] of Object.entries(byType)) {
      for (const ts of outs) for (const t of ts ?? []) {
        if (t.node === name) out.set(type, Math.max(out.get(type) ?? 0, t.index + 1));
      }
    }
  }
  return out;
}

function switchOutputs(node: N8nNode): Port[] | null {
  const p = node.parameters as Record<string, any>;
  if (p.mode === 'expression') {
    const n = Number(p.numberOutputs ?? 4);
    return Array.from({ length: n }, (_, i) => ({ type: 'main', index: i, label: String(i) }));
  }
  const rules: any[] = p.rules?.values ?? p.rules?.rules ?? [];
  if (!Array.isArray(rules)) return null;
  const ports: Port[] = rules.map((r, i) => ({ type: 'main', index: i, label: r?.outputKey || String(i) }));
  if (p.options?.fallbackOutput === 'extra') ports.push({ type: 'main', index: ports.length, label: 'Fallback' });
  return ports.length ? ports : null;
}

/** Works out a node's input and output handles from its catalog entry, parameters and existing connections. */
export function computePorts(node: N8nNode, summary: NodeTypeSummary | undefined, conns: Connections): NodePorts {
  const incoming = incomingByType(conns, node.name);
  let inputs: Port[] = [];
  let outputs: Port[] = [];

  if (summary && Array.isArray(summary.inputs)) inputs = fromSpec(summary.inputs, summary.inputNames);
  else if (node.type === AGENT) {
    inputs = [{ type: 'main', index: 0 }, { type: 'ai_languageModel', index: 0, required: true }, { type: 'ai_memory', index: 0 }, { type: 'ai_tool', index: 0 }];
    if ((node.parameters as Record<string, unknown>).hasOutputParser) inputs.push({ type: 'ai_outputParser', index: 0 });
  } else if (guessSubnodeOutput(node.type)) inputs = [];
  else if (summary?.isTrigger || isTriggerType(node.type)) inputs = [];
  else if (node.type === 'n8n-nodes-base.merge') {
    const n = Number((node.parameters as Record<string, unknown>).numberInputs ?? 2);
    inputs = Array.from({ length: n }, (_, i) => ({ type: 'main', index: i, label: `Input ${i + 1}` }));
  } else if (node.type.startsWith('@n8n/n8n-nodes-langchain.chain')) {
    inputs = [{ type: 'main', index: 0 }, { type: 'ai_languageModel', index: 0, required: true }];
  } else inputs = [{ type: 'main', index: 0 }];

  if (summary && Array.isArray(summary.outputs)) outputs = fromSpec(summary.outputs, summary.outputNames);
  else if (node.type === 'n8n-nodes-base.if') outputs = [{ type: 'main', index: 0, label: 'true' }, { type: 'main', index: 1, label: 'false' }];
  else if (node.type === 'n8n-nodes-base.switch') outputs = switchOutputs(node) ?? [{ type: 'main', index: 0 }];
  else {
    const ai = guessSubnodeOutput(node.type);
    const usedTypes = Object.keys(conns[node.name] || {});
    if (ai && node.type !== AGENT && !node.type.includes('.chain')) outputs = [{ type: usedTypes.find((t) => t !== 'main') ?? ai, index: 0 }];
    else if (usedTypes.length && usedTypes.every((t) => t !== 'main')) outputs = usedTypes.map((t) => ({ type: t, index: 0 }));
    else outputs = [{ type: 'main', index: 0 }];
  }

  // Error output when "On error → continue (using error output)".
  if (node.onError === 'continueErrorOutput' && outputs.every((o) => o.type === 'main')) {
    outputs = [...outputs, { type: 'main', index: outputs.length, label: 'error' }];
  }

  // Make sure every connection that exists has a handle to attach to.
  for (const [type, count] of incoming) {
    const have = inputs.filter((p) => p.type === type).length;
    for (let i = have; i < count; i += 1) inputs.push({ type, index: i });
  }
  for (const type of Object.keys(conns[node.name] || {})) {
    const have = outputs.filter((p) => p.type === type).length;
    const need = maxIndex(conns, node.name, type) + 1;
    for (let i = have; i < need; i += 1) outputs.push({ type, index: i });
  }
  return { inputs, outputs };
}

export function handleId(dir: 'in' | 'out', type: string, index: number) {
  return `${dir}:${type}:${index}`;
}

export function parseHandle(id: string | null | undefined): { type: string; index: number } | null {
  if (!id) return null;
  const [, type, index] = id.split(':');
  return type ? { type, index: Number(index) || 0 } : null;
}
