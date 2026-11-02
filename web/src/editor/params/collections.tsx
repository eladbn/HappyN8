import type { NodeProperty, NodePropertyCollection, Params } from '../../api/types';
import { Icon } from '../../components/Icon';
import { initialValue, isDisplayed, visibleProps } from '../../lib/params';
import { useParamCtx, type FieldProps } from './context';
import { ParamField } from './ParamField';

function asObject(v: unknown): Params {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Params) : {};
}

/** Renders a list of properties against one parameter object. */
export function PropList({ props, value, onChange, path }: { props: NodeProperty[]; value: Params; onChange: (v: Params) => void; path: string[] }) {
  const ctx = useParamCtx();
  const dctx = { root: ctx.root, parent: value, typeVersion: ctx.node.typeVersion, rootProps: ctx.rootProps };
  return (
    <>
      {visibleProps(props, dctx).map((p) => (
        <ParamField key={p.name} prop={p} value={value[p.name]} path={[...path, p.name]} parent={value}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) delete next[p.name]; else next[p.name] = v;
            onChange(next);
          }} />
      ))}
    </>
  );
}

/** "Options" style collection: optional fields added one by one. */
export function CollectionField({ prop, value, onChange, path }: FieldProps) {
  const ctx = useParamCtx();
  const obj = asObject(value);
  const children = (prop.options || []) as NodeProperty[];
  const dctx = { root: ctx.root, parent: obj, typeVersion: ctx.node.typeVersion, rootProps: ctx.rootProps };
  const present = children.filter((c) => c.name in obj && isDisplayed(c, dctx));
  const available = children.filter((c) => !(c.name in obj) && c.type !== 'notice' && isDisplayed(c, dctx))
    .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const seen = new Set<string>();

  return (
    <div className="group">
      {present.filter((c) => !seen.has(c.name) && seen.add(c.name)).map((c) => (
        <div key={c.name} className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <ParamField prop={c} value={obj[c.name]} path={[...path, c.name]} parent={obj}
              onChange={(v) => onChange({ ...obj, [c.name]: v })} />
          </div>
          <button type="button" className="btn ghost sm icon" aria-label={`Remove ${c.displayName}`} style={{ marginTop: 22 }}
            onClick={() => { const next = { ...obj }; delete next[c.name]; onChange(next); }}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      {present.length === 0 && <span className="small muted">No {prop.displayName.toLowerCase()} set.</span>}
      {available.length > 0 && (
        <select className="select" value="" aria-label={`Add ${prop.displayName}`}
          onChange={(e) => {
            const c = available.find((x) => x.name === e.target.value);
            if (c) onChange({ ...obj, [c.name]: initialValue(c) });
          }}>
          <option value="">{String(prop.placeholder || `+ Add ${prop.displayName.toLowerCase()}`)}</option>
          {available.map((c) => <option key={c.name} value={c.name}>{c.displayName}</option>)}
        </select>
      )}
    </div>
  );
}

/** Groups of fields, optionally repeatable (e.g. headers, rules, fields to set). */
export function FixedCollectionField({ prop, value, onChange, path }: FieldProps) {
  const obj = asObject(value);
  const groups = (prop.options || []) as NodePropertyCollection[];
  const multiple = !!prop.typeOptions?.multipleValues;
  const sortable = !!prop.typeOptions?.sortable;

  const blank = (g: NodePropertyCollection): Params => {
    const o: Params = {};
    for (const v of g.values) if (v.default !== undefined && v.type !== 'notice') o[v.name] = structuredClone(v.default);
    return o;
  };

  return (
    <div className="group">
      {groups.map((g) => {
        const raw = obj[g.name];
        if (multiple) {
          const list = Array.isArray(raw) ? (raw as Params[]) : [];
          const setList = (l: Params[]) => {
            const next = { ...obj };
            if (l.length) next[g.name] = l; else delete next[g.name];
            onChange(next);
          };
          return (
            <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((entry, i) => (
                <div key={i} className="group" style={{ background: 'var(--surface)' }}>
                  <div className="group-head">
                    <span>{g.displayName} {i + 1}</span>
                    <span className="row" style={{ gap: 2 }}>
                      {sortable && i > 0 && <button type="button" className="btn ghost sm" aria-label="Move up" onClick={() => { const l = [...list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setList(l); }}>↑</button>}
                      <button type="button" className="btn ghost sm icon" aria-label={`Remove ${g.displayName} ${i + 1}`} onClick={() => setList(list.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
                    </span>
                  </div>
                  <PropList props={g.values} value={asObject(entry)} path={[...path, g.name, String(i)]}
                    onChange={(v) => setList(list.map((x, j) => (j === i ? v : x)))} />
                </div>
              ))}
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setList([...list, blank(g)])}>
                + {String(prop.placeholder && groups.length === 1 ? prop.placeholder : `Add ${g.displayName.toLowerCase()}`)}
              </button>
            </div>
          );
        }
        const present = raw && typeof raw === 'object';
        return (
          <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {present ? (
              <div className="group" style={{ background: 'var(--surface)' }}>
                <div className="group-head">
                  <span>{g.displayName}</span>
                  <button type="button" className="btn ghost sm icon" aria-label={`Remove ${g.displayName}`} onClick={() => { const n = { ...obj }; delete n[g.name]; onChange(n); }}><Icon name="close" size={14} /></button>
                </div>
                <PropList props={g.values} value={asObject(raw)} path={[...path, g.name]} onChange={(v) => onChange({ ...obj, [g.name]: v })} />
              </div>
            ) : (
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...obj, [g.name]: blank(g) })}>+ {g.displayName}</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
