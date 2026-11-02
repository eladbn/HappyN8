import { describe, expect, it } from 'vitest';
import type { Execution, N8nNode, NodeProperty } from '../api/types';
import {
  addConnection, ancestors, copyPayload, diffWorkflows, moduleTypes, pasteNodes, removeConnection, removeNodes,
  renameNode, toSaveBody, uniqueName, type Draft,
} from './workflow';
import { computePorts, parseHandle } from './ports';
import { isDisplayed, nodeSubtitle, setPath, visibleProps, type DisplayContext } from './params';
import { accessor, fieldPaths, nodeIO, nodeRunStates } from './execution';

const node = (name: string, type = 'n8n-nodes-base.set', x = 0, extra: Partial<N8nNode> = {}): N8nNode => ({
  id: name, name, type, typeVersion: 1, position: [x, 0], parameters: {}, ...extra,
});

function draft(): Draft {
  return {
    name: 'wf',
    nodes: [node('Webhook', 'n8n-nodes-base.webhook', 0), node('Set', 'n8n-nodes-base.set', 200, { parameters: { v: "={{ $('Webhook').item.json.a }}" } }), node('Slack', 'n8n-nodes-base.slack', 400)],
    connections: {
      Webhook: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
      Set: { main: [[{ node: 'Slack', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1', bogus: 1 },
    pinData: { Webhook: [{ json: {} }] },
  };
}

describe('workflow ops', () => {
  it('makes unique names', () => {
    expect(uniqueName('Set', ['Set'])).toBe('Set1');
    expect(uniqueName('Set1', ['Set', 'Set1'])).toBe('Set2');
    expect(uniqueName('Slack', ['Set'])).toBe('Slack');
  });

  it('adds and removes connections without duplicates', () => {
    let c = addConnection({}, 'A', 'main', 1, 'B', 0);
    c = addConnection(c, 'A', 'main', 1, 'B', 0);
    expect(c.A.main).toEqual([[], [{ node: 'B', type: 'main', index: 0 }]]);
    expect(removeConnection(c, 'A', 'main', 1, 'B', 0)).toEqual({});
  });

  it('removes nodes and their connections', () => {
    const d = removeNodes(draft(), ['Set']);
    expect(d.nodes.map((n) => n.name)).toEqual(['Webhook', 'Slack']);
    expect(d.connections).toEqual({});
  });

  it('renames nodes in connections, pin data and expressions', () => {
    const d = renameNode(draft(), 'Webhook', 'Incoming');
    expect(d.connections.Incoming.main[0]![0].node).toBe('Set');
    expect(d.nodes[1].parameters.v).toBe("={{ $('Incoming').item.json.a }}");
    expect(Object.keys(d.pinData!)).toEqual(['Incoming']);
    expect(renameNode(draft(), 'Webhook', 'Set')).toEqual(draft()); // collision → unchanged
  });

  it('copies and pastes nodes with fresh names and internal links', () => {
    const d = draft();
    const clip = copyPayload(d, ['Set', 'Slack']);
    expect(Object.keys(clip.connections)).toEqual(['Set']);
    const { draft: next, names } = pasteNodes(d, clip, [50, 50]);
    expect(names).toEqual(['Set1', 'Slack1']);
    expect(next.connections.Set1.main[0]![0].node).toBe('Slack1');
  });

  it('builds a save body the public API accepts', () => {
    const d = draft();
    (d.nodes[0] as N8nNode & { extra?: number }).extra = 1;
    const body = toSaveBody(d) as { settings: object; nodes: object[] };
    expect(body.settings).toEqual({ executionOrder: 'v1' });
    expect(body.nodes[0]).not.toHaveProperty('extra');
  });

  it('diffs versions', () => {
    const a = draft();
    const b = removeNodes(draft(), ['Slack']);
    b.nodes[0] = { ...b.nodes[0], parameters: { path: 'x' } };
    const diff = diffWorkflows(a, b);
    expect(diff).toMatchObject({ removed: ['Slack'], changed: ['Webhook'], connectionsChanged: true });
  });

  it('orders module types with triggers first', () => {
    expect(moduleTypes([node('S', 'x.slack', 0), node('T', 'n8n-nodes-base.webhook', 500)])).toEqual(['n8n-nodes-base.webhook', 'x.slack']);
  });

  it('finds ancestors', () => {
    expect(ancestors(draft().connections, 'Slack')).toEqual(['Set', 'Webhook']);
  });
});

describe('ports', () => {
  it('gives IF two labelled outputs and triggers no input', () => {
    const p = computePorts(node('If', 'n8n-nodes-base.if'), undefined, {});
    expect(p.outputs.map((o) => o.label)).toEqual(['true', 'false']);
    expect(computePorts(node('W', 'n8n-nodes-base.webhook'), undefined, {}).inputs).toEqual([]);
  });

  it('wires AI agents and sub-nodes', () => {
    const conns = { Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] } };
    const agent = computePorts(node('Agent', '@n8n/n8n-nodes-langchain.agent'), undefined, conns);
    expect(agent.inputs.map((i) => i.type)).toContain('ai_tool');
    const model = computePorts(node('Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi'), undefined, conns);
    expect(model.outputs).toEqual([{ type: 'ai_languageModel', index: 0 }]);
    expect(model.inputs).toEqual([]);
  });

  it('adds handles for connections beyond the catalog', () => {
    const conns = { A: { main: [[], [], [{ node: 'B', type: 'main', index: 0 }]] } };
    expect(computePorts(node('A'), undefined, conns).outputs).toHaveLength(3);
    expect(parseHandle('out:main:2')).toEqual({ type: 'main', index: 2 });
  });
});

describe('params', () => {
  const props = [
    { name: 'resource', displayName: 'Resource', type: 'options', default: 'message', options: [{ name: 'Message', value: 'message' }, { name: 'Channel', value: 'channel' }] },
    { name: 'operation', displayName: 'Operation', type: 'options', default: 'post', displayOptions: { show: { resource: ['message'] } }, options: [{ name: 'Send', value: 'post' }] },
    { name: 'operation', displayName: 'Operation', type: 'options', default: 'create', displayOptions: { show: { resource: ['channel'] } }, options: [{ name: 'Create', value: 'create' }] },
    { name: 'newer', displayName: 'Newer', type: 'string', displayOptions: { show: { '@version': [{ _cnd: { gte: 2 } }] } } },
  ] as NodeProperty[];
  const ctx = (root: Record<string, unknown>, v = 1): DisplayContext => ({ root, parent: root, typeVersion: v, rootProps: props });

  it('falls back to defaults when evaluating displayOptions', () => {
    expect(visibleProps(props, ctx({})).map((p) => p.default)).toEqual(['message', 'post']);
    expect(visibleProps(props, ctx({ resource: 'channel' }))[1].default).toBe('create');
  });

  it('handles version conditions', () => {
    expect(isDisplayed(props[3], ctx({}, 1))).toBe(false);
    expect(isDisplayed(props[3], ctx({}, 2))).toBe(true);
  });

  it('builds subtitles from option labels', () => {
    expect(nodeSubtitle({}, props, 1)).toBe('Send · Message');
  });

  it('sets nested paths immutably', () => {
    const a = { x: { y: 1 } };
    const b = setPath(a, ['x', 'z'], 2);
    expect(b).toEqual({ x: { y: 1, z: 2 } });
    expect(a).toEqual({ x: { y: 1 } });
    expect(setPath(b, ['x', 'y'], undefined)).toEqual({ x: { z: 2 } });
  });
});

describe('execution parsing', () => {
  const exec = {
    id: '1', mode: 'manual', status: 'error', startedAt: null, stoppedAt: null, workflowId: 'w',
    data: { resultData: { runData: {
      Webhook: [{ startTime: 1, executionTime: 5, data: { main: [[{ json: { a: 1, user: { name: 'x' } } }]] } }],
      Set: [{ startTime: 2, executionTime: 3, source: [{ previousNode: 'Webhook' }], error: { message: 'boom' } }],
    } } },
  } as unknown as Execution;

  it('summarises node states', () => {
    const s = nodeRunStates(exec);
    expect(s.get('Webhook')).toMatchObject({ state: 'success', items: 1 });
    expect(s.get('Set')).toMatchObject({ state: 'error', error: 'boom' });
  });

  it('reconstructs input from the parent', () => {
    const io = nodeIO(exec, 'Set')!;
    expect(io.inputFrom).toBe('Webhook');
    expect(io.input[0].json.a).toBe(1);
  });

  it('lists field paths and accessors', () => {
    expect(fieldPaths([{ json: { a: 1, user: { name: 'x' } } }]).map((f) => f.path)).toEqual(['a', 'user.name']);
    expect(accessor('user.first name')).toBe('.user["first name"]');
  });
});
