import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { CustomGlassDropdown } from '../common/CustomGlassDropdown';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { ChartPoint } from '../../services/api';

interface ProductionChartProps {
  data?: ChartPoint[];
  historicalData?: ChartPoint[];
  totalBottles?: number;
  passRate?: number | null;
  rejectRate?: number | null;
  packagingRate?: number | null;
  avgRatePerHr?: number | null;
  comparison?: any;
  byPeriod?: Record<string, any>;
}

// Interactive Tooltip Component that displays genuine production counts
const CustomChartTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0]?.payload as any;
  if (!dataPoint) return null;

  return (
    <div className="flex flex-col p-3 rounded-2xl bg-[rgba(34,50,70,0.94)] backdrop-blur-xl border border-[rgba(210,226,240,0.26)] shadow-[0_12px_28px_rgba(15,30,45,0.40)] min-w-[200px] text-xs z-50 select-none pointer-events-auto">
      {/* Header: Timestamp */}
      <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[rgba(255,255,255,0.12)]">
        <span className="font-semibold text-white tracking-wide text-[12px]">
          {dataPoint.fullLabel || dataPoint.label || label}
        </span>
      </div>

      {/* 4 Interactive Series Metrics with genuine bottling plant quantities */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#20C9DF] shadow-[0_0_6px_#20C9DF]" />
            <span className="text-[#cbd5e1] text-[11px] whitespace-nowrap">Bottles Produced</span>
          </div>
          <span className="font-bold text-white text-[11px] tabular-nums">
            {dataPoint.produced ?? dataPoint.cyan ?? dataPoint.bottlesProduced}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#20C96B] shadow-[0_0_6px_#20C96B]" />
            <span className="text-[#cbd5e1] text-[11px] whitespace-nowrap">Accepted</span>
          </div>
          <span className="font-bold text-white text-[11px] tabular-nums">
            {dataPoint.accepted ?? dataPoint.green} {dataPoint.passRate ? `(${dataPoint.passRate})` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F04444] shadow-[0_0_6px_#F04444]" />
            <span className="text-[#cbd5e1] text-[11px] whitespace-nowrap">Rejected</span>
          </div>
          <span className="font-bold text-white text-[11px] tabular-nums">
            {dataPoint.rejected ?? dataPoint.red} {dataPoint.rejectionRate ? `(${dataPoint.rejectionRate})` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E5D936] shadow-[0_0_6px_#E5D936]" />
            <span className="text-[#cbd5e1] text-[11px] whitespace-nowrap">Packaged</span>
          </div>
          <span className="font-bold text-white text-[11px] tabular-nums">
            {dataPoint.packaged ?? dataPoint.yellow} {dataPoint.boxesPackedStr ? `(${dataPoint.boxesPackedStr})` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

const ANALYTICS_DROPDOWN_STORAGE_KEY = 'bottling_overview_analytics_timerange';
const ANALYTICS_PERIOD_OPTIONS = ['Today', 'Last 30 Days', 'This Month', 'This Year'];

export const ProductionChart: React.FC<ProductionChartProps> = ({
  data = [],
  historicalData = [],
  totalBottles = 0,
  passRate,
  rejectRate,
  packagingRate,
  avgRatePerHr,
  comparison,
  byPeriod,
}) => {
  const [timeRange, setTimeRangeState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ANALYTICS_DROPDOWN_STORAGE_KEY);
      if (saved && ANALYTICS_PERIOD_OPTIONS.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.error('Failed reading analytics time range from storage', e);
    }
    return 'This Year';
  });

  const handleTimeRangeChange = (val: string) => {
    setTimeRangeState(val);
    try {
      localStorage.setItem(ANALYTICS_DROPDOWN_STORAGE_KEY, val);
    } catch (e) {
      console.error('Failed saving analytics time range to storage', e);
    }
  };

  // Derive genuine database metrics directly from selected period
  const periodData = byPeriod?.[timeRange];
  const activeSummary = periodData?.summary;
  const displayTotal = activeSummary !== undefined ? activeSummary.total_bottles : totalBottles;
  const displayPassRate = activeSummary !== undefined ? activeSummary.quality_pass_rate : passRate;
  const displayRejectRate = activeSummary !== undefined ? activeSummary.rejection_rate : rejectRate;
  const displayPackagingRate = activeSummary !== undefined ? activeSummary.packaging_rate : packagingRate;
  const displayAvgRate = periodData !== undefined ? periodData.avg_rate_per_hr : avgRatePerHr;
  const activeComparison = periodData !== undefined ? periodData.comparison : comparison;
  const activeChartData = periodData !== undefined ? (periodData.chart_data || []) : (data || []);

  // Glowing active dot renderer for all 4 lines when hovering
  const renderActiveDot = (color: string) => (props: any) => {
    const { cx, cy } = props;
    if (cx === undefined || cy === undefined) return null;
    return (
      <g key={`active-dot-${color}-${cx}-${cy}`}>
        <circle cx={cx} cy={cy} r={8.5} fill={color} fillOpacity={0.28} />
        <circle cx={cx} cy={cy} r={5} fill={color} stroke="#ffffff" strokeWidth={1.5} />
      </g>
    );
  };

  return (
    <div className="w-full h-full relative p-4 lg:p-5 select-none" style={{ minHeight: 0 }}>
      {/* Top-Right Glass Dropdown matching design */}
      <div className="absolute top-4 right-4 lg:top-5 lg:right-5 z-20">
        <CustomGlassDropdown
          value={timeRange}
          onChange={handleTimeRangeChange}
          options={ANALYTICS_PERIOD_OPTIONS}
          size="sm"
        />
      </div>

      {/* Main Two-Column Layout: Left KPI Column (~38%) + Right Line Chart (~62%) */}
      <div
        className="w-full h-full grid grid-cols-1 md:grid-cols-[clamp(330px,38%,410px)_minmax(0,1fr)] gap-6 lg:gap-8 items-stretch"
        style={{ minHeight: 0, minWidth: 0 }}
      >
        {/* ── LEFT COLUMN: Heading & Total Produced at Top, Secondary Rows Below ── */}
        <div className="w-full h-full min-w-0 flex flex-col justify-between py-1">
          {/* Top Group: Heading & Total Produced KPI */}
          <div>
            <h3 className="text-sm lg:text-base font-bold text-white tracking-wide drop-shadow-sm">
              Production Analytics
            </h3>
            <p className="text-[11px] lg:text-xs text-[#94a3b8] font-normal mt-0.5">
              {timeRange === 'Today'
                ? "Today's Production"
                : timeRange === 'Last 30 Days'
                ? 'Last 30 Days Production'
                : timeRange === 'This Month'
                ? 'This Month Production'
                : 'This Year Production'}
            </p>

            {/* Total Bottles Produced */}
            <div className="mt-3 lg:mt-3.5">
              <span className="text-xs lg:text-[13px] text-[#94a3b8] font-normal block mb-0.5">
                Total Produced
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-5xl lg:text-[52px] xl:text-[56px] font-normal lg:font-medium text-white tracking-tight drop-shadow-sm tabular-nums leading-none">
                  <AnimatedNumber value={displayTotal} />
                </span>
                {activeComparison?.has_comparison && activeComparison?.total_change != null && (
                  <span
                    className={`text-sm lg:text-base font-medium flex items-center gap-0.5 ${
                      activeComparison.total_change >= 0 ? 'text-[#20C96B]' : 'text-[#F04444]'
                    }`}
                  >
                    {activeComparison.total_change >= 0
                      ? `↑ ${activeComparison.total_change}%`
                      : `↓ ${Math.abs(activeComparison.total_change)}%`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tier 3: Secondary Metrics Row 1 */}
          <div className="grid grid-cols-2 gap-x-8 lg:gap-x-12 w-full">
            {/* Top Left: Avg Rate \ Hr */}
            <div className="min-w-0">
              <span className="text-xs lg:text-[13px] text-[#94a3b8] font-normal block whitespace-nowrap mb-1">
                Avg Rate \ Hr
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-3xl xl:text-[34px] font-medium lg:font-semibold text-[#20C9DF] tabular-nums leading-none">
                  <AnimatedNumber value={displayAvgRate} />
                </span>
              </div>
            </div>

            {/* Top Right: Pass Rate */}
            <div className="min-w-0">
              <span className="text-xs lg:text-[13px] text-[#94a3b8] font-normal block whitespace-nowrap mb-1">
                Pass Rate
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-3xl xl:text-[34px] font-medium lg:font-semibold text-[#20C96B] tabular-nums leading-none">
                  <AnimatedNumber value={displayPassRate} suffix="%" decimals={1} />
                </span>
              </div>
            </div>
          </div>

          {/* Tier 4: Secondary Metrics Row 2 */}
          <div className="grid grid-cols-2 gap-x-8 lg:gap-x-12 w-full">
            {/* Bottom Left: Rejection Rate */}
            <div className="min-w-0">
              <span className="text-xs lg:text-[13px] text-[#94a3b8] font-normal block whitespace-nowrap mb-1">
                Rejection Rate
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-3xl xl:text-[34px] font-medium lg:font-semibold text-[#F04444] tabular-nums leading-none">
                  <AnimatedNumber value={displayRejectRate} suffix="%" decimals={1} />
                </span>
              </div>
            </div>

            {/* Bottom Right: Packaging Rate */}
            <div className="min-w-0">
              <span className="text-xs lg:text-[13px] text-[#94a3b8] font-normal block whitespace-nowrap mb-1">
                Packaging Rate
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl lg:text-3xl xl:text-[34px] font-medium lg:font-semibold text-[#E5D936] tabular-nums leading-none">
                  <AnimatedNumber value={displayPackagingRate} suffix="%" decimals={1} />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT AREA: Interactive Genuine Multi-Line Production Chart ── */}
        <div
          className="min-w-0 w-full h-full relative cursor-crosshair flex items-center justify-center"
          style={{ minHeight: '170px' }}
        >
          {activeChartData && activeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                key={`prod-line-${timeRange}-${displayTotal}`}
                data={activeChartData}
                margin={{ top: 20, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="rgba(255, 255, 255, 0.08)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={6}
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(30, Math.ceil(dataMax * 1.15))]}
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                  dx={-2}
                />

                {/* Native interactive Recharts Tooltip with dashed vertical guide cursor */}
                <Tooltip
                  content={<CustomChartTooltip />}
                  cursor={{
                    stroke: '#20C96B',
                    strokeWidth: 1.5,
                    strokeDasharray: '3 3',
                  }}
                  isAnimationActive={false}
                  wrapperStyle={{ outline: 'none', pointerEvents: 'auto', zIndex: 50 }}
                />

                {/* 4 Spline Wave Lines with verified real quantities */}
                <Line
                  type="natural"
                  dataKey="cyan"
                  name="Produced"
                  stroke="#20C9DF"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={renderActiveDot('#20C9DF')}
                  isAnimationActive={true}
                  animationBegin={50}
                  animationDuration={850}
                  animationEasing="ease-out"
                />
                <Line
                  type="natural"
                  dataKey="green"
                  name="Accepted"
                  stroke="#20C96B"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={renderActiveDot('#20C96B')}
                  isAnimationActive={true}
                  animationBegin={50}
                  animationDuration={850}
                  animationEasing="ease-out"
                />
                <Line
                  type="natural"
                  dataKey="yellow"
                  name="Packaged"
                  stroke="#E5D936"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={renderActiveDot('#E5D936')}
                  isAnimationActive={true}
                  animationBegin={50}
                  animationDuration={850}
                  animationEasing="ease-out"
                />
                <Line
                  type="natural"
                  dataKey="red"
                  name="Rejected"
                  stroke="#F04444"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={renderActiveDot('#F04444')}
                  isAnimationActive={true}
                  animationBegin={50}
                  animationDuration={850}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 border border-white/5 rounded-2xl bg-white/[0.02]">
              <span className="text-sm font-medium text-white/70 tracking-wide mb-1">
                No Production Telemetry
              </span>
              <span className="text-xs text-[#94a3b8]">
                No bottle production logs recorded for {timeRange.toLowerCase()}.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
