import { ButtonHTMLAttributes, ReactNode, useEffect, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';

/* ---------- Button ---------- */
type Variant = 'primary' | 'olive' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy text-cream hover:bg-navy-dark',
  olive: 'bg-olive text-white hover:bg-olive-dark',
  ghost: 'border border-beige-dark bg-transparent text-charcoal hover:bg-beige/50',
  danger: 'border border-clay/40 text-clay hover:bg-clay/10',
};
export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

/* ---------- Badges ---------- */
export const SampleBadge = ({ className = '' }: { className?: string }) => (
  <span className={`rounded-full bg-cream/90 px-2 py-0.5 text-[10px] font-semibold tracking-label text-clay ring-1 ring-clay/30 ${className}`}>SAMPLE</span>
);

const TONES = {
  olive: 'bg-olive-light text-olive-dark',
  navy: 'bg-navy-light text-navy',
  beige: 'bg-beige text-charcoal-soft',
  clay: 'bg-clay/10 text-clay',
} as const;
export const Tag = ({ tone = 'beige', children }: { tone?: keyof typeof TONES; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>
);

/* ---------- Layout bits ---------- */
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl2 border border-beige/80 bg-white/70 p-5 shadow-card ${className}`}>{children}</div>
);

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end sm:mb-5 justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="text-[1.4rem] text-charcoal sm:text-[1.7rem]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <header className="page animate-rise pb-5 pt-5 sm:pb-8 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="eyebrow mb-2 sm:mb-3">{eyebrow}</p>
          <h1 className="text-[1.85rem] leading-tight sm:text-5xl">{title}</h1>
          {desc && <p className="mt-2 text-[13px] leading-relaxed text-charcoal-soft sm:mt-3 sm:text-[15px]">{desc}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-beige-dark bg-cream/50 px-6 py-14 text-center">
      <p className="font-serif text-xl">{title}</p>
      {desc && <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-soft">{desc}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Honest placeholder for functionality scheduled for a later phase. */
export function PhaseNotice({ phase, title, items }: { phase: number; title: string; items: string[] }) {
  return (
    <div className="rounded-xl2 border border-beige-dark bg-cream/60 p-6">
      <p className="eyebrow mb-2">Coming in Phase {phase}</p>
      <p className="font-serif text-xl">{title}</p>
      <p className="mt-1 text-sm text-charcoal-soft">아직 구현되지 않은 기능입니다. 지금은 입력/저장 버튼을 제공하지 않습니다.</p>
      <ul className="mt-4 grid gap-1.5 text-sm text-charcoal-soft sm:grid-cols-2">
        {items.map((i) => <li key={i} className="before:mr-2 before:text-olive before:content-['·']">{i}</li>)}
      </ul>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  // Lock background scroll while the sheet is open (prevents iOS "scroll-through").
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 backdrop-blur-[2px] animate-fade sm:items-center sm:p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="modal-sheet max-h-[92vh] max-h-[92dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-paper px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift animate-rise sm:rounded-3xl sm:px-8 sm:pb-8">
        <div className="sticky top-0 z-10 -mx-5 mb-4 bg-paper/95 px-5 pb-3 pt-2 backdrop-blur sm:-mx-8 sm:px-8 sm:pt-6">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-beige-dark sm:hidden" />
          <div className="flex items-center justify-between">
            <h3 className="text-xl sm:text-2xl">{title}</h3>
            <button onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-charcoal-soft hover:bg-beige/60"><X size={18} /></button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
type ToastMsg = { id: number; text: string; tone: 'ok' | 'error' };
let toasts: ToastMsg[] = [];
const tl = new Set<() => void>();
export function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  const m = { id: Date.now() + Math.random(), text, tone };
  toasts = [...toasts, m];
  tl.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== m.id); tl.forEach((l) => l()); }, tone === 'error' ? 5000 : 2800);
}
export function Toaster() {
  const list = useSyncExternalStore((l) => { tl.add(l); return () => tl.delete(l); }, () => toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`animate-rise rounded-full px-5 py-2.5 text-sm shadow-lift ${t.tone === 'error' ? 'bg-clay text-white' : 'bg-navy text-cream'}`}>{t.text}</div>
      ))}
    </div>
  );
}
