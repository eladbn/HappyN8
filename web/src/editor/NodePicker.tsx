import { useMemo, useState } from 'react';
import type { N8nNode, NodeTypeSummary } from '../api/types';
import { Icon } from '../components/Icon';
import { Modal, NodeIcon } from '../components/ui';
import { useCatalog } from '../lib/catalog';
import { aiLabel, guessSubnodeOutput } from '../lib/ports';
import { addConnection, isTriggerType, newId, uniqueName, type Draft } from '../lib/workflow';
import type { AddRequest } from './Canvas';

type Cat = 'all' | 'trigger' | 'ai' | 'apps' | 'core';

/** Used when the node catalog is unavailable (no n8n login configured). */
const FALLBACK: NodeTypeSummary[] = [
  ['n8n-nodes-base.manualTrigger', 'Manual trigger', 1, true],
  ['n8n-nodes-base.scheduleTrigger', 'Schedule trigger', 1.2, true],
  ['n8n-nodes-base.webhook', 'Webhook', 2, true],
  ['n8n-nodes-base.httpRequest', 'HTTP Request', 4.2, false],
  ['n8n-nodes-base.code', 'Code', 2, false],
  ['n8n-nodes-base.set', 'Edit Fields (Set)', 3.4, false],
  ['n8n-nodes-base.if', 'If', 2.2, false],
  ['n8n-nodes-base.switch', 'Switch', 3.2, false],
  ['n8n-nodes-base.merge', 'Merge', 3.1, false],
  ['n8n-nodes-base.wait', 'Wait', 1.1, false],
  ['n8n-nodes-base.noOp', 'No Operation', 1, false],
  ['n8n-nodes-base.respondToWebhook', 'Respond to Webhook', 1.1, false],
  ['n8n-nodes-base.stickyNote', 'Sticky note', 1, false],
].map(([name, displayName, v, trig]) => ({ name: name as string, displayName: displayName as string, versions: [v as number], defaultVersion: v as number, isTrigger: trig as boolean, hasWebhooks: name === 'n8n-nodes-base.webhook' }));

function outputTypes(n: NodeTypeSummary): string[] {
  if (Array.isArray(n.outputs)) return n.outputs.map((o) => (typeof o === 'string' ? o : o.type));
  const g = guessSubnodeOutput(n.name);
  return g ? [g] : ['main'];
}

function category(n: NodeTypeSummary): Cat {
  if (n.isTrigger || isTriggerType(n.name)) return 'trigger';
  const cats = n.codex?.categories ?? [];
  if (n.name.startsWith('@n8n/n8n-nodes-langchain') || cats.includes('AI') || cats.includes('Langchain')) return 'ai';
  if (cats.includes('Core Nodes') || cats.includes('Flow') || cats.includes('Data Transformation') || cats.includes('Utility')) return 'core';
  return 'apps';
}

export function NodePicker({ request, draft, onClose, onPick }: {
  request: AddRequest;
  draft: Draft;
  onClose: () => void;
  onPick: (next: Draft, newName: string) => void;
}) {
  const catalog = useCatalog();
  const aiType = request.from?.dir === 'in' && request.from.type !== 'main' ? request.from.type : null;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>(draft.nodes.length === 0 ? 'trigger' : 'all');

  const source = catalog.available ? catalog.list : FALLBACK;
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return source
      .filter((n) => !n.hidden)
      .filter((n) => {
        const outs = outputTypes(n);
        if (aiType) return outs.includes(aiType);
        if (request.from?.dir === 'out') return outs.includes('main') && !(n.isTrigger || isTriggerType(n.name));
        return true;
      })
      .filter((n) => aiType || cat === 'all' || category(n) === cat)
      .filter((n) => !s || n.displayName.toLowerCase().includes(s) || n.name.toLowerCase().includes(s)
        || (n.codex?.alias ?? []).some((a) => a.toLowerCase().includes(s)) || (n.description ?? '').toLowerCase().includes(s))
      .sort((a, b) => {
        if (s) {
          const as = a.displayName.toLowerCase().startsWith(s) ? 0 : 1;
          const bs = b.displayName.toLowerCase().startsWith(s) ? 0 : 1;
          if (as !== bs) return as - bs;
        }
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 150);
  }, [source, q, cat, aiType, request.from]);

  function pick(t: NodeTypeSummary) {
    const name = uniqueName(t.defaults?.name || t.displayName, draft.nodes.map((n) => n.name));
    const node: N8nNode = {
      id: newId(), name, type: t.name, typeVersion: t.defaultVersion, position: request.position, parameters: {},
    };
    if (t.hasWebhooks) {
      node.webhookId = newId();
      if (t.name === 'n8n-nodes-base.webhook') node.parameters = { path: node.webhookId };
    }
    if (t.name === 'n8n-nodes-base.stickyNote') node.parameters = { content: '## Note\nDouble-click to edit', width: 260, height: 160 };
    let next: Draft = { ...draft, nodes: [...draft.nodes, node] };
    const f = request.from;
    if (f?.dir === 'out' && !(t.isTrigger || isTriggerType(t.name))) next = { ...next, connections: addConnection(next.connections, f.name, 'main', f.index, name, 0) };
    if (f?.dir === 'in' && aiType) next = { ...next, connections: addConnection(next.connections, name, aiType, 0, f.name, f.index) };
    onPick(next, name);
  }

  return (
    <Modal title={aiType ? `Add ${aiLabel(aiType).toLowerCase()} to ${request.from?.name}` : request.from ? `Add module after ${request.from.name}` : 'Add module'} onClose={onClose} wide>
      <label className="search" style={{ minWidth: 0 }}>
        <Icon name="search" size={16} />
        <span className="sr-only">Search modules</span>
        <input autoFocus type="search" placeholder="Search apps and modules (Slack, HTTP, OpenAI…)" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); }} />
      </label>
      {!aiType && (
        <div className="seg" role="tablist" aria-label="Category">
          {([['all', 'All'], ['trigger', 'Triggers'], ['apps', 'Apps'], ['ai', 'AI'], ['core', 'Core & flow']] as Array<[Cat, string]>).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={cat === k} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
      )}
      {!catalog.available && (
        <div className="notice accent">Only basic modules are listed. Set N8N_EMAIL and N8N_PASSWORD on the HappyN8 container to unlock all of n8n's modules, with their logos and forms.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {results.map((t) => (
          <button key={t.name} type="button" onClick={() => pick(t)} className="card"
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, textAlign: 'left', cursor: 'pointer', borderRadius: 12 }}>
            <NodeIcon type={t.name} size={38} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{t.displayName}</span>
              {t.description && <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</span>}
            </span>
          </button>
        ))}
      </div>
      {results.length === 0 && <div className="empty">No matching modules.</div>}
    </Modal>
  );
}
