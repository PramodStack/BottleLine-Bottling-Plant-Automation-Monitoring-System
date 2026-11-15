import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: number | string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  accentColor?: 'cyan' | 'green' | 'coral' | 'yellow' | 'default';
  icon?: React.ReactNode;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subValue,
  trend,
  accentColor = 'default',
  icon,
  className = '',
}) => {
  const colorMap = {
    cyan: 'text-[#00d2ff]',
    green: 'text-[#22c55e]',
    coral: 'text-[#ef4444]',
    yellow: 'text-[#f59e0b]',
    default: 'text-white',
  };

  const trendColorMap = {
    cyan: 'text-[#00d2ff] bg-[rgba(0,210,255,0.12)] border-[rgba(0,210,255,0.25)]',
    green: 'text-[#22c55e] bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.25)]',
    coral: 'text-[#ef4444] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.25)]',
    yellow: 'text-[#f59e0b] bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.25)]',
    default: 'text-[#94a3b8] bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)]',
  };

  return (
    <div className={`p-4 rounded-[22px] glass-panel-sm flex flex-col justify-between hover-lift cursor-glow ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-bold text-white tracking-wider uppercase drop-shadow-sm">{title}</span>
        {icon && <div className="text-white opacity-85">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl font-extrabold tracking-tight tabular-nums drop-shadow-sm ${colorMap[accentColor]}`}>
            <AnimatedNumber value={value} />
          </span>
          {subValue && <span className="text-[11px] text-[#cbd5e1] font-medium">{subValue}</span>}
        </div>

        {trend && (
          <div
            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-md ${
              trend.isNeutral
                ? trendColorMap.default
                : trend.isPositive
                ? trendColorMap.green
                : trendColorMap.coral
            }`}
          >
            {trend.isNeutral ? (
              <Minus className="w-2.5 h-2.5" />
            ) : trend.isPositive ? (
              <ArrowUpRight className="w-2.5 h-2.5" />
            ) : (
              <ArrowDownRight className="w-2.5 h-2.5" />
            )}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
};
