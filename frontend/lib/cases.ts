'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiUrl, getJson, type ApiResult, type Params } from './api';
import type { CaseItem, CasesResponse } from './types';

const PAGE = 200;
/** Where a queue stops reading and says it is partial. */
const CAP = 2000;

export interface CaseList {
  items: CaseItem[];
  total: number;
  /** True when the API holds more cases than were read. */
  partial: boolean;
}

/* The API returns at most 200 cases a call. Pages are read one after another: each is a heavy
 * query, and several at once has had the API dropping its database connection. */
async function load(params: Params, fresh: boolean): Promise<CaseList> {
  const url = (offset: number) => apiUrl('/v1/cases', { ...params, limit: PAGE, offset });
  const first = await getJson<CasesResponse>(url(0), fresh);
  const total = first.page.total;
  const items = [...first.items];
  for (let o = PAGE; o < Math.min(total, CAP); o += PAGE) items.push(...(await getJson<CasesResponse>(url(o), fresh)).items);
  return { items, total, partial: total > items.length };
}

/** Every case matching `params`, across as many pages as it takes. Pass `null` to skip. */
export function useCaseList(params: Params | null): ApiResult<CaseList> {
  const key = params === null ? null : apiUrl('/v1/cases', params);
  const [attempt, setAttempt] = useState(0);
  const [res, setRes] = useState<{ key: string; data?: CaseList; error?: string } | null>(null);
  const id = `${key}#${attempt}`;
  useEffect(() => {
    if (key === null) return;
    let live = true;
    load(params!, attempt > 0).then(
      (data) => { if (live) setRes({ key: id, data }); },
      (e: Error) => { if (live) setRes({ key: id, error: `${e.message} — /v1/cases` }); },
    );
    return () => { live = false; };
    // `params` is covered by `key`, which is built from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return useMemo(() => {
    const settled = res?.key === id;
    return {
      data: res?.data,
      error: settled ? res?.error : undefined,
      loading: key !== null && !settled,
      retry: () => setAttempt((a) => a + 1),
    };
  }, [res, id, key]);
}
