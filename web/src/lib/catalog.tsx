import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { NodeTypeSummary } from '../api/types';
import { useCatalogQuery, useMeta } from '../api/hooks';

interface CatalogValue {
  ready: boolean;
  available: boolean;
  list: NodeTypeSummary[];
  get: (type: string) => NodeTypeSummary | undefined;
}

const Ctx = createContext<CatalogValue>({ ready: false, available: false, list: [], get: () => undefined });

export function CatalogProvider({ children }: { children: ReactNode }) {
  const meta = useMeta();
  const q = useCatalogQuery(!!meta.data?.login);
  const value = useMemo<CatalogValue>(() => {
    const list = q.data ?? [];
    const map = new Map(list.map((n) => [n.name, n]));
    return { ready: !meta.isLoading && !q.isLoading, available: list.length > 0, list, get: (t) => map.get(t) };
  }, [q.data, q.isLoading, meta.isLoading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  return useContext(Ctx);
}

/** Look used when the catalog is unavailable or a node has no icon file. */
const KNOWN: Record<string, [string, string, string]> = {
  webhook: ['Webhook', 'WH', '#B4235A'],
  scheduleTrigger: ['Schedule', 'Sc', '#B45309'],
  cron: ['Schedule', 'Sc', '#B45309'],
  manualTrigger: ['Manual trigger', '▶', '#4B5563'],
  httpRequest: ['HTTP Request', 'Ht', '#1D4ED8'],
  code: ['Code', '{}', '#4B5563'],
  function: ['Function', 'fx', '#4B5563'],
  set: ['Edit fields', 'Set', '#0E7490'],
  if: ['If', 'If', '#6D28D9'],
  switch: ['Switch', 'Sw', '#6D28D9'],
  merge: ['Merge', 'Mg', '#6D28D9'],
  filter: ['Filter', 'Fi', '#6D28D9'],
  wait: ['Wait', 'Wt', '#9A3412'],
  noOp: ['No operation', '—', '#6B7280'],
  splitInBatches: ['Loop', 'Lp', '#6D28D9'],
  gmail: ['Gmail', 'Gm', '#B91C1C'],
  gmailTrigger: ['Gmail', 'Gm', '#B91C1C'],
  slack: ['Slack', 'Sl', '#5B2C83'],
  telegram: ['Telegram', 'Tg', '#0369A1'],
  telegramTrigger: ['Telegram', 'Tg', '#0369A1'],
  googleSheets: ['Google Sheets', 'Gs', '#15803D'],
  notion: ['Notion', 'No', '#262626'],
  postgres: ['Postgres', 'Pg', '#1E3A8A'],
  airtable: ['Airtable', 'At', '#0E7490'],
  hubspot: ['HubSpot', 'Hs', '#C2410C'],
  openAi: ['OpenAI', 'AI', '#1F1F1F'],
  agent: ['AI Agent', 'Ag', '#4F46E5'],
  chatTrigger: ['Chat', 'Ch', '#4F46E5'],
  lmChatOpenAi: ['OpenAI model', 'AI', '#1F1F1F'],
  lmChatAnthropic: ['Anthropic model', 'An', '#7C2D12'],
  executeWorkflow: ['Run workflow', 'Wf', '#4B5563'],
  executeWorkflowTrigger: ['Called by workflow', 'Wf', '#4B5563'],
  respondToWebhook: ['Respond to webhook', 'Rs', '#B4235A'],
  formTrigger: ['Form', 'Fm', '#0F766E'],
};

const PALETTE = ['#4F46E5', '#0E7490', '#B45309', '#15803D', '#B4235A', '#1D4ED8', '#6D28D9', '#9A3412', '#0369A1', '#374151'];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface NodeLook {
  label: string;
  abbr: string;
  color: string;
  iconUrl?: string;
}

function pickTheme(v: string | { light: string; dark: string } | undefined): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? v.dark : v.light;
}

export function nodeLook(type: string, summary?: NodeTypeSummary): NodeLook {
  const short = type.split('.').pop() || type;
  const known = KNOWN[short];
  const label = summary?.displayName || known?.[0] || short.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  const words = label.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
  const abbr = known?.[1] || (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
  const color = known?.[2] || summary?.defaults?.color || PALETTE[hash(type) % PALETTE.length];
  const url = pickTheme(summary?.iconUrl);
  return { label, abbr, color: /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[hash(type) % PALETTE.length], iconUrl: url ? (/^https?:\/\//.test(url) ? url : `/api/${url.replace(/^\/+/, '')}`) : undefined };
}
