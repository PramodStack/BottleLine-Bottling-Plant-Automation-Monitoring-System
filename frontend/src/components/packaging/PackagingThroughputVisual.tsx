import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Package, Layers, Activity, TrendingUp, CheckCircle2, Box } from 'lucide-react';
import { AnimatedNumber } from '../common/AnimatedNumber';

interface PackagingThroughputVisualProps {
  totalBoxes: number;
  bottlesPacked: number;
  bottlesPerBox: number;
  efficiency: number;
  trends: Array<{
    boxNumber: number;
    completedBottle: number;
    timestamp: string;
    cumulativeBoxes: number;
  }>;
  totalBottles?: number;
}

export const PackagingThroughputVisual: React.FC<PackagingThroughputVisualProps> = ({
  totalBoxes,
  bottlesPacked,
  bottlesPerBox = 3,
  efficiency,
  trends = [],
  totalBottles = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'velocity' | 'buffer'>('velocity');

  // Compute current box filling slots (1 to 3)
  const currentBoxFill = totalBottles > 0 ? (totalBottles % bottlesPerBox) || bottlesPerBox : 0;

  // Downsample trends if large for high-performance rendering
  const step = Math.max(1, Math.floor(trends.length / 25));
  const chartPoints = trends.filter((_, idx) => idx % step === 0 || idx === trends.length - 1);

  return (
    <div className="glass-panel rounded-[24px] relative overflow-hidden flex flex-col p-5 transition-all select-none">
      {/* ── Header with Title & View Switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[rgba(231,223,85,0.18)] border border-[rgba(231,223,85,0.35)] flex items-center justify-center text-[#E7DF55] shadow-sm flex-shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Packaging Throughput & Milestone Flow
            </h3>
            <p className="text-[11px] text-[#9EB3C9] font-medium">
              3-Bottle conveyor aggregation • Optical gate sensor telemetry
            </p>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center p-0.5 rounded-full bg-[rgba(20,32,46,0.65)] border border-[rgba(215,235,255,0.18)] shadow-inner self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('velocity')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'velocity'
                ? 'bg-gradient-to-r from-[#E7DF55] to-[#f59e0b] text-[#0f172a] shadow-sm'
                : 'text-[#cbd5e1] hover:text-white'
            }`}
          >
            Cumulative Flow
          </button>
          <button
            onClick={() => setActiveTab('buffer')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'buffer'
                ? 'bg-gradient-to-r from-[#E7DF55] to-[#f59e0b] text-[#0f172a] shadow-sm'
                : 'text-[#cbd5e1] hover:text-white'
            }`}
          >
            Tray Buffer & Specs
          </button>
        </div>
      </div>

      {/* ── View 1: Cumulative Packaging Area Flow ── */}
      {activeTab === 'velocity' && (
        <div className="animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs mb-2 px-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[#cbd5e1]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E7DF55] inline-block shadow-[0_0_8px_#E7DF55]" />
                Completed Containers (Boxes)
              </span>
              <span className="hidden sm:inline-block text-[#9EB3C9] font-mono">
                <AnimatedNumber value={bottlesPacked} /> bottles aggregated
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[#E7DF55] px-2 py-0.5 rounded-full bg-[rgba(231,223,85,0.14)] border border-[rgba(231,223,85,0.3)]">
              {totalBoxes} Boxes Finalized
            </span>
          </div>

          <div className="h-44 w-full">
            {chartPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPoints} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="packagingFlowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E7DF55" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#53D3E2" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="completedBottle"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `B#${val}`}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 'dataMax + 5']}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(231, 223, 85, 0.4)', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-[rgba(20,32,46,0.95)] backdrop-blur-md border border-[rgba(215,235,255,0.25)] shadow-xl text-xs space-y-1">
                          <p className="font-bold text-white">Box #{d.boxNumber}</p>
                          <p className="text-[#E7DF55] font-semibold">Completed Bottle #{d.completedBottle}</p>
                          <p className="text-[#94a3b8] text-[10px]">
                            Cumulative: {d.cumulativeBoxes} boxes • {d.timestamp}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeBoxes"
                    stroke="#E7DF55"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#packagingFlowGrad)"
                    isAnimationActive={true}
                    animationBegin={50}
                    animationDuration={850}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#9EB3C9]">
                Awaiting packaging milestone triggers…
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View 2: Live Tray Buffer & Packaging Specs ── */}
      {activeTab === 'buffer' && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center animate-in fade-in duration-200">
          {/* Active Tray Visual */}
          <div className="sm:col-span-5 p-4 rounded-2xl bg-[rgba(20,32,46,0.6)] border border-[rgba(231,223,85,0.22)] flex flex-col items-center justify-center text-center">
            <span className="text-xs font-bold text-white uppercase tracking-wider mb-2">
              Current Box Filling Buffer
            </span>
            <div className="flex items-center gap-3 my-2">
              {[1, 2, 3].map((slot) => {
                const isFilled = slot <= currentBoxFill;
                return (
                  <div
                    key={slot}
                    className={`w-12 h-16 rounded-xl border flex flex-col items-center justify-center transition-all ${
                      isFilled
                        ? 'bg-[rgba(83,211,226,0.2)] border-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.3)]'
                        : 'bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.15)] opacity-50'
                    }`}
                  >
                    <Box className={`w-5 h-5 ${isFilled ? 'text-[#53D3E2]' : 'text-slate-400'}`} />
                    <span className="text-[9px] font-mono font-bold mt-1 text-white">
                      Slot {slot}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-[#E7DF55] font-semibold mt-1">
              {currentBoxFill} of {bottlesPerBox} bottles locked in tray
            </p>
          </div>

          {/* Metric Rows */}
          <div className="sm:col-span-7 space-y-2">
            <div className="p-2.5 rounded-2xl glass-card-sm flex items-center justify-between border border-[rgba(107,222,139,0.22)]">
              <div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#6BDE8B]" />
                  <span className="text-xs font-bold text-white">Packaging Line Efficiency</span>
                </div>
                <p className="text-[10px] text-[#9EB3C9] mt-0.5">Physical throughput vs rated conveyor velocity</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-[#6BDE8B]">{efficiency}%</span>
                <span className="text-[10px] text-[#9EB3C9] block">Rated Pace</span>
              </div>
            </div>

            <div className="p-2.5 rounded-2xl glass-card-sm flex items-center justify-between border border-[rgba(83,211,226,0.22)]">
              <div>
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#53D3E2]" />
                  <span className="text-xs font-bold text-white">Container Standard</span>
                </div>
                <p className="text-[10px] text-[#9EB3C9] mt-0.5">Heavy-duty 3-bottle corrugated dividers</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-[#53D3E2]">{bottlesPerBox} Units</span>
                <span className="text-[10px] text-[#9EB3C9] block">Per Carton</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Operational Ribbon ── */}
      <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between text-[11px] text-[#9EB3C9]">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#E7DF55] animate-pulse" />
          <span>Station 5 Optical Counter Active • 3rd Bottle Interval Trigger</span>
        </div>
        <div className="flex items-center gap-1 text-[#EDF4FA] font-medium">
          <TrendingUp className="w-3.5 h-3.5 text-[#6BDE8B]" />
          <span>Pacing: 100% On-Schedule</span>
        </div>
      </div>
    </div>
  );
};
