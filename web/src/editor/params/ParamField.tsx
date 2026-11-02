import { useState } from 'react';
import type { NodeProperty, NodePropertyOption } from '../../api/types';
import { Icon } from '../../components/Icon';
import { isExpression } from '../../lib/params';
import { CollectionField, FixedCollectionField } from './collections';
import type { FieldProps } from './context';
import { ExpressionInput, JsonInput, MapButton, insertExpr } from './inputs';
import { AssignmentsField, DynamicOptionsField, FilterField, ResourceLocatorField } from './special';

const CODE_EDITORS = new Set(['codeNodeEditor', 'sqlEditor', 'htmlEditor', 'jsEditor', 'cssEditor', 'jsonEditor']);
const EXPRESSIBLE = new Set(['string', 'number', 'boolean', 'options', 'dateTime', 'color', 'json', 'multiOptions']);

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '');
}

/** Label, hint, fixed/expression toggle and mapping button around a parameter input. */
export function ParamField(props: FieldProps) {
  const { prop, value, onChange } = props;
  if (prop.type === 'notice') {
    return <div className="notice small">{stripHtml(prop.displayName)}</div>;
  }
  if (prop.type === 'hidden') return null;

  const expr = isExpression(value);
  const canExpr = EXPRESSIBLE.has(prop.type) && !prop.noDataExpression;
  const mappable = canExpr && ['string', 'number', 'json', 'dateTime'].includes(prop.type);

  return (
    <div className={`field param${expr ? ' is-expr' : ''}`}>
      <div className="label">
        <span className="grow">{prop.displayName}{prop.required && <span className="req" aria-label="required"> *</span>}</span>
        <span className="field-tools">
          {mappable && <MapButton onInsert={(e) => onChange(insertExpr(value, e))} />}
          {canExpr && (
            <span className="mode-toggle" role="group" aria-label={`${prop.displayName} value type`}>
              <button type="button" aria-pressed={!expr} onClick={() => { if (expr) onChange(prop.default ?? ''); }}>Fixed</button>
              <button type="button" aria-pressed={expr} onClick={() => {
                if (!expr) onChange(`=${value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
              }}>Expression</button>
            </span>
          )}
        </span>
      </div>
      {expr ? <ExpressionInput value={value as string} onChange={onChange} label={prop.displayName} /> : <Input {...props} />}
      {(prop.hint || prop.description) && <Hint text={stripHtml(String(prop.hint || prop.description))} />}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140;
  return (
    <span className={`hint${long && !open ? ' clamp' : ''}`}>
      {text}
      {long && <button type="button" className="link-btn small" onClick={() => setOpen(!open)}>{open ? 'Less' : 'More'}</button>}
    </span>
  );
}

function Input({ prop, value, onChange, path, parent }: FieldProps) {
  const v = value === undefined ? prop.default : value;
  const to = prop.typeOptions || {};
  switch (prop.type) {
    case 'string': {
      if (to.loadOptionsMethod || to.loadOptions) return <DynamicOptionsField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
      const code = CODE_EDITORS.has(String(to.editor));
      const rows = Number(to.rows) || (code ? 12 : 0);
      if (rows > 1 || code) {
        return <textarea className={`textarea${code ? ' code' : ''}`} rows={rows || 4} value={String(v ?? '')} spellCheck={!code}
          aria-label={prop.displayName} placeholder={prop.placeholder} onChange={(e) => onChange(e.target.value)} />;
      }
      return <input className="input" type={to.password ? 'password' : 'text'} value={String(v ?? '')} placeholder={prop.placeholder}
        aria-label={prop.displayName} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
    }
    case 'number':
      return <input className="input" type="number" value={v === undefined || v === null ? '' : String(v)} aria-label={prop.displayName}
        min={to.minValue as number | undefined} max={to.maxValue as number | undefined} step={to.numberPrecision ? 1 / 10 ** Number(to.numberPrecision) : 'any'}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'boolean':
      return (
        <label className="row" style={{ cursor: 'pointer' }}>
          <button type="button" role="switch" className="switch" aria-checked={!!v} aria-label={prop.displayName} onClick={() => onChange(!v)} />
          <span className="small muted">{v ? 'On' : 'Off'}</span>
        </label>
      );
    case 'options': {
      if (to.loadOptionsMethod || to.loadOptions) return <DynamicOptionsField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
      const opts = (prop.options || []) as NodePropertyOption[];
      const known = opts.some((o) => o.value === v);
      return (
        <select className="select" value={known ? String(opts.findIndex((o) => o.value === v)) : ''} aria-label={prop.displayName}
          onChange={(e) => onChange(opts[Number(e.target.value)]?.value)}>
          {!known && <option value="">{v === undefined || v === '' ? 'Choose…' : `Current: ${String(v)}`}</option>}
          {opts.map((o, i) => <option key={i} value={String(i)} title={o.description}>{o.name}</option>)}
        </select>
      );
    }
    case 'multiOptions': {
      if (to.loadOptionsMethod || to.loadOptions) return <DynamicOptionsField prop={prop} value={v} onChange={onChange} path={path} parent={parent} multiple />;
      const opts = (prop.options || []) as NodePropertyOption[];
      const sel = Array.isArray(v) ? v : [];
      return (
        <div className="row wrap" style={{ gap: 6 }}>
          {opts.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={String(o.value)} type="button" className={`chip${on ? ' live' : ''}`} aria-pressed={on} style={{ border: 0, cursor: 'pointer' }}
                onClick={() => onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>
                {on && <Icon name="check" size={12} />}{o.name}
              </button>
            );
          })}
        </div>
      );
    }
    case 'color':
      return <input className="input" type="color" value={String(v || '#000000')} aria-label={prop.displayName} onChange={(e) => onChange(e.target.value)} style={{ width: 80, padding: 2 }} />;
    case 'dateTime':
      return <input className="input" type="text" value={String(v ?? '')} placeholder="2026-01-31T09:00:00" aria-label={prop.displayName} onChange={(e) => onChange(e.target.value)} />;
    case 'json':
      return <JsonTextField value={v} onChange={onChange} label={prop.displayName} />;
    case 'collection':
      return <CollectionField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
    case 'fixedCollection':
      return <FixedCollectionField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
    case 'resourceLocator':
    case 'workflowSelector':
      return <ResourceLocatorField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
    case 'filter':
      return <FilterField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
    case 'assignmentCollection':
      return <AssignmentsField prop={prop} value={v} onChange={onChange} path={path} parent={parent} />;
    default:
      return (
        <>
          <span className="small muted">Edited as JSON ({prop.type})</span>
          <JsonInput value={v} onChange={onChange} label={prop.displayName} />
        </>
      );
  }
}

/** n8n "json" parameters are stored as strings; keep them as text with a validity hint. */
function JsonTextField({ value, onChange, label }: { value: unknown; onChange: (v: unknown) => void; label: string }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2);
  let valid = true;
  try { JSON.parse(text || '{}'); } catch { valid = false; }
  return (
    <>
      <textarea className="textarea code" rows={8} value={text} aria-label={label} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      {!valid && <span className="small" style={{ color: 'var(--warn)' }}>Not valid JSON yet</span>}
    </>
  );
}

export type { NodeProperty };
