export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = Math.max(0, now - Date.parse(iso));
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function dateTime(iso: string | null | undefined, seconds = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: seconds ? 'medium' : 'short' });
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} m ${Math.round((ms % 60_000) / 1000)} s`;
}

export const STATUS_LABEL: Record<string, string> = {
  success: 'Succeeded',
  error: 'Failed',
  crashed: 'Crashed',
  canceled: 'Stopped',
  running: 'Running',
  waiting: 'Waiting',
  new: 'Queued',
  unknown: 'Unknown',
};

export function statusTone(status: string): 'ok' | 'bad' | 'live' | 'muted' {
  if (status === 'success') return 'ok';
  if (status === 'error' || status === 'crashed') return 'bad';
  if (status === 'running' || status === 'waiting' || status === 'new') return 'live';
  return 'muted';
}

export function preview(value: unknown, max = 80): string {
  let s: string;
  if (typeof value === 'string') s = value;
  else {
    try { s = JSON.stringify(value); } catch { s = String(value); }
  }
  if (s === undefined) s = 'undefined';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
