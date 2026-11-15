import React, { useEffect } from 'react';
import { usePlantData } from '../context/PlantDataContext';
import { useToolbar } from '../context/ToolbarContext';
import { GlassCard } from '../components/common/GlassCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { QualityRingChart } from '../components/dashboard/QualityRingChart';
import { ProductionChart } from '../components/dashboard/ProductionChart';
import { RecentActivityList } from '../components/dashboard/RecentActivityList';
import { IndustrialAssistant } from '../components/dashboard/IndustrialAssistant';
import { UpcomingBatchesTimeline } from '../components/dashboard/UpcomingBatchesTimeline';

export const OverviewPage: React.FC = () => {
  const { data, loading, error, refresh } = usePlantData();
  const { searchTerm, registerDownloadHandler, registerRefreshHandler } = useToolbar();

  // Register global refresh handler
  useEffect(() => {
    registerRefreshHandler(refresh);
    return () => registerRefreshHandler(null);
  }, [refresh, registerRefreshHandler]);

  // Register global CSV download handler for Overview
  useEffect(() => {
    const handleDownload = () => {
      const s: any = data?.summary || {};
      const logs = data?.recent_logs || [];
      const headers = 'Metric,Value\n';
      const kpis = `Total Bottles,${s.total_bottles || 0}\nAccepted Bottles,${s.accepted_bottles || 0}\nRejected Bottles,${s.rejected_bottles || 0}\nBoxes Packed,${s.total_box_packed || 0}\nPass Rate,${s.quality_pass_rate || 100}%\n\n`;
      const logHeaders = 'Recent Logs: Record ID,Bottle Number,Weight Status,Cap Status,Inspection Result,Timestamp\n';
      const logRows = logs
        .map((l: any) => `${l.id},${l.bottle_number},"${l.weight_status}","${l.cap_status}","${l.inspection_status}","${l.created_at || ''}"`)
        .join('\n');
      const blob = new Blob([headers + kpis + logHeaders + logRows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bottling_Plant_Overview_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [data, registerDownloadHandler]);

  if (loading && !data) {
    return (
      <LoadingState
        title="LOADING PLANT OVERVIEW"
        message="Preparing SCADA telemetry…"
        onRetry={refresh}
        size="lg"
      />
    );
  }



  const summary = data?.summary || {
    total_bottles: 172,
    accepted_bottles: 171,
    rejected_bottles: 1,
    total_box_packed: 55,
    quality_pass_rate: 99.4,
    rejection_rate: 0.6,
    packaging_rate: 95.9,
    bottles_per_box: 3,
  };

  const chartData = data?.chart_data || [];
  const historicalChartData = data?.historical_chart_data || [];
  const recentLogs = data?.recent_logs || [];
  const currentBatch = data?.batch;

  // Filter logs by search term
  const filteredLogs = searchTerm
    ? recentLogs.filter(
        (l) =>
          String(l.bottle_number).includes(searchTerm) ||
          l.inspection_status.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.weight_status.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : recentLogs;

  return (
    <div className="h-full w-full flex flex-col gap-3.5 select-none" style={{ minHeight: 0 }}>
      {/* ═══ TOP ROW: Production Yield Ring (left) + Production Analytics Wave Chart (right) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-[1.15]" style={{ minHeight: 0 }}>
        {/* Left: Doughnut / Pie Chart — 4 cols (Screenshot 3 Revenue From Bookings) */}
        <div className="lg:col-span-4 flex flex-col" style={{ minHeight: 0 }}>
          <GlassCard className="h-full flex flex-col justify-between">
            <QualityRingChart
              totalBottles={summary.total_bottles}
              acceptedBottles={summary.accepted_bottles}
              rejectedBottles={summary.rejected_bottles}
              totalBoxesPacked={summary.total_box_packed}
              cappedBottles={data?.log_stats?.capped_count || summary.accepted_bottles}
              byPeriod={data?.by_period}
            />
          </GlassCard>
        </div>

        {/* Right: Wave Line Chart with Numbers on Left — 8 cols (Screenshot 3 Booking Analytics) */}
        <div className="lg:col-span-8 flex flex-col" style={{ minHeight: 0 }}>
          <GlassCard className="h-full flex flex-col justify-between">
            <ProductionChart
              data={chartData}
              historicalData={historicalChartData}
              totalBottles={summary.total_bottles}
              passRate={summary.quality_pass_rate}
              rejectRate={summary.rejection_rate}
              packagingRate={summary.packaging_rate}
              avgRatePerHr={data?.avg_rate_per_hr}
              comparison={data?.comparison}
              byPeriod={data?.by_period}
            />
          </GlassCard>
        </div>
      </div>

      {/* ═══ BOTTOM ROW: 3 Equal Panels (Screenshot 3 Bottom 3 Cards) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 flex-[0.85]" style={{ minHeight: 0 }}>
        {/* Bottom Left: Recent Inspection Log (VIP Booking Requests) */}
        <div className="flex flex-col" style={{ minHeight: 0 }}>
          <GlassCard variant="deep" className="h-full">
            <RecentActivityList logs={filteredLogs} />
          </GlassCard>
        </div>

        {/* Bottom Center: Plant AI Insights (AI Booking Insights) */}
        <div className="flex flex-col" style={{ minHeight: 0 }}>
          <GlassCard variant="deep" className="h-full">
            <IndustrialAssistant summary={summary} />
          </GlassCard>
        </div>

        {/* Bottom Right: Upcoming Batches & Schedule (Upcoming Voyages) */}
        <div className="flex flex-col" style={{ minHeight: 0 }}>
          <GlassCard variant="deep" className="h-full">
            <UpcomingBatchesTimeline currentBatch={currentBatch} batches={data?.batches} />
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
