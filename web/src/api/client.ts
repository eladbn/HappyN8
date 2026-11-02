import type { Page } from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function request<T>(method: string, url: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (method !== 'GET') headers['x-happyn8'] = '1';
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${url}${qs(query)}`, init);
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/login') && onUnauthorized) onUnauthorized();
    const msg = (json as { message?: string } | undefined)?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, json);
  }
  return json as T;
}

/** Calls the n8n public API through the HappyN8 proxy. */
export const n8n = {
  get: <T>(path: string, query?: Query) => request<T>('GET', `/api/v1${path}`, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', `/api/v1${path}`, body ?? {}, query),
  put: <T>(path: string, body?: unknown, query?: Query) => request<T>('PUT', `/api/v1${path}`, body ?? {}, query),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', `/api/v1${path}`, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', `/api/v1${path}`),
};

/** Follows nextCursor until the list is complete (or `max` items were collected). */
export async function getAll<T>(path: string, query: Query = {}, max = 5000): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page: Page<T> = await n8n.get<Page<T>>(path, { ...query, limit: 250, cursor: cursor ?? undefined });
    out.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor && out.length < max);
  return out;
}
