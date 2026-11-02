import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCatalog, nodeLook } from '../lib/catalog';
import { STATUS_LABEL, statusTone } from '../lib/format';
import { Icon } from './Icon';

export function NodeIcon({ type, size = 40, title }: { type: string; size?: number; title?: string }) {
  const catalog = useCatalog();
  const look = nodeLook(type, catalog.get(type));
  const [failed, setFailed] = useState(false);
  const showImg = look.iconUrl && !failed;
  return (
    <span
      className={`mod${showImg ? ' has-img' : ''}`}
      title={title ?? look.label}
      style={{ width: size, height: size, background: look.color, fontSize: Math.max(10, Math.round(size * 0.32)), ['--mod-ring' as string]: `${look.color}40` }}
    >
      {showImg ? <img src={look.iconUrl} alt="" onError={() => setFailed(true)} /> : look.abbr}
    </span>
  );
}

export function ModuleStack({ types, max = 4, size = 36 }: { types: string[]; max?: number; size?: number }) {
  const shown = types.slice(0, max);
  const extra = types.length - shown.length;
  return (
    <span className="stack">
      {shown.map((t) => <NodeIcon key={t} type={t} size={size} />)}
      {extra > 0 && (
        <span className="mod" style={{ width: size, height: size, background: 'var(--sunken)', color: 'var(--ink-2)', fontSize: 12, fontFamily: 'var(--font)', fontWeight: 600 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }} />
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return <span className={`chip ${tone}`}><span className={`dot ${tone}`} />{STATUS_LABEL[status] ?? status}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost icon" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A small popover menu anchored to its trigger button. */
export function Menu({ label, children, icon = 'more', align = 'right' }: { label: string; children: (close: () => void) => ReactNode; icon?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className="btn ghost icon" aria-label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <Icon name={icon} />
      </button>
      {open && (
        <div className="menu" style={{ top: '100%', [align]: 0 }} onClick={(e) => e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}

interface Toast { id: number; tone: 'ok' | 'bad' | 'info'; text: string }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'bad' ? 9000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'info' ? '' : t.tone}`}>
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
