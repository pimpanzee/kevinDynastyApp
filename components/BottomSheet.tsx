'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The app's detail sheet (score breakdown, player card): rises from the
 * bottom over the current screen and its tab bar, closed by the X, a tap on
 * the scrim, Escape, or dragging the handle down. No other buttons.
 * Absolutely positioned, so the screen's frame must be `position: relative`
 * (or it falls back to the viewport via `fixed`).
 */
export default function BottomSheet({
  label,
  onClose,
  header,
  children,
  fixed = false,
  maxHeight = '86%',
}: {
  label: string;
  onClose: () => void;
  header?: ReactNode;
  children: ReactNode;
  fixed?: boolean;
  maxHeight?: string;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grab = {
    onPointerDown: (e: React.PointerEvent) => { start.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); },
    onPointerUp: () => { if (drag > 80) onClose(); start.current = null; setDrag(0); },
    onPointerCancel: () => { start.current = null; setDrag(0); },
  };

  return (
    <div onClick={onClose} style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-end', background: 'var(--scrim)' }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 390, margin: '0 auto', maxHeight, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-100)', color: 'var(--ink)', borderTop: '1px solid var(--edge)', borderRadius: '14px 14px 0 0',
          boxShadow: 'var(--sheet-shadow)', paddingBottom: 'env(safe-area-inset-bottom)',
          transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? undefined : 'transform .15s',
          animation: 'sheet-up .18s ease-out',
        }}
      >
        <div {...grab} style={{ flex: 'none', touchAction: 'none', cursor: 'grab' }}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <span aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--edge)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Close"
              style={{ flex: 'none', width: 44, height: 44, marginTop: 4, border: 0, background: 'none', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </section>
    </div>
  );
}
