'use client';

import { useEffect, useRef, useState } from 'react';
import { STAR, fmt, shortBranch } from '@/lib/theme';

/* The rating mix as a treemap: one tile per branch, its area the number of ratings, and inside it
 * the 1★ to 5★ shares stacked from the bottom. Size reads as volume and colour as mix at once,
 * which the bar chart can only do for the thirty branches it has room for. Drawn with plain
 * boxes; a squarified layout keeps the tiles close to square so small shares stay visible. */

export interface TreemapItem { id: string; name: string; stars: [number, number, number, number, number] }

type Rect = { x: number; y: number; w: number; h: number };
type Placed = Rect & { item: TreemapItem; total: number };

const HEIGHT = 460;

/** Squarified treemap (Bruls, Huizing and van Wijk): rows are grown while that improves their worst aspect ratio. */
function squarify(items: { item: TreemapItem; total: number }[], box: Rect): Placed[] {
  const sum = items.reduce((a, x) => a + x.total, 0);
  if (!sum || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / sum;
  const rest = [...items].sort((a, b) => b.total - a.total).map((x) => ({ ...x, area: x.total * scale }));
  const out: Placed[] = [];
  const rect = { ...box };
  const worst = (row: { area: number }[], side: number) => {
    const s = row.reduce((a, x) => a + x.area, 0);
    const max = Math.max(...row.map((x) => x.area)), min = Math.min(...row.map((x) => x.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const lay = (row: typeof rest) => {
    const s = row.reduce((a, x) => a + x.area, 0);
    if (rect.w >= rect.h) {
      /* A column down the left edge. */
      const w = s / rect.h;
      let y = rect.y;
      for (const x of row) { const h = x.area / w; out.push({ x: rect.x, y, w, h, item: x.item, total: x.total }); y += h; }
      rect.x += w; rect.w -= w;
    } else {
      /* A row along the top edge. */
      const h = s / rect.w;
      let x0 = rect.x;
      for (const x of row) { const w = x.area / h; out.push({ x: x0, y: rect.y, w, h, item: x.item, total: x.total }); x0 += w; }
      rect.y += h; rect.h -= h;
    }
  };
  let row: typeof rest = [];
  while (rest.length) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, rest[0]], side) <= worst(row, side)) row.push(rest.shift()!);
    else { lay(row); row = []; }
  }
  if (row.length) lay(row);
  return out;
}

export function RatingTreemap({ items, onOpen }: { items: TreemapItem[]; onOpen?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tiles = squarify(
    items.map((item) => ({ item, total: item.stars.reduce((a, b) => a + b, 0) })).filter((x) => x.total > 0),
    { x: 0, y: 0, w: width, h: HEIGHT },
  );

  return (
    <div ref={ref} className="treemap" style={{ height: HEIGHT }}>
      {tiles.map((t) => {
        const low = t.item.stars[0] + t.item.stars[1];
        const label = t.w > 74 && t.h > 36;
        return (
          <div
            key={t.item.id} className="tm-tile" role={onOpen ? 'button' : undefined}
            style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
            title={`${t.item.name}\n${fmt(t.total)} ratings · ${Math.round((100 * low) / t.total)}% at 1–2★\n`
              + t.item.stars.map((n, i) => `${i + 1}★ ${fmt(n)}`).join(' · ')}
            onClick={onOpen ? () => onOpen(t.item.id) : undefined}
          >
            {/* 5★ on top down to 1★ at the bottom, so a red floor is a branch with a one-star problem. */}
            <div className="tm-mix">
              {[4, 3, 2, 1, 0].map((i) => t.item.stars[i] > 0 && (
                <i key={i} style={{ flexGrow: t.item.stars[i], background: STAR[i] }} />
              ))}
            </div>
            {label && (
              <div className="tm-label">
                <b>{shortBranch(t.item.name)}</b>
                <span>{fmt(t.total)} · {Math.round((100 * low) / t.total)}% 1–2★</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
