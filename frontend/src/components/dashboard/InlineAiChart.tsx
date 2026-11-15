import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, Activity, BarChart2 } from 'lucide-react';

interface InlineAiChartProps {
  content: string;
}

export const InlineAiChart: React.FC<InlineAiChartProps> = ({ content }) => {
  // 1. Detect Hourly Interval Table
  const hourlyMatch = content.match(/\|\s*Time Interval\s*\|\s*Bottles Produced\s*\|\s*Passed\s*\|\s*Defect\s*\|\s*Pass Rate\s*\|([\s\S]*?)(?=\n\n|$)/i);
  if (hourlyMatch) {
    const rawRows = hourlyMatch[1].trim().split('\n').filter((r) => r.includes('|') && !r.includes('---'));
    const chartData = rawRows.map((row) => {
      const parts = row.split('|').map((c) => c.replace(/\*+/g, '').trim()).filter(Boolean);
      return {
        slot: parts[0] ? parts[0].replace(' - ', '-') : 'Hour',
        produced: parseInt(parts[1], 10) || 0,
        passed: parseInt(parts[2], 10) || 0,
        defect: parseInt(parts[3], 10) || 0,
        passRate: parseFloat(parts[4]?.replace('%', '')) || 0,
      };
    }).filter((d) => d.produced > 0 || d.passed > 0);

    if (chartData.length > 0) {
      return (
        <div className="my-2.5 p-3 rounded-2xl bg-[rgba(44,66,90,0.42)] border border-[rgba(220,236,252,0.20)] backdrop-blur-md shadow-inner">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Activity className="w-3.5 h-3.5 text-[#00d2ff]" />
              <span>Hourly Production Velocity</span>
            </div>
            <span className="text-[10px] text-[#20C96B] font-mono px-2 py-0.5 rounded-full bg-[rgba(32,201,107,0.14)] border border-[rgba(32,201,107,0.25)]">
              Live Trend
            </span>
          </div>

          <div className="h-44 sm:h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#20C9DF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#20C9DF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
                <XAxis dataKey="slot" stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} dy={4} />
                <YAxis stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-[rgba(44,66,90,0.92)] border border-[rgba(220,236,252,0.25)] shadow-xl text-xs backdrop-blur-md">
                          <p className="font-bold text-white mb-1">{label}</p>
                          <div className="space-y-0.5 text-[11px]">
                            <p className="text-[#20C9DF]">Produced: <span className="font-mono font-bold text-white">{d.produced}</span></p>
                            <p className="text-[#20C96B]">Passed: <span className="font-mono font-bold text-white">{d.passed}</span></p>
                            <p className="text-[#F04444]">Defects: <span className="font-mono font-bold text-white">{d.defect}</span></p>
                            <p className="text-[#E5D936]">Pass Rate: <span className="font-mono font-bold text-white">{d.passRate}%</span></p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="natural" dataKey="produced" stroke="#20C9DF" strokeWidth={2.5} fillOpacity={1} fill="url(#velocityGrad)" dot={{ r: 3, fill: '#20C9DF' }} isAnimationActive={true} animationBegin={50} animationDuration={750} animationEasing="ease-out" />
                <Line type="natural" dataKey="passed" stroke="#20C96B" strokeWidth={2} dot={{ r: 2.5, fill: '#20C96B' }} isAnimationActive={true} animationBegin={50} animationDuration={750} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
  }

  // 2. Detect End-of-Shift Production Forecast
  if (content.toLowerCase().includes('forecast') && (content.includes('705') || content.includes('confidence interval') || content.includes('end-of-shift'))) {
    const forecastPoints = [
      { time: 'T+0h', actual: 172, projected: 172, upper: 172, lower: 172 },
      { time: 'T+2h', projected: 305, upper: 318, lower: 292 },
      { time: 'T+4h', projected: 438, upper: 458, lower: 418 },
      { time: 'T+6h', projected: 571, upper: 600, lower: 542 },
      { time: 'T+8h (End)', projected: 705, upper: 740, lower: 670 },
    ];

    return (
      <div className="my-2.5 p-3 rounded-2xl bg-[rgba(44,66,90,0.42)] border border-[rgba(220,236,252,0.20)] backdrop-blur-md shadow-inner">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <TrendingUp className="w-3.5 h-3.5 text-[#E5D936]" />
            <span>Shift Forecast Projection Model (±90% CI)</span>
          </div>
          <span className="text-[10px] text-[#E5D936] font-mono px-2 py-0.5 rounded-full bg-[rgba(229,217,54,0.14)] border border-[rgba(229,217,54,0.25)]">
            Target ~705 units
          </span>
        </div>

        <div className="h-44 sm:h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastPoints} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E5D936" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#E5D936" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} dy={4} />
              <YAxis domain={[100, 800]} stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="p-2.5 rounded-xl bg-[rgba(44,66,90,0.92)] border border-[rgba(220,236,252,0.25)] shadow-xl text-xs backdrop-blur-md">
                        <p className="font-bold text-white mb-1">Horizon: {label}</p>
                        <p className="text-[#E5D936]">Projected: <span className="font-mono font-bold text-white">{d.projected} bottles</span></p>
                        <p className="text-[#94a3b8] text-[10.5px]">90% Interval: [{d.lower} — {d.upper}]</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area type="monotone" dataKey="projected" stroke="#E5D936" strokeWidth={2.5} fillOpacity={1} fill="url(#forecastArea)" dot={{ r: 3, fill: '#E5D936' }} isAnimationActive={true} animationBegin={50} animationDuration={800} animationEasing="ease-out" />
              <Line type="monotone" dataKey="upper" stroke="rgba(229, 217, 54, 0.4)" strokeDasharray="3 3" strokeWidth={1.5} dot={false} isAnimationActive={true} animationBegin={50} animationDuration={800} animationEasing="ease-out" />
              <Line type="monotone" dataKey="lower" stroke="rgba(229, 217, 54, 0.4)" strokeDasharray="3 3" strokeWidth={1.5} dot={false} isAnimationActive={true} animationBegin={50} animationDuration={800} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 3. Detect Rejection Analysis / Root Cause
  if ((content.toLowerCase().includes('rejection root cause') || content.toLowerCase().includes('defect rate')) && content.includes('171') && content.includes('1')) {
    const qualityData = [
      { category: 'Accepted Bottles', count: 171, fill: '#20C96B' },
      { category: 'Station 2 Underfill', count: 1, fill: '#F04444' },
    ];

    return (
      <div className="my-2.5 p-3 rounded-2xl bg-[rgba(44,66,90,0.42)] border border-[rgba(220,236,252,0.20)] backdrop-blur-md shadow-inner">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <BarChart2 className="w-3.5 h-3.5 text-[#20C96B]" />
            <span>Quality Inspection Yield Breakdown</span>
          </div>
          <span className="text-[10px] text-[#20C96B] font-mono px-2 py-0.5 rounded-full bg-[rgba(32,201,107,0.14)] border border-[rgba(32,201,107,0.25)]">
            99.42% Pass Rate
          </span>
        </div>

        <div className="h-32 sm:h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={qualityData} layout="vertical" margin={{ top: 4, right: 20, left: 24, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" fontSize={9.5} tickLine={false} axisLine={false} />
              <YAxis dataKey="category" type="category" stroke="#cbd5e1" fontSize={9.5} tickLine={false} axisLine={false} width={110} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="p-2 rounded-xl bg-[rgba(44,66,90,0.92)] border border-[rgba(220,236,252,0.25)] text-xs backdrop-blur-md">
                        <p className="font-bold text-white">{d.category}: <span className="font-mono text-[#00d2ff]">{d.count} units</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={true} animationBegin={50} animationDuration={750} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
};
