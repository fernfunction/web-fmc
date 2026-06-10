import { useEffect, useRef, useSyncExternalStore } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  getSeries,
  getTimeColumn,
  subscribeTelemetry,
  telemetryVersion,
  type SeriesKey,
} from '../telemetry';
import styles from './charts.module.css';

export interface ChartField {
  key: SeriesKey;
  label: string;
  color: string;
  fmt?: (v: number) => string;
}

// sensible default precision by magnitude, mach gets 3 decimals, temps 1, big values none
function fmtValue(v: number | null | undefined, fmt?: (v: number) => string): string {
  if (v === null || v === undefined) return '--';
  if (fmt) return fmt(v);
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

const AXIS_STYLE: uPlot.Axis = {
  stroke: '#8b8e93',
  grid: { stroke: '#23262a', width: 1 },
  ticks: { stroke: '#2c2f34', width: 1 },
  font: '10px "B612 Mono", monospace',
};

function fmtClock(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function TimeChart({
  title,
  fields,
  height = 110,
  minSpan,
}: {
  title: string;
  fields: ChartField[];
  height?: number;
  // smallest y axis span: keeps micro noise from filling the whole chart height
  minSpan?: number;
}) {
  const version = useSyncExternalStore(subscribeTelemetry, telemetryVersion);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const yRange = (_u: uPlot, min: number, max: number): [number, number] => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
      const span = max - min;
      if (minSpan && span < minSpan) {
        const mid = (min + max) / 2;
        return [mid - minSpan / 2, mid + minSpan / 2];
      }
      const pad = span * 0.1 || 1;
      return [min - pad, max + pad];
    };
    const chart = new uPlot(
      {
        width: host.clientWidth || 300,
        height,
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: true }, y: { range: yRange } },
        series: [
          { label: 't' },
          ...fields.map((f) => ({
            label: f.label,
            stroke: f.color,
            width: 1.5,
            points: { show: false },
            spanGaps: false,
          })),
        ],
        axes: [
          {
            ...AXIS_STYLE,
            space: 80,
            values: (_u, splits) => splits.map((s) => fmtClock(s)),
          },
          { ...AXIS_STYLE, size: 52 },
        ],
      },
      [[], ...fields.map(() => [])] as uPlot.AlignedData,
      host,
    );
    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      chart.setSize({ width: host.clientWidth || 300, height });
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
    // fields are static per chart instance, mount once
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const data = [getTimeColumn(), ...fields.map((f) => getSeries(f.key))] as uPlot.AlignedData;
    chart.setData(data, true);
  }, [version]);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.counters}>
          {fields.map((f) => (
            <span key={f.key} className={styles.counter} style={{ color: f.color }}>
              {f.label} {fmtValue(getSeries(f.key).at(-1), f.fmt)}
            </span>
          ))}
        </span>
      </div>
      <div ref={hostRef} />
    </div>
  );
}
