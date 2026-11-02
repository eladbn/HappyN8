const TTL_MS = 60 * 60 * 1000;
const ICON_CACHE_MAX = 2000;

const SUMMARY_KEYS = [
  'name', 'displayName', 'description', 'version', 'defaultVersion', 'defaults', 'group', 'icon', 'iconUrl',
  'iconColor', 'badgeIconUrl', 'inputs', 'outputs', 'inputNames', 'outputNames', 'subtitle', 'hidden',
];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function versionsOf(desc) {
  return Array.isArray(desc.version) ? desc.version : [desc.version];
}

export const ICON_PATH = /^(icons|types)\/[A-Za-z0-9@._\-/]+\.(svg|png)$/;

/** Node/credential type catalog and icons, read from n8n's editor endpoints and cached in memory. */
export function createCatalog(client) {
  let nodes = null;
  let nodesAt = 0;
  let creds = null;
  let credsAt = 0;
  const icons = new Map();

  async function loadNodes() {
    if (nodes && Date.now() - nodesAt < TTL_MS) return nodes;
    const list = await client.internalJson('GET', '/types/nodes.json');
    const byName = new Map();
    for (const d of Array.isArray(list) ? list : []) {
      if (!d || !d.name) continue;
      if (!byName.has(d.name)) byName.set(d.name, []);
      byName.get(d.name).push(d);
    }
    const summary = [];
    for (const [name, descs] of byName) {
      const all = descs.flatMap(versionsOf).filter((v) => typeof v === 'number');
      const latest = descs.reduce((a, b) => (Math.max(...versionsOf(b)) > Math.max(...versionsOf(a)) ? b : a));
      summary.push({
        ...pick(latest, SUMMARY_KEYS),
        name,
        versions: [...new Set(all)].sort((a, b) => a - b),
        defaultVersion: latest.defaultVersion ?? Math.max(...all),
        codex: latest.codex ? pick(latest.codex, ['categories', 'subcategories', 'alias']) : undefined,
        credentials: (latest.credentials || []).map((c) => ({ name: c.name, required: c.required })),
        hasWebhooks: Array.isArray(latest.webhooks) && latest.webhooks.length > 0,
        isTrigger: Array.isArray(latest.group) && latest.group.includes('trigger'),
      });
    }
    nodes = { byName, summary };
    nodesAt = Date.now();
    return nodes;
  }

  async function nodeDetail(name, version) {
    const { byName } = await loadNodes();
    const descs = byName.get(name);
    if (!descs) return null;
    const v = Number(version);
    const match = descs.find((d) => versionsOf(d).includes(v));
    return match || descs.reduce((a, b) => (Math.max(...versionsOf(b)) > Math.max(...versionsOf(a)) ? b : a));
  }

  async function credentialTypes() {
    if (creds && Date.now() - credsAt < TTL_MS) return creds;
    const list = await client.internalJson('GET', '/types/credentials.json');
    creds = (Array.isArray(list) ? list : []).map((c) => ({
      ...pick(c, ['name', 'displayName', 'icon', 'iconUrl', 'documentationUrl', 'extends']),
      properties: (c.properties || []).map((p) => pick(p, [
        'name', 'displayName', 'type', 'default', 'required', 'description', 'placeholder', 'options',
        'typeOptions', 'displayOptions',
      ])),
    }));
    credsAt = Date.now();
    return creds;
  }

  /** Fetches an icon file; tries the session when configured, plain request otherwise. */
  async function icon(path) {
    if (!ICON_PATH.test(path) || path.includes('..')) return null;
    if (icons.has(path)) return icons.get(path);
    const res = client.hasLogin
      ? await client.internal('GET', `/${path}`)
      : await client.raw(`/${path}`);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || (path.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    const entry = { type, body: Buffer.from(await res.arrayBuffer()) };
    if (icons.size >= ICON_CACHE_MAX) icons.delete(icons.keys().next().value);
    icons.set(path, entry);
    return entry;
  }

  /** Drops everything cached (used after the n8n address changes). */
  function reset() {
    nodes = null;
    creds = null;
    icons.clear();
  }

  return { loadNodes, nodeDetail, credentialTypes, icon, reset };
}
