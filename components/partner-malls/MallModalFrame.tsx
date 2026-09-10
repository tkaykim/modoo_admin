'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const subscribe = () => () => {};
let openOverlays = 0;
let previousBodyOverflow = '';
let previousRootOverflow = '';

/** Mount outside page layout and keep nested editors from unlocking the page. */
export function MallOverlay({ children, onClose, className }: { children: ReactNode; onClose?: () => void; className: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (openOverlays++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousRootOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    ref.current?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      const overlays = document.querySelectorAll('[data-mall-overlay]');
      if (overlays[overlays.length - 1] !== ref.current) return;
      if (event.key === 'Escape' && close.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const targets = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
      const first = targets[0]; const last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (--openOverlays === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousRootOverflow;
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(<div ref={ref} tabIndex={-1} data-mall-overlay className={`${className} outline-none`}>{children}</div>, document.body);
}

export default function MallModalFrame({ label, title, description, children, footer, onClose, saving }: {
  label: string; title: string; description: string; children: ReactNode; footer: ReactNode; onClose: () => void; saving: boolean;
}) {
  return <MallOverlay onClose={saving ? undefined : onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-6">
    <div role="dialog" aria-modal="true" aria-label={label} className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white text-gray-900 shadow-xl sm:h-[90dvh] sm:max-h-[960px] sm:max-w-6xl sm:rounded-xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 sm:px-6">
        <div className="min-w-0"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 truncate text-sm text-gray-500" title={description}>{description}</p></div>
        <button aria-label="닫기" title="닫기" onClick={onClose} disabled={saving} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </header>
      <div data-mall-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/60 p-5 sm:p-6">{children}</div>
      <footer className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 sm:px-6">{footer}</footer>
    </div>
  </MallOverlay>;
}
