import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Factory,
  CheckCircle,
  AlertTriangle,
  Layers,
  Infinity as InfinityIcon,
  Target,
  Clock,
  Square,
  RotateCw,
  Edit3,
  Plus,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { api, BatchData } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingState } from '../components/common/LoadingState';
import { GlassButton } from '../components/common/GlassButton';
import { CustomGlassDropdown } from '../components/common/CustomGlassDropdown';
import { NewBatchModal } from '../components/dashboard/NewBatchModal';
import { useToolbar } from '../context/ToolbarContext';
import { useAuth } from '../context/AuthContext';
import { BatchAnalyticsVisual } from '../components/production/BatchAnalyticsVisual';

export const ProductionPage: React.FC = () => {
  const { canCreateBatch, user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchData | null>(null);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setActionError(null);
    try {
      const res = await api.getProductionSummary();
      if (res.success) setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      loadData(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);


  // Register global refresh handler
  useEffect(() => {
    registerRefreshHandler(loadData);
    return () => registerRefreshHandler(null);
  }, [loadData, registerRefreshHandler]);

  const kpis = data?.kpis || {};
  const allBatches: BatchData[] = data?.batches || [];

  // Filter batches by global search term and status
  const filteredBatches = useMemo(() => {
    return allBatches.filter((b) => {
      const matchesSearch =
        !searchTerm ||
        (b.batch_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(b.id || '').includes(searchTerm);
      const matchesStatus =
        !statusFilter ||
        (b.batch_status || '').toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [allBatches, searchTerm, statusFilter]);

  // Stop active batch handler
  const handleStopBatch = async (batch: BatchData) => {
    if (!window.confirm(`Are you sure you want to stop batch ${batch.batch_number}? This will release the line for waiting batches.`)) {
      return;
    }
    setActionError(null);
    try {
      const res = await api.stopProductionBatch(batch.id);
      if (res.success) {
        await loadData();
      } else {
        setActionError(res.message || 'Failed to stop batch');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error executing stop action');
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingBatch(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (batch: BatchData) => {
    setEditingBatch(batch);
    setIsModalOpen(true);
  };

  // Register global CSV download handler
  useEffect(() => {
    const handleDownload = () => {
      if (!filteredBatches.length) return;
      const headers = 'ID,Batch Number,Production Mode,Target Quantity,Produced Quantity,Batch Status,Scheduled Start,Created At\n';
      const rows = filteredBatches
        .map(
          (b) =>
            `${b.id || ''},"${b.batch_number || ''}","${b.production_mode || ''}",${b.target_quantity ?? ''},${b.produced_quantity || 0},"${b.batch_status || ''}","${b.scheduled_start || ''}","${b.created_at || ''}"`
        )
        .join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Production_Batches_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };

    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [filteredBatches, registerDownloadHandler]);

  if (loading && !data) {
    return (
      <LoadingState
        title="LOADING PRODUCTION WAVE"
        message="Preparing production metrics…"
        onRetry={() => loadData(true)}
        size="lg"
      />
    );
  }

  const activeBatchesCount = allBatches.filter(
    (b) => (b.batch_status || '').toLowerCase() === 'in progress'
  ).length;

  const completedBatchesCount = allBatches.filter(
    (b) => (b.batch_status || '').toLowerCase() === 'completed'
  ).length;

  const scheduledBatchesCount = allBatches.filter(
    (b) => (b.batch_status || '').toLowerCase() === 'scheduled'
  ).length;

  return (
    <div className="h-full flex flex-col gap-3 select-none" style={{ minHeight: 0 }}>
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <MetricCard
          title="Total Bottles Produced"
          value={kpis.total_bottles || 0}
          accentColor="cyan"
          icon={<Factory className="w-4 h-4 text-[#4ec5d4]" />}
          trend={{ value: `${kpis.total_box_packed || 0} boxes`, isPositive: true }}
        />
        <MetricCard
          title="Accepted Bottles"
          value={kpis.accepted_bottles || 0}
          accentColor="green"
          icon={<CheckCircle className="w-4 h-4 text-[#5dd47d]" />}
          trend={{ value: `${kpis.acceptance_rate ?? kpis.pass_rate ?? 100}% yield`, isPositive: true }}
        />
        <MetricCard
          title="Rejected Bottles"
          value={kpis.rejected_bottles || 0}
          accentColor="coral"
          icon={<AlertTriangle className="w-4 h-4 text-[#e8716e]" />}
          trend={{ value: `${kpis.rejection_rate ?? 0}% defect`, isNeutral: (kpis.rejected_bottles || 0) === 0 }}
        />
        <MetricCard
          title="Total Batches"
          value={kpis.total_batches || allBatches.length}
          accentColor="yellow"
          icon={<Layers className="w-4 h-4 text-[#dcd64e]" />}
          trend={{
            value: `${activeBatchesCount} active • ${scheduledBatchesCount} scheduled • ${completedBatchesCount} done`,
            isNeutral: true,
          }}
        />
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-3 rounded-2xl bg-[rgba(239,68,68,0.2)] border border-[rgba(239,68,68,0.35)] text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-white hover:underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Production Batch Management Card */}
      <GlassCard
        title="Production Batch Management"
        subtitle={`Tracking ${filteredBatches.length} of ${allBatches.length} batches${
          statusFilter ? ` • Filter: ${statusFilter}` : ''
        }${searchTerm ? ` • Search: "${searchTerm}"` : ''}`}
        headerAction={
          <div className="flex items-center gap-2">
            {/* Status Filter Dropdown on Card */}
            <CustomGlassDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'All Statuses', value: '' },
                { label: 'In Progress', value: 'In Progress' },
                { label: 'Scheduled', value: 'Scheduled' },
                { label: 'Pending', value: 'Pending' },
                { label: 'Completed', value: 'Completed' },
                { label: 'Stopped', value: 'Stopped' },
              ]}
              size="sm"
            />

            {/* Refresh Batches */}
            <button
              onClick={() => loadData(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.24)] text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Refresh Production Batches"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {canCreateBatch && (
              <GlassButton
                size="sm"
                variant="pill"
                onClick={handleOpenCreate}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="bg-[#53D3E2] text-[#14202E] font-bold hover:bg-[#6BDE8B]"
              >
                Create Batch
              </GlassButton>
            )}
          </div>
        }
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Batches List - vertically scrollable */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-340px)] hide-scrollbar scrollbar-none pr-1 space-y-3">
          {filteredBatches.length > 0 ? (
            filteredBatches.map((batch) => {
              const mode = batch.production_mode || (batch.target_quantity && batch.target_quantity > 0 ? 'set_quantity' : 'continuous');
              const isContinuous = mode === 'continuous';
              const target = batch.target_quantity ? Number(batch.target_quantity) : 0;
              const produced = Number(batch.produced_quantity || 0);
              const progressPct = !isContinuous && target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : null;

              const status = batch.batch_status || 'Pending';
              const isCompleted = status.toLowerCase() === 'completed';
              const isInProgress = status.toLowerCase() === 'in progress';
              const isScheduled = status.toLowerCase() === 'scheduled';
              const isPending = status.toLowerCase() === 'pending';
              const isStopped = status.toLowerCase() === 'stopped';

              const statusColor = isCompleted
                ? 'bg-[rgba(34,197,94,0.18)] text-[#22c55e] border-[rgba(34,197,94,0.35)] shadow-[0_0_10px_rgba(34,197,94,0.15)]'
                : isInProgress
                ? 'bg-[rgba(0,210,255,0.18)] text-[#00d2ff] border-[rgba(0,210,226,0.35)] shadow-[0_0_10px_rgba(0,210,255,0.2)] animate-pulse-glow'
                : isScheduled
                ? 'bg-[rgba(168,85,247,0.18)] text-[#c084fc] border-[rgba(168,85,247,0.35)] shadow-[0_0_10px_rgba(168,85,247,0.15)]'
                : isPending
                ? 'bg-[rgba(245,158,11,0.18)] text-[#f59e0b] border-[rgba(245,158,11,0.35)] shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                : 'bg-[rgba(239,68,68,0.18)] text-[#ef4444] border-[rgba(239,68,68,0.35)]';

              return (
                <div
                  key={batch.id}
                  className="p-4 rounded-2xl glass-card-sm flex flex-col md:flex-row md:items-center justify-between gap-3 hover-lift border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)] transition-all duration-200"
                >
                  {/* Left Column: Identification & Metadata */}
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-white tracking-wide">{batch.batch_number}</span>
                      
                      {/* Status Badge */}
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                        {status}
                      </span>

                      {/* Mode Badge */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] text-[#cbd5e1] flex items-center gap-1">
                        {isContinuous ? (
                          <>
                            <InfinityIcon className="w-3 h-3 text-[#53D3E2]" />
                            <span>Continuous</span>
                          </>
                        ) : (
                          <>
                            <Target className="w-3 h-3 text-[#53D3E2]" />
                            <span>Set Quantity</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#94a3b8] flex-wrap">
                      <span>Created: {batch.created_at || 'Recorded in DB'}</span>
                      
                      {batch.scheduled_start && (
                        <span className="flex items-center gap-1 text-[#c084fc]">
                          <Calendar className="w-3 h-3" />
                          <span>Scheduled: {batch.scheduled_start}</span>
                        </span>
                      )}

                      {batch.actual_start && (
                        <span className="flex items-center gap-1 text-[#64748b]">
                          <Clock className="w-3 h-3" />
                          <span>Started: {batch.actual_start}</span>
                        </span>
                      )}

                      {batch.completed_at && (
                        <span className="flex items-center gap-1 text-[#22c55e]">
                          <CheckCircle className="w-3 h-3" />
                          <span>Completed: {batch.completed_at}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: Target / Progress Telemetry */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    {!isContinuous && target > 0 ? (
                      <div className="w-44 hidden sm:block">
                        <div className="flex justify-between text-[11px] text-[#cbd5e1] mb-1">
                          <span className="font-medium">Progress</span>
                          <span className="font-bold text-white">{produced} / {target} ({progressPct}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[rgba(255,255,255,0.1)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#00d2ff] via-[#53D3E2] to-[#22c55e] transition-all duration-300 shadow-[0_0_8px_rgba(0,210,255,0.3)]"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="hidden sm:flex flex-col text-right">
                        <span className="text-[10px] text-[#94a3b8] uppercase font-semibold">Production Mode</span>
                        <span className="text-xs text-[#53D3E2] font-semibold flex items-center gap-1 justify-end">
                          <InfinityIcon className="w-3.5 h-3.5" /> Continuous Line Run
                        </span>
                      </div>
                    )}

                    {/* Produced Counter */}
                    <div className="text-right min-w-[70px]">
                      <span className="text-[9px] text-[#94a3b8] uppercase block font-semibold">Produced</span>
                      <span className="text-lg font-bold text-[#5dd47d] tabular-nums">{produced}</span>
                      <span className="text-[10px] text-[#64748b] block -mt-0.5">bottles</span>
                    </div>

                    {/* Actions: Edit & Stop Buttons */}
                    <div className="flex items-center gap-1.5 pl-2 border-l border-[rgba(255,255,255,0.1)]">
                      {/* Stop button only available for active In Progress batches and non-analyst roles */}
                      {isInProgress && user?.role !== 'analyst' && (
                        <button
                          onClick={() => handleStopBatch(batch)}
                          title="Stop Active Batch"
                          className="px-2.5 py-1.5 rounded-xl bg-[rgba(239,68,68,0.15)] hover:bg-[rgba(239,68,68,0.25)] border border-[rgba(239,68,68,0.35)] text-red-300 hover:text-red-100 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>Stop</span>
                        </button>
                      )}

                      {/* Edit button available for non-completed/non-stopped batches and authorized roles */}
                      {!isCompleted && !isStopped && canCreateBatch && (
                        <button
                          onClick={() => handleOpenEdit(batch)}
                          title="Edit Batch Specifications"
                          className="px-2.5 py-1.5 rounded-xl bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.15)] border border-[rgba(255,255,255,0.15)] text-[#cbd5e1] hover:text-white text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <div className="w-12 h-12 rounded-2xl bg-[rgba(83,211,226,0.1)] border border-[rgba(83,211,226,0.2)] flex items-center justify-center text-[#53D3E2] mb-3">
                <Layers className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">No production batches found</p>
              <p className="text-xs text-[#94a3b8] mt-1 max-w-sm">
                {searchTerm || statusFilter
                  ? 'No batches match the applied search or status filter. Try resetting the toolbar filter.'
                  : 'No production batches exist yet. Register your first batch using the button above to begin production.'}
              </p>
              {!searchTerm && !statusFilter && (
                <div className="mt-4">
                  <GlassButton size="sm" variant="pill" onClick={handleOpenCreate} icon={<Plus className="w-3.5 h-3.5" />}>
                    Register New Batch
                  </GlassButton>
                </div>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Visual Analytics Graphic: Batch Velocity & Target vs Actual Output */}
      <BatchAnalyticsVisual batches={allBatches} kpis={kpis} />

      {/* New / Edit Batch Modal */}
      <NewBatchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadData}
        editBatch={editingBatch}
      />
    </div>
  );
};
