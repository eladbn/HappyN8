import { useMemo, useState, type ReactNode } from 'react';
import type { Item } from '../lib/execution';
import { preview } from '../lib/format';

function JsonNode({ value, name, depth }: { value: unknown; name?: string; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const key = name !== undefined ? <><span className="k">{JSON.stringify(name)}</span>: </> : null;
  if (value === null || typeof value !== 'object') {
    const cls = typeof value === 'string' ? 's' : typeof value === 'number' ? 'n' : 'b';
    return <div style={{ paddingLeft: depth ? 14 : 0 }}>{key}<span className={cls}>{JSON.stringify(value)}</span></div>;
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const [o, c] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      <button type="button" className="tw" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? '▾' : '▸'}</button>
      {key}{o}
      {open ? (
        <>
          {entries.map(([k, v]) => <JsonNode key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} />)}
          <div>{c}</div>
        </>
      ) : <span className="muted"> {entries.length} {Array.isArray(value) ? 'items' : 'keys'} {c}</span>}
    </div>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return <div className="json"><JsonNode value={value} depth={0} /></div>;
}

function Table({ items }: { items: Item[] }) {
  const cols = useMemo(() => {
    const set = new Set<string>();
    for (const it of items.slice(0, 50)) Object.keys(it.json || {}).forEach((k) => set.add(k));
    return [...set].slice(0, 30);
  }, [items]);
  if (!cols.length) return <div className="muted small">Items have no fields.</div>;
  return (
    <div className="scroll-x" style={{ maxHeight: 420, overflowY: 'auto' }}>
      <table className="data-table">
        <thead><tr><th>#</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {items.slice(0, 200).map((it, i) => (
            <tr key={i}><td className="muted">{i + 1}</td>{cols.map((c) => <td key={c} title={preview(it.json?.[c], 2000)}>{preview(it.json?.[c], 60)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Items viewer with Table / JSON switch. */
export function ItemsView({ items, title, extra }: { items: Item[]; title?: ReactNode; extra?: ReactNode }) {
  const [mode, setMode] = useState<'table' | 'json'>('table');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          {title && <h3>{title}</h3>}
          <span className="chip">{items.length} item{items.length === 1 ? '' : 's'}</span>
          {extra}
        </div>
        <div className="seg" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={mode === 'table'} onClick={() => setMode('table')}>Table</button>
          <button type="button" role="tab" aria-selected={mode === 'json'} onClick={() => setMode('json')}>JSON</button>
        </div>
      </div>
      {items.length === 0 ? <div className="muted small">No items.</div>
        : mode === 'table' ? <Table items={items} />
          : <div style={{ maxHeight: 420, overflow: 'auto' }}><JsonView value={items.map((i) => i.json)} /></div>}
    </div>
  );
}
