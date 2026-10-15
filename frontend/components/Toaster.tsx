'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { dismissToast, useToasts, type Toast } from '@/lib/toast';

/** Draws the toasts at the bottom right of the viewport, and a question as a modal in the middle.
 *  Only the toasts themselves take clicks, so the stack never blocks the page behind it or its scrolling. */
export function Toaster() {
  const all = useToasts();
  if (typeof document === 'undefined' || !all.length) return null;
  const toasts = all.filter((t) => !t.ask);
  const asking = all.find((t) => t.ask);
  return createPortal(
    <>
      {toasts.length > 0 && (
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => <ToastCard key={t.id} t={t} />)}
        </div>
      )}
      {asking && <AskModal key={asking.id} t={asking} />}
    </>,
    document.body,
  );
}

function AskModal({ t }: { t: Toast }) {
  const ask = t.ask!;
  const [value, setValue] = useState(ask.initial);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) ask.resolve(null); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={t.text}
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) ask.resolve(value); }}
        /* Escape closes the modal only; the case drawer underneath stays open. */
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); ask.resolve(null); } }}>
        <div className="modal-title">{t.text}</div>
        <textarea autoFocus value={value} placeholder={ask.placeholder} rows={3} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (value.trim()) ask.resolve(value); } }} />
        <div className="modal-actions">
          <button type="button" className="btn2" onClick={() => ask.resolve(null)}>Cancel</button>
          <button type="submit" className="btn2 solid" disabled={!value.trim()}>{ask.confirm}</button>
        </div>
      </form>
    </div>
  );
}

function ToastCard({ t }: { t: Toast }) {
  return (
    <div className={`toast ${t.tone}`} role="status">
      <i className="toast-dot" />
      <div className="toast-text">{t.text}</div>
      <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">×</button>
    </div>
  );
}
