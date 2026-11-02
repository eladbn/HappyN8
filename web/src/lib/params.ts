import type { NodeProperty, NodePropertyOption, Params } from '../api/types';

export interface DisplayContext {
  root: Params;
  parent: Params;
  typeVersion: number;
  /** All properties of the node, used to fall back to defaults for unset parameters. */
  rootProps: NodeProperty[];
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function defaultOf(props: NodeProperty[], name: string, ctx: DisplayContext): unknown {
  for (const p of props) {
    if (p.name !== name) continue;
    if (!p.displayOptions || isDisplayed(p, { ...ctx, parent: ctx.root })) return p.default;
  }
  return undefined;
}

function lookup(key: string, ctx: DisplayContext): unknown {
  if (key === '@version') return ctx.typeVersion;
  if (key.startsWith('/')) {
    const k = key.slice(1);
    const v = getPath(ctx.root, k);
    return v !== undefined ? v : defaultOf(ctx.rootProps, k.split('.')[0], ctx);
  }
  const v = getPath(ctx.parent, key);
  if (v !== undefined) return v;
  return ctx.parent === ctx.root ? defaultOf(ctx.rootProps, key.split('.')[0], ctx) : undefined;
}

function matchCondition(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && '_cnd' in (expected as Record<string, unknown>)) {
    const [op, target] = Object.entries((expected as { _cnd: Record<string, unknown> })._cnd)[0] ?? [];
    const a = actual as number;
    const t = target as number;
    switch (op) {
      case 'eq': return actual === target;
      case 'not': return actual !== target;
      case 'gte': return a >= t;
      case 'lte': return a <= t;
      case 'gt': return a > t;
      case 'lt': return a < t;
      case 'between': {
        const r = target as { from: number; to: number };
        return a >= r.from && a <= r.to;
      }
      case 'startsWith': return typeof actual === 'string' && actual.startsWith(String(target));
      case 'endsWith': return typeof actual === 'string' && actual.endsWith(String(target));
      case 'includes': return typeof actual === 'string' && actual.includes(String(target));
      case 'regex': return typeof actual === 'string' && new RegExp(String(target)).test(actual);
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      default: return false;
    }
  }
  if (Array.isArray(actual)) return actual.includes(expected as never);
  return actual === expected;
}

function anyMatch(actual: unknown, expectedList: unknown[]): boolean {
  if (Array.isArray(actual)) return actual.some((a) => expectedList.some((e) => matchCondition(a, e)));
  return expectedList.some((e) => matchCondition(actual, e));
}

/** Evaluates n8n displayOptions (show/hide, @version, _cnd conditions, /root paths). */
export function isDisplayed(prop: Pick<NodeProperty, 'displayOptions'>, ctx: DisplayContext): boolean {
  const d = prop.displayOptions;
  if (!d) return true;
  for (const [key, expected] of Object.entries(d.show || {})) {
    if (key === '@tool' || key === '@feature') continue;
    if (!Array.isArray(expected)) continue;
    if (!anyMatch(lookup(key, ctx), expected)) return false;
  }
  for (const [key, expected] of Object.entries(d.hide || {})) {
    if (key === '@tool' || key === '@feature') continue;
    if (!Array.isArray(expected)) continue;
    if (anyMatch(lookup(key, ctx), expected)) return false;
  }
  return true;
}

/** Visible properties for a parameter object, de-duplicated by name (first visible wins). */
export function visibleProps(props: NodeProperty[], ctx: DisplayContext): NodeProperty[] {
  const seen = new Set<string>();
  const out: NodeProperty[] = [];
  for (const p of props) {
    if (p.type === 'hidden' || seen.has(p.name)) continue;
    if (!isDisplayed(p, ctx)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
}

export function isExpression(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('=');
}

export function optionLabel(prop: NodeProperty | undefined, value: unknown): string | undefined {
  const opts = (prop?.options || []) as NodePropertyOption[];
  const hit = opts.find((o) => 'value' in o && o.value === value);
  return hit?.name;
}

/** Short "Operation · Resource" style subtitle for a node on the canvas. */
export function nodeSubtitle(params: Params, props: NodeProperty[] | undefined, typeVersion: number): string {
  const ctx: DisplayContext = { root: params, parent: params, typeVersion, rootProps: props || [] };
  const pickValue = (name: string) => (params[name] !== undefined ? params[name] : props ? lookup(name, ctx) : undefined);
  const op = pickValue('operation');
  const res = pickValue('resource');
  const visible = props ? visibleProps(props, ctx) : [];
  const opLabel = op !== undefined ? optionLabel(visible.find((p) => p.name === 'operation'), op) ?? String(op) : '';
  const resLabel = res !== undefined ? optionLabel(visible.find((p) => p.name === 'resource'), res) ?? String(res) : '';
  if (opLabel && resLabel) return `${opLabel} · ${resLabel}`;
  if (opLabel || resLabel) return opLabel || resLabel;
  const mode = params.mode;
  if (typeof mode === 'string') return mode;
  return '';
}

export function setPath(obj: Params, path: string[], value: unknown): Params {
  if (!path.length) return obj;
  const [head, ...rest] = path;
  const copy: Params = Array.isArray(obj) ? ([...(obj as unknown[])] as unknown as Params) : { ...obj };
  if (!rest.length) {
    if (value === undefined) delete copy[head];
    else copy[head] = value;
    return copy;
  }
  const child = (copy[head] && typeof copy[head] === 'object' ? copy[head] : /^\d+$/.test(rest[0]) ? [] : {}) as Params;
  copy[head] = setPath(child, rest, value);
  return copy;
}

/** Initial value for a newly added collection option / fixedCollection entry. */
export function initialValue(prop: NodeProperty): unknown {
  if (prop.default !== undefined) return structuredClone(prop.default);
  switch (prop.type) {
    case 'boolean': return false;
    case 'number': return 0;
    case 'collection':
    case 'fixedCollection': return {};
    case 'multiOptions': return [];
    default: return '';
  }
}
