import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle, Clock } from 'lucide-react';
import { api } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingState } from '../components/common/LoadingState';
import { useToolbar } from '../context/ToolbarContext';
import { CappingSealingVisual } from '../components/capping/CappingSealingVisual';

export const CappingPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getCappingSummary();
      if (res.success) setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = data?.metrics || {};
  const station = data?.station_info || {};
  const recents: any[] = data?.recent_cappings || [];

  // Filter recent entries by global search
  const filteredRecents = searchTerm
    ? recents.filter(
        (item) =>
          String(item.bottle_number).includes(searchTerm) ||
          (item.cap_status || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.created_at || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : recents;

  // Register CSV download handler
  useEffect(() => {
    const handleDownload = () => {
      const headers = 'Capping Metric,Value,Description\n';
      const rows = [
        `Total Bottles Capped,${metrics.capped_count || 0},Completed Pneumatic Capping Press Operations`,
        `Pending Cap Operations,${metrics.pending_count || 0},Bottles In-Transit to Station 4`,
        `Capping Sealing Efficiency,${metrics.capping_efficiency || 100}%,Sealing Torque Validation Ratio`,
      ];

      const entriesHeader = '\n\nBottle Number,Cap Status,Timestamp\n';
      const entryRows = recents
        .map((r) => `Bottle #${r.bottle_number},"${r.cap_status}","${r.created_at || ''}"`)
        .join('\n');

      const blob = new Blob([headers + rows.join('\n') + entriesHeader + entryRows], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Capping_Operations_Data_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [metrics, recents, registerDownloadHandler]);

  // Register refresh handler
  useEffect(() => {
    registerRefreshHandler(loadData);
    return () => registerRefreshHandler(null);
  }, [loadData, registerRefreshHandler]);

  if (loading && !data) {
    return (
      <LoadingState
        title="LOADING CAPPING OPERATIONS"
        message="Preparing capping telemetry…"
        onRetry={loadData}
        size="lg"
      />
    );
  }

  return (
    <div className="space-y-4 select-none animate-in fade-in duration-300">
      {/* KPI Cards (Redundant heading removed per Section 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Bottles Capped"
          value={metrics.capped_count || 0}
          accentColor="cyan"
          icon={<ShieldCheck className="w-5 h-5 text-[#53D3E2]" />}
          trend={{ value: `${metrics.capping_efficiency || 100}%`, isPositive: true }}
        />
        <MetricCard
          title="Pending Cap Operations"
          value={metrics.pending_count || 0}
          accentColor="yellow"
          icon={<Clock className="w-5 h-5 text-[#E7DF55]" />}
        />
        <MetricCard
          title="Capping Sealing Efficiency"
          value={`${metrics.capping_efficiency || 100}%`}
          accentColor="green"
          icon={<CheckCircle className="w-5 h-5 text-[#6BDE8B]" />}
        />
      </div>

      {/* Visual Analytics Graphic: Pneumatic Torque & Hermetic Seal Validation */}
      <CappingSealingVisual
        cappedCount={metrics.capped_count || 0}
        pendingCount={metrics.pending_count || 0}
        efficiency={metrics.capping_efficiency || 100}
        stationName={station.station_name}
      />

      {/* Station Information Card & Recent Capped Entries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard title="Pneumatic Capping Station Hardware" subtitle="PLC control tags & actuator parameters">
          <div className="space-y-3 pt-1">
            <div className="p-3.5 rounded-2xl glass-card-sm flex justify-between items-center">
              <span className="text-xs text-white font-bold tracking-wide">Station Description</span>
              <span className="text-xs font-semibold text-[#EDF4FA]">{station.station_name || 'Station 4 Capping Unit'}</span>
            </div>
            <div className="p-3.5 rounded-2xl glass-card-sm flex justify-between items-center">
              <span className="text-xs text-white font-bold tracking-wide">PLC Output Coil</span>
              <span className="text-xs font-mono text-[#53D3E2]">{station.activation_tag || 'CAPPING_CYCLE_ACTIVE'}</span>
            </div>
            <div className="p-3.5 rounded-2xl glass-card-sm flex justify-between items-center">
              <span className="text-xs text-white font-bold tracking-wide">Sequencer Step Tag</span>
              <span className="text-xs font-mono text-[#E7DF55]">{station.capping_step_tag || 'STEP_4_CAPPING'}</span>
            </div>
            <div className="p-3.5 rounded-2xl glass-card-sm flex justify-between items-center">
              <span className="text-xs text-white font-bold tracking-wide">Torque Validation</span>
              <span className="text-xs font-semibold text-[#6BDE8B]">Automated Seal Verified</span>
            </div>
          </div>
        </GlassCard>

        <GlassCard
          title="Recent Capped Bottle Entries"
          subtitle={`Telemetry verification stream (${filteredRecents.length} entries${searchTerm ? ` • matching "${searchTerm}"` : ''})`}
        >
          <div className="space-y-2 pt-1 max-h-[220px] overflow-y-auto hide-scrollbar scrollbar-none pr-1">
            {filteredRecents.length > 0 ? (
              filteredRecents.map((item: any) => (
                <div key={item.id} className="p-3 rounded-2xl glass-card-sm flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Bottle #{item.bottle_number}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[rgba(83,211,226,0.14)] text-[#53D3E2] font-medium">
                    {item.cap_status}
                  </span>
                  <span className="text-[11px] font-mono text-[#cbd5e1]">{item.created_at || 'Just now'}</span>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-[#9EB3C9]">
                {searchTerm ? 'No capped bottles match your search.' : 'Awaiting capped bottle records...'}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
