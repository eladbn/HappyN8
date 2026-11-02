import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { preview } from '../../lib/format';
import { isExpression } from '../../lib/params';
import { useParamCtx } from './context';

/** Textarea bound to a JSON value; parses on blur and reports errors. */
export function JsonInput({ value, onChange, rows = 6, label }: { value: unknown; onChange: (v: unknown) => void; rows?: number; label?: string }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState('');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(JSON.stringify(value ?? null, null, 2));
    }
  }, [value]);
  return (
    <>
      <textarea className="textarea code" rows={rows} value={text} aria-label={label} spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const v = JSON.parse(text || 'null');
            setError('');
            last.current = v;
            onChange(v);
          } catch (e) {
            setError((e as Error).message);
          }
        }} />
      {error && <span className="small" style={{ color: 'var(--bad-text)' }}>Invalid JSON: {error}</span>}
    </>
  );
}

/** Popover listing fields from earlier modules' last output; inserts an expression. */
export function MapButton({ onInsert }: { onInsert: (expr: string) => void }) {
  const { fields } = useParamCtx();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const shown = fields.filter((f) => !q || `${f.node} ${f.path}`.toLowerCase().includes(q.toLowerCase())).slice(0, 80);
  const groups = [...new Set(shown.map((f) => f.node))];
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn ghost sm" title="Insert data from earlier modules" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="fx" size={14} />Map
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: '100%', width: 340, maxHeight: 360, overflow: 'auto' }}>
          {fields.length === 0 ? (
            <div className="small muted" style={{ padding: 10, lineHeight: 1.5 }}>
              No sample data yet. Run the workflow once (or pick an execution) and the fields from earlier modules appear here.
              You can still type an expression such as <code>{'{{ $json.email }}'}</code>.
            </div>
          ) : (
            <>
              <input className="input" placeholder="Filter fields" value={q} onChange={(e) => setQ(e.target.value)} autoFocus style={{ marginBottom: 6 }} />
              {groups.map((g) => (
                <div key={g}>
                  <div className="small muted" style={{ padding: '6px 10px 2px', fontWeight: 700 }}>{g}</div>
                  {shown.filter((f) => f.node === g).map((f) => (
                    <button key={f.expr} type="button" onClick={() => { onInsert(f.expr); setOpen(false); }} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0, padding: '6px 10px', height: 'auto' }}>
                      <span className="mono" style={{ fontWeight: 600 }}>{f.path}</span>
                      <span className="small muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview(f.sample, 60)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  );
}

/** Expression editor: value stored with leading "=" like n8n does. */
export function ExpressionInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <textarea className="textarea expr" rows={Math.min(8, Math.max(2, value.split('\n').length))} aria-label={label} spellCheck={false}
      value={value.slice(1)} onChange={(e) => onChange(`=${e.target.value}`)} />
  );
}

export function insertExpr(current: unknown, expr: string): string {
  const base = isExpression(current) ? current : current === undefined || current === null || current === '' ? '=' : `=${String(current)}`;
  return `${base}${base.length > 1 ? ' ' : ''}{{ ${expr} }}`;
}
