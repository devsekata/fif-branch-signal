'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import type { ChartConfiguration, ChartConfigurationCustomTypesPerDataset, ChartType } from 'chart.js';

export type ChartConfig<T extends ChartType = ChartType> =
  | ChartConfiguration<T>
  | ChartConfigurationCustomTypesPerDataset<T>;

export const AXIS = { grid: { color: '#E6EDEC', drawTicks: false }, border: { display: false }, ticks: { padding: 8 } };
export const NOGRID = { grid: { display: false }, border: { display: false }, ticks: { padding: 6 } };

let themed = false;

/** Canvas text can't use CSS classes, so read the next/font family names off the root variables once. */
function applyTheme() {
  if (themed) return;
  themed = true;
  const css = getComputedStyle(document.documentElement);
  const body = css.getPropertyValue('--font-jakarta').trim() || "'Plus Jakarta Sans'";
  const head = css.getPropertyValue('--font-sora').trim() || "'Sora'";
  const d = Chart.defaults;
  d.font.family = `${body},system-ui,sans-serif`;
  d.font.size = 11;
  d.color = '#7C9491';
  d.plugins.tooltip.backgroundColor = '#0B2320';
  d.plugins.tooltip.padding = 10;
  d.plugins.tooltip.cornerRadius = 8;
  d.plugins.tooltip.titleFont = { family: head, size: 11.5, weight: 600 };
  d.plugins.tooltip.bodyFont = { family: body, size: 11.5 };
  d.plugins.tooltip.displayColors = false;
  d.plugins.legend.labels.usePointStyle = true;
  d.plugins.legend.labels.boxWidth = 6;
  d.plugins.legend.labels.padding = 14;
}

/** A Chart.js canvas that is rebuilt whenever `config` changes identity; memoise the config. */
export function ChartBox<T extends ChartType>({ config, size }: { config: ChartConfig<T>; size?: 'sm' | 'xs' | 'lg' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    applyTheme();
    const chart = new Chart(ref.current!, config);
    return () => chart.destroy();
  }, [config]);
  return (
    <div className={size ? `chart ${size}` : 'chart'}>
      <canvas ref={ref} />
    </div>
  );
}
