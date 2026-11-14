import React, { useState } from 'react';
import { formatCurrency, formatPercent } from '../utils/calculations';

export interface PieSlice {
  id: string;
  name: string;
  value: number;
  percentage?: number;
  color: string;
  subtitle?: string;
}

interface InteractivePieChartProps {
  slices: PieSlice[];
  variant?: 'pie' | 'donut';
  currency?: string;
  emptyMessage?: string;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describePieSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, rOuter, endAngle);
  const outerEnd = polarToCartesian(cx, cy, rOuter, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';

  if (rInner <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${outerEnd.x} ${outerEnd.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerStart.x} ${outerStart.y}`,
      'Z',
    ].join(' ');
  }

  const innerStart = polarToCartesian(cx, cy, rInner, endAngle);
  const innerEnd = polarToCartesian(cx, cy, rInner, startAngle);

  return [
    `M ${outerEnd.x} ${outerEnd.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerStart.x} ${outerStart.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

export const InteractivePieChart: React.FC<InteractivePieChartProps> = ({
  slices,
  variant = 'pie',
  currency = 'NPR',
  emptyMessage = 'No positive balance available to chart yet.',
  centerLabel,
  centerValue,
  size = 240,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const positiveSlices = slices.filter((s) => s.value > 0);
  const totalValue = positiveSlices.reduce((sum, s) => sum + s.value, 0);

  const activeId = hoveredId ?? pinnedId;
  const activeSlice = slices.find((s) => s.id === activeId) || null;

  if (positiveSlices.length === 0 || totalValue <= 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
        <div className="w-16 h-16 rounded-full border-4 border-slate-200 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">{emptyMessage}</p>
        <p className="text-xs text-slate-500 mt-1">
          Record positive sales or net income to populate this allocation chart.
        </p>
      </div>
    );
  }

  const cx = 120;
  const cy = 120;
  const rOuter = 100;
  const rInner = variant === 'donut' ? 58 : 0;

  let currentAngle = 0;
  const computedSlices = positiveSlices.map((slice) => {
    const sharePct =
      typeof slice.percentage === 'number'
        ? slice.percentage
        : (slice.value / totalValue) * 100;
    const angleSpan = (slice.value / totalValue) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleSpan;
    const midAngle = startAngle + angleSpan / 2;
    currentAngle = endAngle;
    return {
      ...slice,
      sharePct,
      startAngle,
      endAngle,
      midAngle,
      isFullCircle: angleSpan >= 359.99,
    };
  });

  const handleTogglePin = (id: string) => {
    setPinnedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
      <div className="relative flex items-center justify-center mx-auto">
        <svg
          width={size}
          height={size}
          viewBox="0 0 240 240"
          role="img"
          aria-label="Interactive financial pie chart"
          className="overflow-visible select-none"
        >
          {computedSlices.map((slice) => {
            const isActive = activeId === slice.id;
            const isDimmed = activeId !== null && !isActive;

            const offsetRadius = isActive ? 6 : 0;
            const midRad = ((slice.midAngle - 90) * Math.PI) / 180;
            const tx = Math.cos(midRad) * offsetRadius;
            const ty = Math.sin(midRad) * offsetRadius;

            if (slice.isFullCircle) {
              return (
                <g
                  key={slice.id}
                  transform={`translate(${tx}, ${ty})`}
                  className="transition-transform duration-150 ease-out cursor-pointer focus:outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${slice.name}: ${formatCurrency(slice.value, currency)} (${formatPercent(slice.sharePct)})`}
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleTogglePin(slice.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTogglePin(slice.id);
                    } else if (e.key === 'Escape') {
                      setPinnedId(null);
                    }
                  }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={rOuter}
                    fill={slice.color}
                    opacity={isDimmed ? 0.35 : 1}
                  />
                  {rInner > 0 && (
                    <circle cx={cx} cy={cy} r={rInner} fill="#FFFFFF" />
                  )}
                </g>
              );
            }

            const pathData = describePieSlice(
              cx,
              cy,
              rOuter,
              rInner,
              slice.startAngle,
              slice.endAngle
            );

            return (
              <path
                key={slice.id}
                d={pathData}
                fill={slice.color}
                stroke="#FFFFFF"
                strokeWidth={2}
                opacity={isDimmed ? 0.35 : 1}
                transform={`translate(${tx}, ${ty})`}
                className="transition-all duration-150 ease-out cursor-pointer focus:outline-none"
                tabIndex={0}
                role="button"
                aria-label={`${slice.name}: ${formatCurrency(slice.value, currency)} (${formatPercent(slice.sharePct)})`}
                onMouseEnter={() => setHoveredId(slice.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleTogglePin(slice.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTogglePin(slice.id);
                  } else if (e.key === 'Escape') {
                    setPinnedId(null);
                  }
                }}
              />
            );
          })}

          {variant === 'donut' && (
            <g className="pointer-events-none">
              <text
                x={cx}
                y={cy - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] font-medium"
              >
                {activeSlice ? activeSlice.name.slice(0, 18) : centerLabel || 'Total'}
              </text>
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                className="fill-slate-900 text-[15px] font-semibold font-mono tabular-nums"
              >
                {activeSlice
                  ? formatCurrency(activeSlice.value, currency)
                  : centerValue || formatCurrency(totalValue, currency)}
              </text>
              {activeSlice && (
                <text
                  x={cx}
                  y={cy + 30}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-mono tabular-nums"
                >
                  {formatPercent(
                    typeof activeSlice.percentage === 'number'
                      ? activeSlice.percentage
                      : (activeSlice.value / totalValue) * 100
                  )}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      <div className="space-y-1.5 min-w-0">
        {activeSlice ? (
          <div className="mb-3 pb-2.5 border-b border-slate-200 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: activeSlice.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  {activeSlice.name}
                </span>
              </div>
              {activeSlice.subtitle && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {activeSlice.subtitle}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                {formatCurrency(activeSlice.value, currency)}
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500 ml-1.5">
                {formatPercent(
                  typeof activeSlice.percentage === 'number'
                    ? activeSlice.percentage
                    : (activeSlice.value / totalValue) * 100
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-3 pb-2.5 border-b border-slate-200 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-slate-500">
              Hover or click a slice to inspect
            </span>
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-900">
              {formatCurrency(totalValue, currency)}
            </span>
          </div>
        )}

        <ul className="space-y-1">
          {slices.map((slice) => {
            const sharePct =
              typeof slice.percentage === 'number'
                ? slice.percentage
                : totalValue > 0
                  ? (slice.value / totalValue) * 100
                  : 0;
            const isActive = activeId === slice.id;

            return (
              <li key={slice.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHoveredId(slice.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleTogglePin(slice.id)}
                  className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium truncate">
                      {slice.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
                    <span className="text-slate-500 w-12 text-right">
                      {formatPercent(sharePct)}
                    </span>
                    <span className="font-semibold text-slate-900 w-24 text-right">
                      {formatCurrency(slice.value, currency)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
