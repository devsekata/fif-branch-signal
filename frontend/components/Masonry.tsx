'use client';

import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Grid rows are this many pixels; a card spans as many as its height needs. */
const ROW = 4;
const GAP = 16;

/** Which column (0 or 1) each card goes in, so the two columns end as level as they can.
 *  A page holds a handful of cards, so every split is tried; the first card always opens the left column.
 *  Within a column the cards keep their order. Past 16 cards it falls back to "the shorter column next". */
function balance(spans: number[]): number[] {
  const n = spans.length;
  if (n > 16) {
    const b = [0, 0];
    return spans.map((s) => { const c = b[0] <= b[1] ? 0 : 1; b[c] += s; return c; });
  }
  const total = spans.reduce((a, s) => a + s, 0);
  /* Bit i set puts card i on the right; bit 0 stays clear. */
  const splits: { mask: number; diff: number; order: number }[] = [];
  for (let mask = 2; mask < 1 << n; mask += 2) {
    let right = 0, cost = 0;
    for (let i = 1; i < n; i++) if (mask & (1 << i)) { right += spans[i]; cost += i; }
    /* order: how far down the list the right column's cards sit, the last tie-break. */
    splits.push({ mask, diff: Math.abs(total - 2 * right), order: cost });
  }
  if (!splits.length) return spans.map(() => 0);
  /* Among the splits within ~120px of the most level one, the one whose right column holds the earliest cards,
   * so the page still reads top to bottom: the second card opens the right column wherever it can. */
  const level = Math.min(...splits.map((s) => s.diff));
  const near = splits.filter((s) => s.diff <= level + 120 / ROW);
  const first = (m: number) => { for (let i = 1; i < n; i++) if (m & (1 << i)) return i; return n; };
  near.sort((a, b) => first(a.mask) - first(b.mask) || a.diff - b.diff || a.order - b.order);
  const best = near[0].mask;
  return spans.map((_, i) => ((best >> i) & 1));
}

/** Cards in two equal columns, split so the two columns end as level as they can.
 *  How tall a card is depends on the data in view, so a fixed left/right split leaves one column
 *  far longer than the other whenever a scope empties some cards; the split is redone whenever a card resizes.
 *  Below 1180px the grid is one column and the cards simply follow each other. */
export function Masonry({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    let frame = 0;
    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
        const items = Array.from(grid.children) as HTMLElement[];
        const spans = items.map((el) => Math.max(1, Math.ceil((el.getBoundingClientRect().height + GAP) / ROW)));
        const side = cols === 2 ? balance(spans) : spans.map(() => 0);
        const bottoms = [0, 0];
        items.forEach((el, i) => {
          const col = side[i];
          el.style.gridColumn = String(col + 1);
          el.style.gridRow = `${bottoms[col] + 1} / span ${spans[i]}`;
          bottoms[col] += spans[i];
        });
      });
    };
    /* A card grows when its chart or list arrives, so every card is watched, not just the grid. */
    const ro = new ResizeObserver(layout);
    ro.observe(grid);
    for (const el of Array.from(grid.children)) ro.observe(el);
    layout();
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [children]);

  return (
    <div ref={ref} className={className ? `masonry ${className}` : 'masonry'}>
      {Children.toArray(children).filter(Boolean)}
    </div>
  );
}
