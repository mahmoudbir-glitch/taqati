"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { clockTime } from "../lib/format";

const MARGIN = { left: 46, right: 22, top: 12, bottom: 26 };
const HOUR_MS = 3_600_000;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// Rounds up to a value whose quarters are clean axis labels.
function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = [1, 2, 4, 5, 8, 10].find((candidate) => scaled <= candidate) ?? 10;
  return step * magnitude;
}

const swatch = (color: string) => ({ "--swatch": color }) as CSSProperties;

const pointerX = (event: PointerEvent<SVGSVGElement>) => event.clientX - event.currentTarget.getBoundingClientRect().left;

function ValueAxis({ max, width, plotHeight, formatTick }: { max: number; width: number; plotHeight: number; formatTick: (value: number) => string }) {
  return (
    <g>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = MARGIN.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={y + 4} textAnchor="end">{formatTick(max * fraction)}</text>
          </g>
        );
      })}
    </g>
  );
}

export type TimePoint = { at: number; value: number };
export type TimeSeries = { key: string; label: string; color: string; points: TimePoint[]; area?: boolean };

/** Line/area chart over a time window, with a crosshair tooltip. */
export function TimeChart({
  label,
  series,
  start,
  end,
  formatValue,
  formatTick,
  yMax,
  reference,
  height = 240,
}: {
  label: string;
  series: TimeSeries[];
  start: number;
  end: number;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  yMax?: number;
  reference?: { value: number; label: string };
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [hoverAt, setHoverAt] = useState<number | null>(null);

  const hasData = series.some((item) => item.points.length > 1);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const max = yMax ?? niceMax(Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value))));
  const x = (at: number) => MARGIN.left + ((at - start) / (end - start)) * plotWidth;
  const y = (value: number) => MARGIN.top + plotHeight * (1 - Math.min(Math.max(value, 0), max) / max);
  const baseline = MARGIN.top + plotHeight;

  const totalHours = (end - start) / HOUR_MS;
  const hourStep = [1, 2, 3, 4, 6, 12].find((step) => totalHours / step <= plotWidth / 56) ?? 12;
  const hourTicks: number[] = [];
  for (let at = start; at <= end; at += hourStep * HOUR_MS) hourTicks.push(at);

  const nearest = (points: TimePoint[], at: number) =>
    points.reduce<TimePoint | null>((best, point) => (!best || Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best), null);

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const ratio = (pointerX(event) - MARGIN.left) / plotWidth;
    setHoverAt(ratio < 0 || ratio > 1 ? null : start + ratio * (end - start));
  };

  const anchor = hoverAt === null ? null : nearest(series[0]?.points ?? [], hoverAt);
  const hovered = anchor ? series.map((item) => ({ item, point: nearest(item.points, anchor.at) })) : [];

  return (
    <div className="chart" ref={ref}>
      {!hasData ? (
        <div className="chart-empty" dir="rtl">لا توجد قراءات كافية لرسم هذا المخطط بعد.</div>
      ) : width > 0 ? (
        <>
          <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverAt(null)}>
            <ValueAxis max={max} width={width} plotHeight={plotHeight} formatTick={formatTick} />
            {hourTicks.map((at) => (
              <text key={at} x={x(at)} y={height - 8} textAnchor="middle">{clockTime(at)}</text>
            ))}
            {reference && (
              <g>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--critical)" strokeWidth={1} />
                <text x={width - MARGIN.right} y={y(reference.value) - 5} textAnchor="end">{reference.label}</text>
              </g>
            )}
            {series.map((item) => {
              const first = item.points[0];
              const last = item.points[item.points.length - 1];
              if (!first || !last) return null;
              const line = item.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.at).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
              return (
                <g key={item.key}>
                  {item.area && <path d={`${line} L${x(last.at).toFixed(1)} ${baseline} L${x(first.at).toFixed(1)} ${baseline} Z`} fill={item.color} opacity={0.12} />}
                  <path d={line} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}
            {anchor && (
              <g>
                <line x1={x(anchor.at)} x2={x(anchor.at)} y1={MARGIN.top} y2={baseline} stroke="var(--muted)" strokeWidth={1} />
                {hovered.map(({ item, point }) =>
                  point ? <circle key={item.key} cx={x(point.at)} cy={y(point.value)} r={5} fill={item.color} stroke="var(--surface)" strokeWidth={2} /> : null,
                )}
              </g>
            )}
          </svg>
          {anchor && (
            <div className="chart-tooltip" style={{ left: Math.min(Math.max(x(anchor.at), 76), width - 76) }}>
              <strong>{clockTime(anchor.at)}</strong>
              {hovered.map(({ item, point }) => (
                <div key={item.key}>
                  <span>
                    <i className="swatch" style={swatch(item.color)} />
                    {item.label}
                  </span>
                  <bdi dir="ltr">{point ? formatValue(point.value) : "—"}</bdi>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

export type BarSeries = { key: string; label: string; color: string; values: number[] };

/** Grouped column chart with one group per category and a per-group tooltip. */
export function BarChart({
  label,
  categories,
  series,
  formatValue,
  formatTick,
  height = 240,
}: {
  label: string;
  categories: ReadonlyArray<{ key: string; short: string; full: string }>;
  series: BarSeries[];
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotHeight;
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.values)));
  const band = plotWidth / Math.max(categories.length, 1);
  const gap = 2;
  const barWidth = Math.max(2, Math.min(24, (band * 0.72 - gap * (series.length - 1)) / Math.max(series.length, 1)));
  const groupWidth = barWidth * series.length + gap * (series.length - 1);
  const labelEvery = Math.max(1, Math.ceil(categories.length / Math.max(1, Math.floor(plotWidth / 44))));

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const index = Math.floor((pointerX(event) - MARGIN.left) / band);
    setHoverIndex(index >= 0 && index < categories.length ? index : null);
  };

  const hoveredCategory = hoverIndex === null ? undefined : categories[hoverIndex];

  return (
    <div className="chart" ref={ref}>
      {categories.length === 0 ? (
        <div className="chart-empty" dir="rtl">لا توجد بيانات يومية لعرضها.</div>
      ) : width > 0 ? (
        <>
          <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverIndex(null)}>
            <ValueAxis max={max} width={width} plotHeight={plotHeight} formatTick={formatTick} />
            {categories.map((category, index) => {
              const groupX = MARGIN.left + band * index + (band - groupWidth) / 2;
              return (
                <g key={category.key}>
                  {hoverIndex === index && <rect x={MARGIN.left + band * index} y={MARGIN.top} width={band} height={plotHeight} fill="var(--muted)" opacity={0.1} />}
                  {series.map((item, seriesIndex) => {
                    const barHeight = Math.max(0, ((item.values[index] ?? 0) / max) * plotHeight);
                    const radius = Math.min(4, barWidth / 2, barHeight);
                    const left = groupX + seriesIndex * (barWidth + gap);
                    const top = baseline - barHeight;
                    // Rounded at the data end, square at the baseline.
                    const path = `M${left} ${baseline} V${top + radius} Q${left} ${top} ${left + radius} ${top} H${left + barWidth - radius} Q${left + barWidth} ${top} ${left + barWidth} ${top + radius} V${baseline} Z`;
                    return barHeight > 0 ? <path key={item.key} d={path} fill={item.color} /> : null;
                  })}
                  {index % labelEvery === 0 && (
                    <text x={MARGIN.left + band * index + band / 2} y={height - 8} textAnchor="middle">{category.short}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hoverIndex !== null && hoveredCategory && (
            <div className="chart-tooltip" style={{ left: Math.min(Math.max(MARGIN.left + band * hoverIndex + band / 2, 76), width - 76) }}>
              <strong>{hoveredCategory.full}</strong>
              {series.map((item) => (
                <div key={item.key}>
                  <span>
                    <i className="swatch" style={swatch(item.color)} />
                    {item.label}
                  </span>
                  <bdi dir="ltr">{formatValue(item.values[hoverIndex] ?? 0)}</bdi>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}
