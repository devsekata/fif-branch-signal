'use client';

import { useSyncExternalStore } from 'react';

/* In-app notices, in place of the browser's alert and prompt boxes: those freeze the page and
 * cannot be styled. A module-level list like caseStore, so any component can raise one without
 * a provider. The <Toaster /> in the shell draws them. */

export type ToastTone = 'ok' | 'bad' | 'info';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** Set when it asks for a line of text: drawn as a modal, not a toast, and it stays until answered. */
  ask?: { placeholder?: string; initial: string; confirm: string; resolve: (answer: string | null) => void };
}

let list: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function dismissToast(id: number) {
  list = list.filter((t) => t.id !== id);
  emit();
}

/** A short notice that clears itself. */
export function toast(text: string, tone: ToastTone = 'info', ms = 4200) {
  if (list.some((t) => t.text === text)) return;
  const id = ++seq;
  list = [...list, { id, text, tone }];
  emit();
  setTimeout(() => dismissToast(id), ms);
}

/** Asks for one line of text in a modal. Resolves with the answer, or null when dismissed. */
export function askModal(text: string, opts: { initial?: string; placeholder?: string; confirm?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const id = ++seq;
    const done = (answer: string | null) => { dismissToast(id); resolve(answer); };
    list = [...list, { id, text, tone: 'info', ask: { initial: opts.initial ?? '', placeholder: opts.placeholder, confirm: opts.confirm ?? 'OK', resolve: done } }];
    emit();
  });
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const EMPTY: Toast[] = [];

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => list, () => EMPTY);
}
