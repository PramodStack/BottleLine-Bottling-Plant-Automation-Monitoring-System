import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Layers, Activity, TrendingUp, CheckCircle2, BarChart2, Target } from 'lucide-react';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { BatchData } from '../../services/api';

interface BatchAnalyticsVisualProps {
  batches: BatchData[];
  kpis: {
    total_bottles?: number;
    accepted_bottles?: number;
    rejected_bottles?: number;
    total_box_packed?: number;
    acceptance_rate?: number;
  };
}

export const BatchAnalyticsVisual: React.FC<BatchAnalyticsVisualProps> = ({
  batches = [],
  kpis,
}) => {
  // Prepare chart data from real batches for Card 1
  const chartData = batches.slice(0, 8).map((b) => {
    const target = b.target_quantity || 0;
    const produced = b.produced_quantity || 0;
    const pct = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 100;
    return {
      batchNumber: b.batch_number || `B-${b.id}`,
      target,
      produced,
      status: b.batch_status || 'Scheduled',
      fulfillmentPct: pct,
      mode: b.production_mode || 'continuous',
    };
  });

  const activeCount = batches.filter((b) => (b.batch_status || '').toLowerCase() === 'in progress').length;
  const scheduledCount = batches.filter((b) => (b.batch_status || '').toLowerCase() === 'scheduled').length;

  // Active batch selection (defaults to current in-progress batch or first batch) for Card 2
  const activeBatch = batches.find((b) => (b.batch_status || '').toLowerCase() === 'in progress') || batches[0];
  const activeTarget = activeBatch?.target_quantity || 0;
  const activeProduced = activeBatch?.produced_quantity || 0;
  const activePct = activeTarget > 0 ? Math.min(100, Math.round((activeProduced / activeTarget) * 100)) : 100;
  const activeRemaining = Math.max(0, activeTarget - activeProduced);

  // Concentric Radial Donut Data:
  // Ring 1 (Outer): Target Quota Progress
  const quotaDonutData = [
    { name: 'Produced', value: Math.max(1, activeProduced), color: '#53D3E2' },
    { name: 'Remaining', value: Math.max(0, activeRemaining), color: 'rgba(255, 255, 255, 0.08)' },
  ];

  // Ring 2 (Inner): Quality Acceptance Breakdown
  const yieldDonutData = [
    { name: 'Accepted', value: Math.max(1, kpis.accepted_bottles || 0), color: '#6BDE8B' },
    { name: 'Defect', value: Math.max(0, kpis.rejected_bottles || 0), color: '#EF7774' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 select-none">
      {/* ── CARD 1 (LEFT): Comparative Output Quota (Target vs Produced BarChart) ── */}
      <div className="glass-panel rounded-[24px] relative overflow-hidden flex flex-col justify-between p-5 transition-all min-h-[310px]">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[rgba(83,211,226,0.18)] border border-[rgba(83,211,226,0.35)] flex items-center justify-center text-[#53D3E2] shadow-sm flex-shrink-0">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white tracking-wide truncate">
                  Batch Target vs Output Quota
                </h3>
                <p className="text-[11px] text-[#9EB3C9] font-medium truncate">
                  Comparative planned quota vs actual production volume
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#6BDE8B] px-2 py-0.5 rounded-full bg-[rgba(107,222,139,0.14)] border border-[rgba(107,222,139,0.3)]">
                {activeCount} Active
              </span>
              <span className="text-[10px] font-mono text-[#E7DF55] px-2 py-0.5 rounded-full bg-[rgba(231,223,85,0.14)] border border-[rgba(231,223,85,0.3)]">
                {scheduledCount} Scheduled
              </span>
            </div>
          </div>

          {/* Subheader Legend */}
          <div className="flex items-center justify-between text-xs mb-2 px-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[#cbd5e1] text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#53D3E2] inline-block shadow-[0_0_8px_#53D3E2]" />
                Produced Units
              </span>
              <span className="flex items-center gap-1.5 text-[#9EB3C9] text-[11px]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[rgba(255,255,255,0.22)] inline-block" />
                Target Quota
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#cbd5e1]">
              Top {chartData.length} Batch Runs
            </span>
          </div>

          {/* Chart */}
          <div className="h-44 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="batchNumber"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-[rgba(20,32,46,0.95)] backdrop-blur-md border border-[rgba(215,235,255,0.25)] shadow-xl text-xs space-y-1">
                          <p className="font-bold text-white">{d.batchNumber}</p>
                          <p className="text-[#53D3E2] font-semibold">Produced: {d.produced} units</p>
                          <p className="text-[#94a3b8] text-[10px]">
                            Target: {d.target > 0 ? `${d.target} units` : 'Continuous Run'} • {d.fulfillmentPct}% Fulfilled
                          </p>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[rgba(83,211,226,0.15)] text-[#53D3E2]">
                            {d.status}
                          </span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="target" fill="rgba(255,255,255,0.18)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={true} animationBegin={50} animationDuration={750} animationEasing="ease-out" />
                  <Bar dataKey="produced" fill="#53D3E2" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={true} animationBegin={50} animationDuration={800} animationEasing="ease-out">
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.status.toLowerCase() === 'completed'
                            ? '#6BDE8B'
                            : entry.status.toLowerCase() === 'in progress'
                            ? '#53D3E2'
                            : '#E7DF55'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#9EB3C9]">
                No batches currently configured.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Ribbon */}
        <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between text-[11px] text-[#9EB3C9]">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[#53D3E2] animate-pulse" />
            <span>Quota Engine Active</span>
          </div>
          <div className="flex items-center gap-1 text-[#EDF4FA] font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-[#6BDE8B]" />
            <span>Yield Rate: {kpis.acceptance_rate || 99.4}%</span>
          </div>
        </div>
      </div>

      {/* ── CARD 2 (RIGHT): Active Batch Concentric Quota Gauge & Execution Telemetry ── */}
      <div className="glass-panel rounded-[24px] relative overflow-hidden flex flex-col justify-between p-5 transition-all min-h-[310px]">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[rgba(107,222,139,0.18)] border border-[rgba(107,222,139,0.35)] flex items-center justify-center text-[#6BDE8B] shadow-sm flex-shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white tracking-wide truncate">
                  Active Batch Execution & Quota Gauge
                </h3>
                <p className="text-[11px] text-[#9EB3C9] font-medium truncate">
                  Real-time concentric fulfillment arc & execution pacing
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#53D3E2] px-2.5 py-0.5 rounded-full bg-[rgba(83,211,226,0.14)] border border-[rgba(83,211,226,0.3)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#53D3E2] animate-ping" />
                {activeBatch?.batch_number || 'BATCH-001'}
              </span>
            </div>
          </div>

          {/* Radial Donut + Telemetry Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-1">
            {/* Left: Concentric Dual Ring Gauge */}
            <div className="sm:col-span-5 h-44 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  {/* Outer Ring: Batch Target Quota */}
                  <Pie
                    data={quotaDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={65}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={true}
                    animationBegin={50}
                    animationDuration={750}
                    animationEasing="ease-out"
                  >
                    {quotaDonutData.map((entry, index) => (
                      <Cell key={`quota-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  {/* Inner Ring: Quality Yield Acceptance */}
                  <Pie
                    data={yieldDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={46}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={true}
                    animationBegin={50}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {yieldDonutData.map((entry, index) => (
                      <Cell key={`yield-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-xl font-black text-white drop-shadow-md leading-none">
                  <AnimatedNumber value={activePct} suffix="%" />
                </span>
                <span className="text-[8px] uppercase tracking-wider text-[#53D3E2] font-bold mt-0.5">
                  Fulfilled
                </span>
              </div>
            </div>

            {/* Right: Telemetry Specification Tiles */}
            <div className="sm:col-span-7 space-y-2">
              {/* Tile 1: Target Quota Progress */}
              <div className="p-2.5 rounded-2xl glass-card-sm flex items-center justify-between border border-[rgba(83,211,226,0.22)]">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#53D3E2] inline-block shadow-[0_0_6px_#53D3E2]" />
                    <span className="text-xs font-bold text-white">Target Quota</span>
                  </div>
                  <p className="text-[10px] text-[#9EB3C9] mt-0.5">
                    {activeRemaining > 0 ? `${activeRemaining} units remaining` : 'Target goal reached'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#53D3E2] font-mono">
                    <AnimatedNumber value={activeProduced} /> / {activeTarget > 0 ? <AnimatedNumber value={activeTarget} /> : '∞'}
                  </span>
                  <span className="text-[10px] text-[#cbd5e1] block">
                    <AnimatedNumber value={activePct} suffix="%" />
                  </span>
                </div>
              </div>

              {/* Tile 2: Yield Acceptance */}
              <div className="p-2.5 rounded-2xl glass-card-sm flex items-center justify-between border border-[rgba(107,222,139,0.22)]">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#6BDE8B] inline-block shadow-[0_0_6px_#6BDE8B]" />
                    <span className="text-xs font-bold text-white">Quality Accepted</span>
                  </div>
                  <p className="text-[10px] text-[#9EB3C9] mt-0.5">
                    {kpis.rejected_bottles || 0} defects isolated
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#6BDE8B] font-mono">
                    {kpis.accepted_bottles || 0}
                  </span>
                  <span className="text-[10px] text-[#6BDE8B] block font-semibold">
                    {kpis.acceptance_rate || 97.3}%
                  </span>
                </div>
              </div>

              {/* Tile 3: Schedule Execution Mode */}
              <div className="p-2 rounded-2xl glass-card-sm flex items-center justify-between border border-[rgba(255,255,255,0.12)]">
                <span className="text-[11px] text-[#cbd5e1] font-medium">Production Mode</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#E7DF55] px-2 py-0.5 rounded-full bg-[rgba(231,223,85,0.15)] border border-[rgba(231,223,85,0.25)]">
                  {activeBatch?.production_mode ? activeBatch.production_mode.replace('_', ' ') : 'Set Quantity'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Ribbon */}
        <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between text-[11px] text-[#9EB3C9]">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#6BDE8B]" />
            <span>Active Batch Synchronized</span>
          </div>
          <div className="flex items-center gap-1 text-[#EDF4FA] font-medium">
            <Activity className="w-3.5 h-3.5 text-[#53D3E2] animate-pulse" />
            <span>Telemetry Feed Live</span>
          </div>
        </div>
      </div>
    </div>
  );
};
