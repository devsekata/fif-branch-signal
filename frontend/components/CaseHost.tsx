'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { CaseDrawer } from '@/components/CaseDrawer';
import type { RoleId } from '@/lib/caseflow';
import { toRow } from '@/lib/caseRow';
import { useReference } from '@/lib/reference';
import { useSession } from '@/lib/session';
import type { CaseItem } from '@/lib/types';

/** The case drawer for any list of cases: call `open(case_id)` from a row and render `drawer` once. */
export function useCaseDrawer(pool: CaseItem[]): { open: (id: string) => void; has: (id: string) => boolean; drawer: ReactNode } {
  const [openId, setOpenId] = useState<string | null>(null);
  const session = useSession();
  const { topic } = useReference();
  const role: RoleId = session?.role ?? 'cx';
  const close = useCallback(() => setOpenId(null), []);
  const hit = openId ? pool.find((c) => c.case_id === openId) : undefined;
  const row = hit && toRow(hit);
  return {
    open: setOpenId,
    has: (id) => pool.some((c) => c.case_id === id),
    /* The drawer needs topic labels too, because a track is decided on the topic, not the id. */
    drawer: row ? (
      <CaseDrawer
        key={row.id}
        c={{ ...row, topicLabels: row.topics.map((t) => topic(t)?.label ?? '') }}
        role={role}
        email={session?.email ?? ''}
        onClose={close}
      />
    ) : null,
  };
}
