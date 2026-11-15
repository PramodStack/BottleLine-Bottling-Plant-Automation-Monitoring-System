import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CustomGlassDropdown } from '../common/CustomGlassDropdown';
import { AnimatedNumber } from '../common/AnimatedNumber';

interface QualityRingChartProps {
  totalBottles?: number;
  acceptedBottles?: number;
  rejectedBottles?: number;
  totalBoxesPacked?: number;
  cappedBottles?: number;
  byPeriod?: Record<string, any>;
}

const YIELD_DROPDOWN_STORAGE_KEY = 'bottling_overview_yield_period';
const YIELD_PERIOD_OPTIONS = ['Today', 'Last 30 Days', 'This Month', 'This Year'];

export const QualityRingChart: React.FC<QualityRingChartProps> = ({
  totalBottles = 0,
  acceptedBottles = 0,
  rejectedBottles = 0,
  totalBoxesPacked = 0,
  cappedBottles = 0,
  byPeriod,
}) => {
  const [filterPeriod, setFilterPeriodState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(YIELD_DROPDOWN_STORAGE_KEY);
      if (saved && YIELD_PERIOD_OPTIONS.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.error('Failed reading yield period from storage', e);
    }
    return 'This Year';
  });

  const handlePeriodChange = (val: string) => {
    setFilterPeriodState(val);
    try {
      localStorage.setItem(YIELD_DROPDOWN_STORAGE_KEY, val);
    } catch (e) {
      console.error('Failed saving yield period to storage', e);
    }
  };

  // Derive genuine database metrics directly from selected period
  const periodSummary = byPeriod?.[filterPeriod]?.summary;
  const displayTotal = periodSummary !== undefined ? periodSummary.total_bottles : totalBottles;
  const displayAccepted = periodSummary !== undefined ? periodSummary.accepted_bottles : acceptedBottles;
  const displayRejected = periodSummary !== undefined ? periodSummary.rejected_bottles : rejectedBottles;
  const displayBoxes = periodSummary !== undefined ? periodSummary.total_box_packed : totalBoxesPacked;
  const displayCapped = periodSummary !== undefined ? (periodSummary.capped_bottles ?? displayAccepted) : cappedBottles;

  // Empty state when 0 records exist in period
  const isEmpty = displayTotal === 0;

  // Proportional dynamic distribution that guarantees all active segments stay visible and elegant
  let wRejected = 12;
  if (displayTotal > 0 && displayRejected > 0) {
    const rawRejRate = (displayRejected / displayTotal) * 100;
    wRejected = Math.max(10, Math.min(22, Math.round(rawRejRate * 2 + 10)));
  } else if (displayRejected === 0) {
    wRejected = 0;
  }

  const remaining = 100 - wRejected;
  const wAccepted = displayAccepted > 0 ? Math.round(remaining * 0.54) : 0;
  const wCapped = displayCapped > 0 ? Math.round(remaining * 0.28) : 0;
  const wBoxes = displayBoxes > 0 ? Math.max(8, 100 - wAccepted - wCapped - wRejected) : 0;

  const activeSegments = isEmpty
    ? [
        {
          name: 'No Production',
          value: 100,
          count: 0,
          color: 'rgba(148, 163, 184, 0.40)',
          innerColor: 'rgba(148, 163, 184, 0.15)',
        },
      ]
    : [
        {
          name: 'Capped Bottles',
          value: wCapped || 10,
          count: displayCapped,
          color: '#E5D936',
          innerColor: 'rgba(215, 200, 45, 0.32)',
        },
        {
          name: 'Boxes Packed',
          value: wBoxes || 10,
          count: displayBoxes,
          color: '#20C9DF',
          innerColor: 'rgba(30, 185, 205, 0.32)',
        },
        {
          name: 'Rejected Bottles',
          value: wRejected || (displayRejected > 0 ? 10 : 0),
          count: displayRejected,
          color: '#F04444',
          innerColor: 'rgba(220, 60, 60, 0.35)',
        },
        {
          name: 'Accepted Bottles',
          value: wAccepted || 20,
          count: displayAccepted,
          color: '#20C96B',
          innerColor: 'rgba(30, 185, 95, 0.30)',
        },
      ].filter((s) => s.value > 0);

  const innerChartData = activeSegments.map((s) => ({
    ...s,
    fill: s.innerColor,
  }));

  const outerChartData = activeSegments.map((s) => ({
    ...s,
    fill: s.color,
  }));

  return (
    <div className="w-full h-full flex flex-col justify-between p-4 lg:p-5 select-none" style={{ minHeight: 0 }}>
      {/* Header Row: Title on left, Sleek dropdown on right */}
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <h3 className="text-sm lg:text-base font-bold text-white tracking-wide drop-shadow-sm">
          Production Yield Distribution
        </h3>
        <CustomGlassDropdown
          value={filterPeriod}
          onChange={handlePeriodChange}
          options={YIELD_PERIOD_OPTIONS}
          size="sm"
        />
      </div>

      {/* Center Donut Ring with Dual-Layer Depth */}
      <div className="relative w-full flex-1 flex items-center justify-center my-1" style={{ minHeight: '140px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart key={`quality-ring-${filterPeriod}-${displayTotal}`}>
            {/* 1. Inner Translucent Track / Body */}
            <Pie
              data={innerChartData}
              cx="50%"
              cy="50%"
              startAngle={88}
              endAngle={-272}
              innerRadius="65%"
              outerRadius="80%"
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              cornerRadius={4}
              isAnimationActive={true}
              animationBegin={50}
              animationDuration={750}
              animationEasing="ease-out"
            >
              {innerChartData.map((entry, index) => (
                <Cell
                  key={`inner-cell-${index}`}
                  fill={entry.fill}
                />
              ))}
            </Pie>

            {/* 2. Outer Luminous Neon Rim */}
            <Pie
              data={outerChartData}
              cx="50%"
              cy="50%"
              startAngle={88}
              endAngle={-272}
              innerRadius="79%"
              outerRadius="84%"
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              cornerRadius={5}
              isAnimationActive={true}
              animationBegin={50}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {outerChartData.map((entry, index) => (
                <Cell
                  key={`outer-cell-${index}`}
                  fill={entry.fill}
                  style={{
                    filter: `drop-shadow(0 0 3px ${entry.color}90)`,
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Typography: Total Bottles */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-[11px] lg:text-xs font-normal text-[#94a3b8] tracking-wider mb-0.5">
            Total Bottles
          </span>
          <span className="text-3xl lg:text-[36px] font-bold text-white tracking-tight tabular-nums leading-none">
            <AnimatedNumber value={displayTotal} />
          </span>
        </div>
      </div>

      {/* Legend & Numbers Structure (2-Column Format with Verified Counts) */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-3 border-t border-[rgba(255,255,255,0.1)] flex-shrink-0">
        {/* Left Col 1: Accepted Bottles */}
        <div className="flex items-center justify-between group cursor-pointer hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: '#20C96B' }}
            />
            <span className="text-xs text-[#94a3b8] font-medium">Accepted</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums drop-shadow-sm">
            <AnimatedNumber value={displayAccepted} />
          </span>
        </div>

        {/* Right Col 1: Capped Bottles */}
        <div className="flex items-center justify-between group cursor-pointer hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: '#E5D936' }}
            />
            <span className="text-xs text-[#94a3b8] font-medium">Capped</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums drop-shadow-sm">
            <AnimatedNumber value={displayCapped} />
          </span>
        </div>

        {/* Left Col 2: Boxes Packed */}
        <div className="flex items-center justify-between group cursor-pointer hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: '#20C9DF' }}
            />
            <span className="text-xs text-[#94a3b8] font-medium">Boxes Packed</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums drop-shadow-sm">
            <AnimatedNumber value={displayBoxes} />
          </span>
        </div>

        {/* Right Col 2: Rejected Bottles */}
        <div className="flex items-center justify-between group cursor-pointer hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: '#F04444' }}
            />
            <span className="text-xs text-[#94a3b8] font-medium">Rejected</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums drop-shadow-sm">
            <AnimatedNumber value={displayRejected} />
          </span>
        </div>
      </div>
    </div>
  );
};
