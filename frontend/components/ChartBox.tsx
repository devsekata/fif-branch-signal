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

/* A horizontal bar chart is only readable when the band each bar sits in is tall enough. Rather
 * than hand-tuning a height per panel, every chart drawn on the y axis sizes its own container
 * from how many categories it has. */
function fitHeight(config: ChartConfig): number | undefined {
  const o = config.options as { indexAxis?: string; scales?: { y?: { stacked?: boolean } } } | undefined;
  const n = config.data.labels?.length ?? 0;
  if (o?.indexAxis !== 'y' || !n) return undefined;
  const series = o.scales?.y?.stacked ? 1 : config.data.datasets.length || 1;
  const band = Math.max(22, Math.min(44, 14 + series * 9));
  return Math.max(190, Math.min(680, n * band + 64));
}

/** A Chart.js canvas that is rebuilt whenever `config` changes identity; memoise the config. */
export function ChartBox<T extends ChartType>({ config, size }: { config: ChartConfig<T>; size?: 'sm' | 'xs' | 'lg' | 'donut' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    applyTheme();
    const chart = new Chart(ref.current!, config);
    return () => chart.destroy();
  }, [config]);
  const height = fitHeight(config as ChartConfig);
  return (
    <div className={size ? `chart ${size}` : 'chart'} style={height ? { height } : undefined}>
      <canvas ref={ref} />
    </div>
  );
}
