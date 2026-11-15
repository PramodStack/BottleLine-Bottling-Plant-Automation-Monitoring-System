import React, { useState, useEffect, useCallback } from 'react';
import { Package, CheckCircle2, Layers, Cpu } from 'lucide-react';
import { api } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingState } from '../components/common/LoadingState';
import { useToolbar } from '../context/ToolbarContext';
import { PackagingThroughputVisual } from '../components/packaging/PackagingThroughputVisual';

export const PackagingPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumResult, trendResult] = await Promise.allSettled([
        api.getPackagingSummary(),
        api.getPackagingTrends(),
      ]);
      if (sumResult.status === 'fulfilled' && sumResult.value.success) {
        setSummary(sumResult.value);
      }
      if (trendResult.status === 'fulfilled' && trendResult.value.success) {
        setTrends(trendResult.value.trends || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalBoxes = summary?.total_box_packed ?? 0;
  const bottlesPerBox = summary?.bottles_per_box ?? 3;
  const totalBottles = summary?.total_bottles ?? 0;
  const bottlesPacked = summary?.bottles_in_packed_boxes ?? totalBoxes * bottlesPerBox;
  const efficiency = summary?.packaging_efficiency ?? 0;

  // Filter trends by global search
  const filteredTrends = searchTerm
    ? trends.filter(
        (m) =>
          String(m.boxNumber).includes(searchTerm) ||
          String(m.completedBottle).includes(searchTerm) ||
          (m.timestamp || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : trends;

  // Register CSV download handler
  useEffect(() => {
    const handleDownload = () => {
      const headers = 'Packaging Metric,Value,Unit\n';
      const rows = [
        `Total Boxes Packed,${totalBoxes},Containers`,
        `Bottles in Packed Boxes,${bottlesPacked},Units (@ ${bottlesPerBox} bottles/box)`,
        `Packaging Efficiency,${efficiency}%,Percentage`,
        `Container Standard,3-Bottle Cardboard Tray,Standard Tray`,
      ];

      const boxHeader = '\n\nBox Number,Completed Bottle Interval,Cumulative Boxes,Packaging Timestamp\n';
      const boxRows = trends
        .map((m) => `Box #${m.boxNumber},Bottle #${m.completedBottle},${m.cumulativeBoxes},"${m.timestamp || ''}"`)
        .join('\n');

      const blob = new Blob([headers + rows.join('\n') + boxHeader + boxRows], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Packaging_Operations_Data_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [totalBoxes, bottlesPacked, bottlesPerBox, efficiency, trends, registerDownloadHandler]);

  // Register refresh handler
  useEffect(() => {
    registerRefreshHandler(loadData);
    return () => registerRefreshHandler(null);
  }, [loadData, registerRefreshHandler]);

  if (loading && !summary) {
    return (
      <LoadingState
        title="LOADING PACKAGING LINE"
        message="Preparing production data…"
        onRetry={loadData}
        size="lg"
      />
    );
  }

  return (
    <div className="space-y-4 select-none animate-in fade-in duration-300">
      {/* KPI Cards (Redundant secondary heading and telemetry notice removed per Section 5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Boxes Packed"
          value={totalBoxes}
          subValue="Containers"
          accentColor="yellow"
          trend={{ value: 'Live Telemetry', isPositive: true }}
          icon={<Package className="w-5 h-5 text-[#E7DF55]" />}
        />
        <MetricCard
          title="Bottles in Packed Boxes"
          value={bottlesPacked}
          subValue={`@ ${bottlesPerBox} bottles/box`}
          accentColor="cyan"
          icon={<Layers className="w-5 h-5 text-[#53D3E2]" />}
        />
        <MetricCard
          title="Packaging Efficiency"
          value={`${efficiency}%`}
          accentColor="green"
          trend={{ value: 'Synchronized', isPositive: true }}
          icon={<CheckCircle2 className="w-5 h-5 text-[#6BDE8B]" />}
        />
        <MetricCard
          title="Container Standard"
          value="3-Bottle"
          subValue="Cardboard Tray"
          accentColor="default"
          icon={<Cpu className="w-5 h-5 text-[#9EB3C9]" />}
        />
      </div>

      {/* Completed Box Packaging Milestones */}
      <GlassCard
        title="Completed Box Packaging Milestones"
        subtitle={`Synchronized with 3rd completed bottle intervals (${filteredTrends.length} of ${totalBoxes} boxes${searchTerm ? ` • matching "${searchTerm}"` : ''})`}
      >
        {filteredTrends.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1 max-h-[220px] overflow-y-auto hide-scrollbar scrollbar-none pr-1">
            {filteredTrends.map((m: any) => (
              <div key={m.boxNumber} className="p-3.5 rounded-2xl glass-card-sm flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-white">Box #{m.boxNumber}</span>
                  <p className="text-[11px] text-[#cbd5e1] mt-0.5">Bottle #{m.completedBottle} • {m.timestamp}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[rgba(231,223,85,0.14)] text-[#E7DF55] border border-[rgba(231,223,85,0.25)]">
                  Packed
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-[#9EB3C9]">
            {searchTerm ? 'No packaging milestones match your search.' : 'Awaiting completed box containers...'}
          </div>
        )}
      </GlassCard>

      {/* Visual Analytics Graphic: Cumulative Packaging Flow & Live Tray Buffer */}
      <PackagingThroughputVisual
        totalBoxes={totalBoxes}
        bottlesPacked={bottlesPacked}
        bottlesPerBox={bottlesPerBox}
        efficiency={efficiency}
        trends={trends}
        totalBottles={totalBottles}
      />
    </div>
  );
};
