import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyEdgeChanges, applyNodeChanges,
  useReactFlow, type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react';
import type { N8nNode } from '../api/types';
import { useCatalog } from '../lib/catalog';
import type { NodeRunInfo } from '../lib/execution';
import { nodeSubtitle } from '../lib/params';
import { computePorts, handleId, parseHandle } from '../lib/ports';
import { STICKY, addConnection, copyPayload, isTriggerType, pasteNodes, removeConnection, removeNodes, type Draft } from '../lib/workflow';
import { FlowNode, StickyNode, type FlowNodeData } from './FlowNode';

const nodeTypes = { flow: FlowNode, sticky: StickyNode };

export interface AddRequest {
  from: { name: string; type: string; index: number; dir: 'in' | 'out' } | null;
  position: [number, number];
}

interface Props {
  draft: Draft;
  update?: (fn: (d: Draft) => Draft, history?: boolean) => void;
  readOnly?: boolean;
  overlay?: Map<string, NodeRunInfo> | null;
  activeNode?: string | null;
  onOpenNode?: (name: string | null) => void;
  onRequestAdd?: (req: AddRequest) => void;
  fitKey?: string;
  /** Version-compare marks drawn as rings on nodes. */
  marks?: Map<string, 'changed' | 'removed' | 'added'>;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function Inner({ draft, update, readOnly, overlay, activeNode, onOpenNode, onRequestAdd, fitKey, marks }: Props) {
  const catalog = useCatalog();
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const requestAdd = useCallback((from: AddRequest['from']) => {
    if (!onRequestAdd) return;
    if (from) {
      const src = draft.nodes.find((n) => n.name === from.name);
      const [x, y] = src?.position ?? [0, 0];
      const position: [number, number] = from.dir === 'out' ? [x + 240, y + from.index * 140] : [x - 60 + from.index * 40, y + 260];
      onRequestAdd({ from, position });
    } else {
      const rect = wrapper.current?.getBoundingClientRect();
      const p = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
      onRequestAdd({ from: null, position: [Math.round(p.x - 75), Math.round(p.y - 36)] });
    }
  }, [draft.nodes, onRequestAdd, rf]);

  const built = useMemo<Node[]>(() => draft.nodes.map((n: N8nNode) => {
    if (n.type === STICKY) {
      const p = n.parameters as { width?: number; height?: number };
      return {
        id: n.name, type: 'sticky', position: { x: n.position[0], y: n.position[1] }, zIndex: -1,
        style: { width: p.width ?? 240, height: p.height ?? 160 },
        data: {
          node: n, readOnly,
          onResize: (name: string, w: number, h: number) => update?.((d) => ({ ...d, nodes: d.nodes.map((x) => (x.name === name ? { ...x, parameters: { ...x.parameters, width: w, height: h } } : x)) })),
        },
      };
    }
    const summary = catalog.get(n.type);
    const data: FlowNodeData = {
      node: n,
      ports: computePorts(n, summary, draft.connections),
      subtitle: nodeSubtitle(n.parameters, undefined, n.typeVersion),
      run: overlay?.get(n.name),
      mark: marks?.get(n.name),
      trigger: summary?.isTrigger ?? isTriggerType(n.type),
      onAdd: readOnly ? undefined : requestAdd,
      readOnly,
    };
    return { id: n.name, type: 'flow', position: { x: n.position[0], y: n.position[1] }, data };
  }), [draft.nodes, draft.connections, catalog, overlay, readOnly, requestAdd, update, marks]);

  const builtEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const [src, byType] of Object.entries(draft.connections)) {
      for (const [type, outs] of Object.entries(byType)) {
        outs.forEach((targets, oi) => (targets ?? []).forEach((t) => {
          const ran = overlay?.get(src) && overlay?.get(t.node);
          const ai = type !== 'main';
          out.push({
            id: `${src}|${type}|${oi}|${t.node}|${t.index}`,
            source: src, target: t.node,
            sourceHandle: handleId('out', type, oi), targetHandle: handleId('in', t.type || type, t.index),
            style: { stroke: ran ? 'var(--ok)' : 'var(--edge)', strokeWidth: ai ? 2 : 3, strokeDasharray: ai ? '6 6' : '1 9', strokeLinecap: 'round' },
            interactionWidth: 18,
          });
        }));
      }
    }
    return out;
  }, [draft.connections, overlay]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return built.map((n) => {
        const o = old.get(n.id);
        return { ...n, selected: o?.selected ?? false, measured: o?.measured, style: n.style ?? o?.style };
      });
    });
  }, [built]);
  useEffect(() => {
    setEdges((prev) => {
      const sel = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      return builtEdges.map((e) => ({ ...e, selected: sel.has(e.id) }));
    });
  }, [builtEdges]);

  // Highlight the node whose panel is open, and bring it into view if the panel covers it.
  useEffect(() => {
    if (!activeNode) return undefined;
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === activeNode })));
    const t = setTimeout(() => {
      const n = rf.getNode(activeNode);
      const rect = wrapper.current?.getBoundingClientRect();
      if (!n || !rect) return;
      const p = rf.flowToScreenPosition({ x: n.position.x + 75, y: n.position.y + 36 });
      const margin = 90;
      if (p.x < rect.left + margin || p.x > rect.right - margin || p.y < rect.top + margin || p.y > rect.bottom - margin) {
        rf.setCenter(n.position.x + 75, n.position.y + 60, { zoom: rf.getZoom(), duration: 250 });
      }
    }, 80);
    return () => clearTimeout(t);
  }, [activeNode, rf]);

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1.1, duration: 0 }), 50);
    return () => clearTimeout(t);
  }, [fitKey, rf]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), es)), []);

  const onDelete = useCallback(({ nodes: dn, edges: de }: { nodes: Node[]; edges: Edge[] }) => {
    if (readOnly || !update) return;
    update((d) => {
      let next = dn.length ? removeNodes(d, dn.map((n) => n.id)) : d;
      for (const e of de) {
        const s = parseHandle(e.sourceHandle);
        const t = parseHandle(e.targetHandle);
        if (s && t) next = { ...next, connections: removeConnection(next.connections, e.source, s.type, s.index, e.target, t.index) };
      }
      return next;
    });
    if (dn.some((n) => n.id === activeNode)) onOpenNode?.(null);
  }, [readOnly, update, activeNode, onOpenNode]);

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const s = parseHandle(c.sourceHandle);
    const t = parseHandle(c.targetHandle);
    return !!s && !!t && s.type === t.type && c.source !== c.target;
  }, []);

  const onConnect = useCallback((c: Connection) => {
    const s = parseHandle(c.sourceHandle);
    const t = parseHandle(c.targetHandle);
    if (!s || !t || !update) return;
    update((d) => ({ ...d, connections: addConnection(d.connections, c.source, s.type, s.index, c.target, t.index) }));
  }, [update]);

  const onDragStop = useCallback((_e: unknown, _n: Node, moved: Node[]) => {
    if (!update) return;
    const pos = new Map(moved.map((n) => [n.id, [Math.round(n.position.x), Math.round(n.position.y)] as [number, number]]));
    update((d) => ({ ...d, nodes: d.nodes.map((n) => (pos.has(n.name) ? { ...n, position: pos.get(n.name)! } : n)) }));
  }, [update]);

  // Copy / paste in n8n's clipboard format, so nodes move between HappyN8 and the n8n editor.
  useEffect(() => {
    if (readOnly || !update) return undefined;
    const selectedNames = () => rf.getNodes().filter((n) => n.selected).map((n) => n.id);
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const names = selectedNames();
      if (!names.length) return;
      e.clipboardData?.setData('text/plain', JSON.stringify(copyPayload(draft, names), null, 2));
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      try {
        const clip = JSON.parse(text);
        if (!Array.isArray(clip?.nodes)) return;
        e.preventDefault();
        update((d) => pasteNodes(d, clip, [60, 60]).draft);
      } catch { /* not workflow JSON */ }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => { document.removeEventListener('copy', onCopy); document.removeEventListener('paste', onPaste); };
  }, [draft, readOnly, rf, update]);

  return (
    <div ref={wrapper} style={{ position: 'absolute', inset: 0 }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onDelete={onDelete}
        onConnect={onConnect} isValidConnection={isValidConnection} onNodeDragStop={onDragStop}
        onNodeClick={(_e, n) => onOpenNode?.(n.id)} onPaneClick={() => onOpenNode?.(null)}
        nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']} multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        minZoom={0.15} maxZoom={2} proOptions={{ hideAttribution: true }} fitView
        connectionRadius={28} snapToGrid snapGrid={[10, 10]}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="var(--grid-dot)" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable position="top-right" style={{ width: 160, height: 100 }} maskColor="rgba(120,120,140,0.15)" nodeColor="var(--border-strong)" />
      </ReactFlow>
      {!readOnly && draft.nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <button type="button" className="btn primary" style={{ pointerEvents: 'auto', height: 52, borderRadius: 26, padding: '0 24px' }} onClick={() => requestAdd(null)}>
            + Add the first module (a trigger)
          </button>
        </div>
      )}
      {!readOnly && <AddButton onClick={() => requestAdd(null)} />}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn primary" onClick={onClick} aria-label="Add module"
      style={{ position: 'absolute', left: 16, top: 16, zIndex: 5, borderRadius: 22, height: 44, padding: '0 18px', boxShadow: 'var(--shadow)' }}>
      + Add module
    </button>
  );
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
