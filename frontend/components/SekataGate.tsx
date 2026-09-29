'use client';

import type { ReactNode } from 'react';
import { refreshSekata, type SekataResult } from '@/lib/sekata';

/** Loading and error states for a connector payload. */
export function SekataState<T>({ res, children }: { res: SekataResult<T>; children: (data: T) => ReactNode }) {
  if (res.error) {
    return (
      <div className="panel api-state">
        <h3>The Sekata connector did not answer</h3>
        <p className="p-note">{res.error}</p>
        <button className="btn" onClick={refreshSekata}>Try again</button>
      </div>
    );
  }
  if (res.data === undefined) return <div className="panel api-state"><p className="p-note">Loading from the Sekata connector…</p></div>;
  return <>{children(res.data)}</>;
}
