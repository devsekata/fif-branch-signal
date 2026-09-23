# FIF Branch Signal

Next.js dashboard for FIF branch complaints, escalations, review integrity and Instagram listening. Data comes from the FIF Branch Signal API ([docs](https://api-fif.kepiai.co/docs/)).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

The API base URL defaults to `https://api-fif.kepiai.co`. To point at another environment, set it in `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=https://api-fif.kepiai.co
```

## Layout

| Path | What it holds |
| --- | --- |
| `app/` | One route per dashboard page: `/` (Overview), `/branches`, `/complaints`, `/escalations`, `/integrity`, `/social`, `/method`. |
| `components/Shell.tsx` | Sidebar, topbar filters (branch, data source, period) and the scope strip. |
| `components/views/` | One component per page; each reads its `/v1/pages/*` endpoint (Escalations reads `/v1/cases`). |
| `components/ChartBox.tsx` | Chart.js wrapper plus the shared chart theme. |
| `lib/api.ts` | `useApi` hook: builds the request URL, shares recent responses for 60 s, exposes loading/error/retry. |
| `lib/reference.tsx` | `/v1/meta` (branches, sync state) and `/v1/config` (topic taxonomy, scoring), loaded once. |
| `lib/scope.ts` | Maps the topbar filters to query params. |
| `lib/types.ts` | Response types. Items marked ASSUMED are not in the spec and were empty in every response so far. |

## Filters → query params

With the default filters every page request is just `?source=all`. `branch` (a branch id from `/v1/meta`) and `from` (latest data date minus 90/180/365 days) are only sent when chosen, and only on pages that show that filter.
