import React from 'react';
import { ShieldCheck, Gauge, Activity, CheckCircle2, Cpu } from 'lucide-react';
import { AnimatedNumber } from '../common/AnimatedNumber';

interface CappingSealingVisualProps {
  cappedCount: number;
  pendingCount: number;
  efficiency: number;
  stationName?: string;
}

export const CappingSealingVisual: React.FC<CappingSealingVisualProps> = ({
  cappedCount = 0,
  pendingCount = 0,
  efficiency = 100,
  stationName = 'Station 4 Capping Unit',
}) => {
  const total = cappedCount + pendingCount;
  const cappedPct = total > 0 ? Math.round((cappedCount / total) * 100) : 100;

  return (
    <div className="glass-panel rounded-[24px] relative overflow-hidden flex flex-col p-5 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[rgba(107,222,139,0.18)] border border-[rgba(107,222,139,0.35)] flex items-center justify-center text-[#6BDE8B] shadow-sm flex-shrink-0">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Pneumatic Torque & Hermetic Seal Analytics
            </h3>
            <p className="text-[11px] text-[#9EB3C9] font-medium">
              Station 4 high-precision servo capping head • Automated seal verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold text-[#6BDE8B] px-2.5 py-0.5 rounded-full bg-[rgba(107,222,139,0.14)] border border-[rgba(107,222,139,0.3)]">
            <AnimatedNumber value={efficiency} suffix="%" /> Seal Quality
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Torque Dial Card */}
        <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(83,211,226,0.22)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Application Torque</span>
            <span className="text-[10px] text-[#53D3E2] font-mono">2.40 N·m Spec</span>
          </div>
          <div className="my-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#53D3E2] drop-shadow-sm">
              <AnimatedNumber value={2.42} decimals={2} />
            </span>
            <span className="text-xs text-[#9EB3C9]">N·m Applied</span>
          </div>
          <div className="w-full bg-[rgba(255,255,255,0.08)] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#53D3E2] h-full rounded-full shadow-[0_0_8px_#53D3E2]" style={{ width: '96%' }} />
          </div>
          <span className="text-[10px] text-[#6BDE8B] mt-1.5 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Nominal Operating Band
          </span>
        </div>

        {/* Pneumatic Pressure Card */}
        <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(231,223,85,0.22)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Line Pressure</span>
            <span className="text-[10px] text-[#E7DF55] font-mono">6.0 Bar Spec</span>
          </div>
          <div className="my-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#E7DF55] drop-shadow-sm">
              <AnimatedNumber value={6.18} decimals={2} />
            </span>
            <span className="text-xs text-[#9EB3C9]">Bar Active</span>
          </div>
          <div className="w-full bg-[rgba(255,255,255,0.08)] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#E7DF55] h-full rounded-full shadow-[0_0_8px_#E7DF55]" style={{ width: '92%' }} />
          </div>
          <span className="text-[10px] text-[#6BDE8B] mt-1.5 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Regulated Air Supply
          </span>
        </div>

        {/* Capping Ratio Progress */}
        <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(107,222,139,0.22)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">Capping Throughput</span>
            <span className="text-[10px] text-[#6BDE8B] font-mono">{cappedPct}% Ratio</span>
          </div>
          <div className="my-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#6BDE8B] drop-shadow-sm">
              <AnimatedNumber value={cappedCount} />
            </span>
            <span className="text-xs text-[#9EB3C9]">Bottles Sealed</span>
          </div>
          <div className="w-full bg-[rgba(255,255,255,0.08)] h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#6BDE8B] h-full rounded-full shadow-[0_0_8px_#6BDE8B]" style={{ width: `${cappedPct}%` }} />
          </div>
          <span className="text-[10px] text-[#cbd5e1] mt-1.5 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3 text-[#53D3E2]" /> 100% Hermetic Seal Validated
          </span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between text-[11px] text-[#9EB3C9]">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#6BDE8B] animate-pulse" />
          <span>{stationName} • Capping Sequencer Step 4 Synchronized</span>
        </div>
        <div className="flex items-center gap-1 text-[#EDF4FA] font-medium">
          <Cpu className="w-3.5 h-3.5 text-[#53D3E2]" />
          <span>PLC Response: 4ms Latency</span>
        </div>
      </div>
    </div>
  );
};
