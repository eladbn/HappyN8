import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { request } from '../../api/client';
import type { Params } from '../../api/types';
import { Icon } from '../../components/Icon';
import { errMsg } from '../../components/ui';
import { isExpression } from '../../lib/params';
import { newId } from '../../lib/workflow';
import { useParamCtx, type FieldProps } from './context';
import { MapButton, insertExpr } from './inputs';

interface LoadedOption { name: string; value: string | number | boolean; description?: string }

function useDynamic(kind: 'options' | 'resource-locator-results', body: Record<string, unknown>, enabled: boolean) {
  return useQuery({
    queryKey: ['dynamic', kind, JSON.stringify(body)],
    queryFn: () => request<unknown>('POST', `/api/dynamic/${kind}`, body),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Dropdown whose options come from n8n (channels, sheets, models…). */
export function DynamicOptionsField({ prop, value, onChange, path, multiple }: FieldProps & { multiple?: boolean }) {
  const ctx = useParamCtx();
  const [load, setLoad] = useState(false);
  const to = prop.typeOptions || {};
  const body = {
    nodeTypeAndVersion: { name: ctx.node.type, version: ctx.node.typeVersion },
    path: `parameters.${path.join('.')}`,
    methodName: to.loadOptionsMethod,
    loadOptions: to.loadOptions,
    currentNodeParameters: ctx.root,
    credentials: ctx.node.credentials,
  };
  const q = useDynamic('options', body, ctx.canLoad && load);
  const opts = (Array.isArray(q.data) ? q.data : []) as LoadedOption[];

  if (!ctx.canLoad) {
    return <input className="input" value={String(value ?? '')} aria-label={prop.displayName} placeholder="Value (option lists need the n8n login)" onChange={(e) => onChange(e.target.value)} />;
  }
  if (multiple) {
    const sel = Array.isArray(value) ? value : [];
    return (
      <div className="row wrap" style={{ gap: 6 }}>
        {!load && <button type="button" className="btn sm" onClick={() => setLoad(true)}>Load options</button>}
        {q.isFetching && <span className="small muted">Loading…</span>}
        {opts.map((o) => {
          const on = sel.includes(o.value);
          return <button key={String(o.value)} type="button" className={`chip${on ? ' live' : ''}`} style={{ border: 0, cursor: 'pointer' }} aria-pressed={on}
            onClick={() => onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>{o.name}</button>;
        })}
        {q.error && <span className="small" style={{ color: 'var(--bad-text)' }}>{errMsg(q.error)}</span>}
      </div>
    );
  }
  const current = opts.find((o) => o.value === value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select className="select" aria-label={prop.displayName} value={current ? String(opts.indexOf(current)) : ''}
        onFocus={() => setLoad(true)} onMouseDown={() => setLoad(true)}
        onChange={(e) => onChange(opts[Number(e.target.value)]?.value)}>
        <option value="">{q.isFetching ? 'Loading…' : value !== undefined && value !== '' && !current ? `Current: ${String(value)}` : 'Choose…'}</option>
        {opts.map((o, i) => <option key={i} value={String(i)}>{o.name}</option>)}
      </select>
      {q.error && <span className="small" style={{ color: 'var(--bad-text)' }}>Could not load options: {errMsg(q.error)}. Check the credential, or type an ID with an expression.</span>}
    </div>
  );
}

interface RL { __rl: true; mode: string; value: unknown; cachedResultName?: string; cachedResultUrl?: string }

/** "From list / By ID / By URL" picker used by most app nodes. */
export function ResourceLocatorField({ prop, value, onChange }: FieldProps) {
  const ctx = useParamCtx();
  const modes = prop.modes ?? [{ name: 'id', displayName: 'ID', type: 'string' }];
  const rl: RL = value && typeof value === 'object' && (value as RL).__rl
    ? (value as RL)
    : { __rl: true, mode: modes[0]?.name ?? 'id', value: value ?? '' };
  const mode = modes.find((m) => m.name === rl.mode) ?? modes[0];
  const [filter, setFilter] = useState('');
  const [load, setLoad] = useState(false);
  const isList = mode?.type === 'list';
  const method = mode?.typeOptions?.searchListMethod;
  const body = {
    nodeTypeAndVersion: { name: ctx.node.type, version: ctx.node.typeVersion },
    path: `parameters.${prop.name}`, methodName: method, currentNodeParameters: ctx.root, credentials: ctx.node.credentials,
    ...(filter ? { filter } : {}),
  };
  const q = useDynamic('resource-locator-results', body, ctx.canLoad && isList && !!method && load);
  const results = ((q.data as { results?: Array<{ name: string; value: string; url?: string }> })?.results) ?? [];
  const set = (patch: Partial<RL>) => onChange({ ...rl, ...patch });
  const expr = isExpression(rl.value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="row">
        <select className="select" style={{ width: 130, flexShrink: 0 }} aria-label={`${prop.displayName} mode`} value={rl.mode}
          onChange={(e) => onChange({ __rl: true, mode: e.target.value, value: '' })}>
          {modes.map((m) => <option key={m.name} value={m.name}>{m.displayName}</option>)}
        </select>
        {isList && ctx.canLoad && !expr ? (
          <select className="select" aria-label={prop.displayName} value={results.some((r) => r.value === rl.value) ? String(rl.value) : ''}
            onFocus={() => setLoad(true)} onMouseDown={() => setLoad(true)}
            onChange={(e) => {
              const r = results.find((x) => x.value === e.target.value);
              if (r) set({ value: r.value, cachedResultName: r.name, cachedResultUrl: r.url });
            }}>
            <option value="">{q.isFetching ? 'Loading…' : rl.cachedResultName ? `Current: ${rl.cachedResultName}` : rl.value ? `Current: ${String(rl.value)}` : 'Choose…'}</option>
            {results.map((r) => <option key={r.value} value={r.value}>{r.name}</option>)}
          </select>
        ) : (
          <input className={`input${expr ? ' expr' : ''}`} aria-label={prop.displayName} value={expr ? String(rl.value).slice(1) : String(rl.value ?? '')}
            placeholder={mode?.placeholder || (isList ? 'ID (list needs the n8n login)' : '')}
            onChange={(e) => set({ value: expr ? `=${e.target.value}` : e.target.value, cachedResultName: undefined })} />
        )}
        <MapButton onInsert={(x) => set({ value: insertExpr(rl.value, x), cachedResultName: undefined })} />
      </div>
      {isList && load && !!method && (
        <input className="input" placeholder="Search the list" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={`Search ${prop.displayName}`} />
      )}
      {q.error && <span className="small" style={{ color: 'var(--bad-text)' }}>Could not load the list: {errMsg(q.error)}</span>}
    </div>
  );
}

const OPS: Record<string, Array<[string, string, boolean?]>> = {
  string: [['equals', 'is equal to'], ['notEquals', 'is not equal to'], ['contains', 'contains'], ['notContains', 'does not contain'], ['startsWith', 'starts with'], ['endsWith', 'ends with'], ['regex', 'matches regex'], ['exists', 'exists', true], ['notExists', 'does not exist', true], ['empty', 'is empty', true], ['notEmpty', 'is not empty', true]],
  number: [['equals', '='], ['notEquals', '≠'], ['gt', '>'], ['lt', '<'], ['gte', '≥'], ['lte', '≤'], ['exists', 'exists', true], ['notExists', 'does not exist', true], ['empty', 'is empty', true], ['notEmpty', 'is not empty', true]],
  boolean: [['true', 'is true', true], ['false', 'is false', true], ['equals', 'is equal to'], ['notEquals', 'is not equal to'], ['exists', 'exists', true], ['notExists', 'does not exist', true]],
  dateTime: [['equals', 'is equal to'], ['notEquals', 'is not equal to'], ['after', 'is after'], ['before', 'is before'], ['afterOrEquals', 'is after or equal'], ['beforeOrEquals', 'is before or equal'], ['exists', 'exists', true], ['notExists', 'does not exist', true]],
  array: [['contains', 'contains'], ['notContains', 'does not contain'], ['lengthEquals', 'length ='], ['lengthGt', 'length >'], ['lengthLt', 'length <'], ['empty', 'is empty', true], ['notEmpty', 'is not empty', true], ['exists', 'exists', true]],
  object: [['empty', 'is empty', true], ['notEmpty', 'is not empty', true], ['exists', 'exists', true], ['notExists', 'does not exist', true]],
};

interface Condition { id: string; leftValue: unknown; rightValue: unknown; operator: { type: string; operation: string; singleValue?: boolean; name?: string } }

/** Condition builder used by If / Filter / Switch rules. */
export function FilterField({ prop, value, onChange }: FieldProps) {
  const def = (prop.default as Params) || {};
  const v = (value && typeof value === 'object' ? value : def) as Params;
  const conditions = (Array.isArray(v.conditions) ? v.conditions : []) as Condition[];
  const options = (v.options as Params) ?? (def.options as Params) ?? { caseSensitive: true, leftValue: '', typeValidation: 'strict' };
  const combinator = (v.combinator as string) || 'and';
  const save = (patch: Params) => onChange({ ...v, options, combinator, conditions, ...patch });
  const setCond = (i: number, c: Condition) => save({ conditions: conditions.map((x, j) => (j === i ? c : x)) });

  return (
    <div className="group">
      {conditions.map((c, i) => {
        const type = c.operator?.type || 'string';
        const ops = OPS[type] ?? OPS.string;
        const single = !!ops.find((o) => o[0] === c.operator?.operation)?.[2];
        return (
          <div key={c.id || i} className="group" style={{ background: 'var(--surface)' }}>
            {i > 0 && <span className="small muted" style={{ fontWeight: 600 }}>{combinator === 'and' ? 'and' : 'or'}</span>}
            <div className="row">
              <input className="input expr" aria-label="Value to check" placeholder="{{ $json.field }}" value={String(c.leftValue ?? '').replace(/^=/, '')}
                onChange={(e) => setCond(i, { ...c, leftValue: `=${e.target.value}` })} />
              <MapButton onInsert={(x) => setCond(i, { ...c, leftValue: insertExpr(c.leftValue, x) })} />
            </div>
            <div className="row wrap">
              <select className="select" style={{ width: 110 }} aria-label="Type" value={type}
                onChange={(e) => setCond(i, { ...c, operator: { type: e.target.value, operation: OPS[e.target.value][0][0], ...(OPS[e.target.value][0][2] ? { singleValue: true } : {}) } })}>
                {Object.keys(OPS).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="select grow" style={{ width: 'auto' }} aria-label="Operator" value={c.operator?.operation}
                onChange={(e) => {
                  const op = ops.find((o) => o[0] === e.target.value)!;
                  setCond(i, { ...c, operator: { type, operation: op[0], ...(op[2] ? { singleValue: true } : {}) } });
                }}>
                {ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" className="btn ghost sm icon" aria-label="Remove condition" onClick={() => save({ conditions: conditions.filter((_, j) => j !== i) })}><Icon name="close" size={14} /></button>
            </div>
            {!single && (
              <input className="input" aria-label="Compare with" placeholder="Value" value={String(c.rightValue ?? '')}
                onChange={(e) => setCond(i, { ...c, rightValue: e.target.value })} />
            )}
          </div>
        );
      })}
      <div className="row wrap">
        <button type="button" className="btn sm" onClick={() => save({ conditions: [...conditions, { id: newId(), leftValue: '', rightValue: '', operator: { type: 'string', operation: 'equals' } }] })}>+ Add condition</button>
        {conditions.length > 1 && (
          <select className="select" style={{ width: 'auto' }} aria-label="Combine conditions" value={combinator} onChange={(e) => save({ combinator: e.target.value })}>
            <option value="and">All must match (AND)</option>
            <option value="or">Any can match (OR)</option>
          </select>
        )}
        <label className="row small" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={options.caseSensitive !== false} onChange={(e) => save({ options: { ...options, caseSensitive: e.target.checked } })} />Case sensitive
        </label>
      </div>
    </div>
  );
}

interface Assignment { id: string; name: string; value: unknown; type: string }

/** Field list of the "Edit Fields (Set)" node. */
export function AssignmentsField({ value, onChange }: FieldProps) {
  const v = (value && typeof value === 'object' ? value : {}) as Params;
  const list = (Array.isArray(v.assignments) ? v.assignments : []) as Assignment[];
  const save = (l: Assignment[]) => onChange({ ...v, assignments: l });
  const set = (i: number, a: Assignment) => save(list.map((x, j) => (j === i ? a : x)));
  return (
    <div className="group">
      {list.map((a, i) => (
        <div key={a.id || i} className="group" style={{ background: 'var(--surface)' }}>
          <div className="row">
            <input className="input" aria-label="Field name" placeholder="Field name" value={a.name} onChange={(e) => set(i, { ...a, name: e.target.value })} />
            <select className="select" style={{ width: 110 }} aria-label="Type" value={a.type} onChange={(e) => set(i, { ...a, type: e.target.value })}>
              {['string', 'number', 'boolean', 'array', 'object'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className="btn ghost sm icon" aria-label="Remove field" onClick={() => save(list.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
          </div>
          <div className="row">
            <input className={`input${isExpression(a.value) ? ' expr' : ''}`} aria-label="Value" placeholder="Value or {{ expression }}"
              value={isExpression(a.value) ? String(a.value).slice(1) : String(a.value ?? '')}
              onChange={(e) => set(i, { ...a, value: e.target.value.includes('{{') ? `=${e.target.value}` : e.target.value })} />
            <MapButton onInsert={(x) => set(i, { ...a, value: insertExpr(a.value, x) })} />
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => save([...list, { id: newId(), name: '', value: '', type: 'string' }])}>+ Add field</button>
    </div>
  );
}
