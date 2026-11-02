import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import type { N8nNode } from '../api/types';
import { NodeIcon } from '../components/ui';
import type { NodeRunInfo } from '../lib/execution';
import { aiLabel, handleId, type NodePorts } from '../lib/ports';

export interface FlowNodeData extends Record<string, unknown> {
  node: N8nNode;
  ports: NodePorts;
  subtitle: string;
  run?: NodeRunInfo;
  mark?: 'changed' | 'removed' | 'added';
  trigger: boolean;
  onAdd?: (from: { name: string; type: string; index: number; dir: 'in' | 'out' }) => void;
  readOnly?: boolean;
}

const SIZE = 72;

function spread(i: number, n: number) {
  return `${((i + 1) / (n + 1)) * 100}%`;
}

function FlowNodeImpl({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const { node, ports, subtitle, run, trigger, onAdd, readOnly, mark } = data;
  const markColor = mark === 'changed' ? 'var(--warn)' : mark === 'removed' ? 'var(--bad)' : mark === 'added' ? 'var(--ok)' : null;
  const mainIn = ports.inputs.filter((p) => p.type === 'main');
  const aiIn = ports.inputs.filter((p) => p.type !== 'main');
  const mainOut = ports.outputs.filter((p) => p.type === 'main');
  const aiOut = ports.outputs.filter((p) => p.type !== 'main');
  const runRing = run?.state === 'error' ? 'var(--bad)' : run?.state === 'running' || run?.state === 'waiting' ? 'var(--accent)' : run ? 'var(--ok)' : null;

  return (
    <div className="fnode" style={{ width: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: node.disabled ? 0.45 : 1 }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <div style={{
          width: SIZE, height: SIZE, borderRadius: trigger ? '50% 24% 24% 50%' : '50%', display: 'grid', placeItems: 'center',
          background: 'var(--surface)', boxShadow: selected ? '0 0 0 3px var(--surface), 0 0 0 6px var(--accent)' : (markColor ?? runRing) ? `0 0 0 3px var(--surface), 0 0 0 5px ${markColor ?? runRing}` : '0 4px 14px rgba(22,24,43,0.16)',
        }}>
          <NodeIcon type={node.type} size={SIZE - 8} title={node.name} />
        </div>
        {run && (
          <span className="chip" title={run.error || `${run.items} items`} style={{ position: 'absolute', top: -6, right: -8, height: 22, padding: '0 7px', background: runRing ?? 'var(--ok)', color: '#fff', border: '2px solid var(--surface)' }}>
            {run.state === 'error' ? '!' : run.items}
          </span>
        )}
        {node.disabled && <span className="chip" style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', height: 18, fontSize: 10.5 }}>off</span>}

        {mainIn.map((p, i) => (
          <Handle key={`in${i}`} id={handleId('in', p.type, p.index)} type="target" position={Position.Left} className="h-main" style={{ top: spread(i, mainIn.length) }} />
        ))}
        {mainOut.map((p, i) => (
          <div key={`out${i}`}>
            <Handle id={handleId('out', p.type, p.index)} type="source" position={Position.Right} className="h-main" style={{ top: spread(i, mainOut.length) }} />
            {p.label && mainOut.length > 1 && <span className="h-label out" style={{ top: spread(i, mainOut.length) }}>{p.label}</span>}
            {!readOnly && onAdd && (
              <button type="button" className="h-add nodrag" aria-label={`Add module after ${node.name}${p.label ? ` (${p.label})` : ''}`}
                style={{ top: spread(i, mainOut.length) }} onClick={(e) => { e.stopPropagation(); onAdd({ name: node.name, type: 'main', index: p.index, dir: 'out' }); }}>+</button>
            )}
          </div>
        ))}
        {aiOut.map((p, i) => (
          <Handle key={`aout${i}`} id={handleId('out', p.type, p.index)} type="source" position={Position.Top} className="h-ai" style={{ left: spread(i, aiOut.length) }} />
        ))}
      </div>
      <div style={{ textAlign: 'center', maxWidth: 150 }}>
        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{node.name}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.3 }}>{subtitle}</div>}
        {mark && <div className="mark-tag" style={{ color: markColor ?? undefined }}>{mark === 'changed' ? 'Changed since' : mark === 'removed' ? 'Removed since' : 'New'}</div>}
        {node.notesInFlow && node.notes && <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 4, fontStyle: 'italic' }}>{node.notes}</div>}
      </div>
      {aiIn.length > 0 && (
        <div style={{ position: 'relative', width: Math.max(150, aiIn.length * 70), height: 34 }}>
          {aiIn.map((p, i) => (
            <div key={`ain${i}`} style={{ position: 'absolute', left: spread(i, aiIn.length), top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{aiLabel(p.type)}{p.required ? '*' : ''}</span>
              <Handle id={handleId('in', p.type, p.index)} type="target" position={Position.Bottom} className="h-ai" style={{ position: 'relative', left: 0, top: 6, transform: 'none' }} />
              {!readOnly && onAdd && (
                <button type="button" className="h-add-ai nodrag" aria-label={`Add ${aiLabel(p.type)} to ${node.name}`}
                  onClick={(e) => { e.stopPropagation(); onAdd({ name: node.name, type: p.type, index: p.index, dir: 'in' }); }}>+</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const FlowNode = memo(FlowNodeImpl);

const STICKY_COLORS = ['#fff5d6', '#fde2e1', '#dff3e4', '#e0ecff', '#efe3ff', '#ffe9d6', '#e8e8ee'];

export interface StickyData extends Record<string, unknown> {
  node: N8nNode;
  readOnly?: boolean;
  onResize?: (name: string, w: number, h: number) => void;
}

function StickyImpl({ data, selected }: NodeProps & { data: StickyData }) {
  const p = data.node.parameters as { content?: string; width?: number; height?: number; color?: number };
  const bg = STICKY_COLORS[((Number(p.color) || 1) - 1) % STICKY_COLORS.length];
  return (
    <>
      {!data.readOnly && (
        <NodeResizer isVisible={selected} minWidth={150} minHeight={80}
          onResizeEnd={(_e, r) => data.onResize?.(data.node.name, Math.round(r.width), Math.round(r.height))} />
      )}
      <div style={{ width: '100%', height: '100%', minWidth: 150, background: bg, color: '#2b2b33', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'auto', boxShadow: selected ? '0 0 0 2px var(--accent)' : '0 1px 4px rgba(0,0,0,0.12)' }}>
        {(p.content || '').replace(/^#+\s*/gm, '')}
      </div>
    </>
  );
}

export const StickyNode = memo(StickyImpl);
