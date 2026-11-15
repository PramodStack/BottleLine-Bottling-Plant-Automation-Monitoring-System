import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, Scale } from 'lucide-react';
import { api } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingState } from '../components/common/LoadingState';
import { useToolbar } from '../context/ToolbarContext';
import { InspectionQualityVisual } from '../components/inspection/InspectionQualityVisual';

export const InspectionPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('Initializing inspection module');
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const loadData = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoading(true);
    setLoadError(null);
    setStage('Initializing inspection module');

    // 10-second timeout safety to prevent infinite loader
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setLoadError('Inspection service timed out. Backend took longer than 10s to respond.');
      }
    }, 10000);

    try {
      if (!isMountedRef.current) return;
      setStage('Connecting to backend services');

      // Dispatch real API request
      const requestPromise = api.getInspectionSummary();

      if (isMountedRef.current) {
        setStage('Fetching inspection records & defect telemetry');
      }

      const res = await requestPromise;

      if (!isMountedRef.current) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (res && res.success) {
        setStage('Preparing dashboard view');
        setData(res);
        setTimeout(() => {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }, 120);
      } else {
        setLoadError(res?.message || 'Inspection service returned an invalid response.');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.error('Inspection fetch error:', err);
      setLoadError(err.message || 'Failed to connect to inspection services.');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = data?.metrics || {};
  const defects = data?.defects || {};
  const rawRejections: any[] = defects?.recent_rejected_records || [];

  // Filter rejections by global search
  const filteredRejections = searchTerm
    ? rawRejections.filter(
        (rec) =>
          String(rec.bottle_number).includes(searchTerm) ||
          (rec.weight_status || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (rec.created_at || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : rawRejections;

  // Register CSV download handler with global toolbar
  useEffect(() => {
    const handleDownload = () => {
      const headers = 'Inspection Category,Value,Detail\n';
      const rows = [
        `Total Inspected,${metrics.total_inspected || 0},Total Units Passed Through Station 2`,
        `Passed Bottles,${metrics.passed_bottles || 0},${metrics.pass_rate || 100}% Acceptance`,
        `Rejected Bottles,${metrics.rejected_bottles || 0},${metrics.reject_rate || 0}% Defect Rate`,
        `Verified Target Weight (OK),${defects.weight_ok || 0},Load Cell Verified`,
        `Under-Weight (Low Weight),${defects.weight_low || 0},Diverted to Reject Chute`,
      ];

      const defectHeader = '\n\nDefect Record ID,Bottle Number,Defect Reason,Timestamp\n';
      const defectRows = rawRejections
        .map((r) => `${r.id},${r.bottle_number},"${r.weight_status}","${r.created_at || ''}"`)
        .join('\n');

      const blob = new Blob([headers + rows.join('\n') + defectHeader + defectRows], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Quality_Inspection_Data_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [metrics, defects, rawRejections, registerDownloadHandler]);

  // Register refresh handler with global toolbar
  useEffect(() => {
    registerRefreshHandler(loadData);
    return () => registerRefreshHandler(null);
  }, [loadData, registerRefreshHandler]);

  if (loading && !data) {
    return (
      <LoadingState
        title="LOADING QUALITY INSPECTION"
        message="Preparing inspection data…"
        stage={stage}
        error={loadError}
        onRetry={loadData}
        size="lg"
      />
    );
  }

  return (
    <div className="space-y-4 select-none animate-in fade-in duration-300">
      {/* KPI Cards (Redundant secondary heading removed per Section 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Inspected"
          value={metrics.total_inspected || 0}
          accentColor="cyan"
          icon={<ShieldCheck className="w-5 h-5 text-[#53D3E2]" />}
        />
        <MetricCard
          title="Passed Bottles"
          value={metrics.passed_bottles || 0}
          accentColor="green"
          trend={{ value: `${metrics.pass_rate || 100}%`, isPositive: true }}
          icon={<CheckCircle2 className="w-5 h-5 text-[#6BDE8B]" />}
        />
        <MetricCard
          title="Rejected Bottles"
          value={metrics.rejected_bottles || 0}
          accentColor="coral"
          trend={{ value: `${metrics.reject_rate || 0}%`, isNeutral: true }}
          icon={<AlertTriangle className="w-5 h-5 text-[#EF7774]" />}
        />
        <MetricCard
          title="Quality Standard"
          value="ISO 9001"
          subValue="Certified"
          accentColor="yellow"
          icon={<Scale className="w-5 h-5 text-[#E7DF55]" />}
        />
      </div>

      {/* Breakdown Cards: High-End Visual Analytics + Defect Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <InspectionQualityVisual metrics={metrics} defects={defects} />
        </div>

        <div className="lg:col-span-5">
          <GlassCard
            title="Recent Defect Log"
            subtitle={`Flagged inspection events for quality auditing (${filteredRejections.length} entries${searchTerm ? ` • matching "${searchTerm}"` : ''})`}
            className="h-full flex flex-col justify-between"
          >
          {filteredRejections.length > 0 ? (
            <div className="space-y-2 pt-1 max-h-[220px] overflow-y-auto hide-scrollbar scrollbar-none pr-1">
              {filteredRejections.map((rec: any) => (
                <div key={rec.id} className="p-3 rounded-2xl glass-card-sm flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-white">Bottle #{rec.bottle_number}</span>
                    <p className="text-xs text-[#EF7774] mt-0.5">Defect Reason: {rec.weight_status}</p>
                  </div>
                  <span className="text-[11px] font-mono text-[#cbd5e1]">{rec.created_at || 'Just now'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#9EB3C9]">
              {searchTerm ? 'No defects match your search.' : 'No defect rejections recorded in recent runs. Line quality is running optimal!'}
            </div>
          )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
