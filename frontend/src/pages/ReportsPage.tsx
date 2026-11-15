import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, BottleLog } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { LoadingState } from '../components/common/LoadingState';
import { CustomGlassDropdown } from '../components/common/CustomGlassDropdown';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { useToolbar } from '../context/ToolbarContext';
import { generatePlantReportPdf } from '../utils/generatePdfReport';
import {
  Search,
  X,
  RotateCw,
  FileDown,
  CheckCircle2,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [logs, setLogs] = useState<BottleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [capFilter, setCapFilter] = useState('');
  const [weightFilter, setWeightFilter] = useState('');
  const [sortField, setSortField] = useState('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const effectiveSearch = localSearch || searchTerm || '';

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, logsRes] = await Promise.all([
        api.getProductionReport('json'),
        api.getProductionLogs({ page: 1, limit: 1000, sort_by: 'id', sort_dir: 'desc' }),
      ]);

      if (repRes.success) setReport(repRes);
      if (logsRes.success) setLogs(logsRes.records || []);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Register global refresh handler
  useEffect(() => {
    registerRefreshHandler(fetchReportData);
    return () => registerRefreshHandler(null);
  }, [fetchReportData, registerRefreshHandler]);

  // Comprehensive client-side filtering and sorting
  const processedLogs = useMemo(() => {
    let result = [...logs];

    // Search filter
    if (effectiveSearch.trim()) {
      const term = effectiveSearch.toLowerCase().replace('#', '').trim();
      result = result.filter(
        (l) =>
          String(l.id).includes(term) ||
          String(l.bottle_number).includes(term) ||
          (l.weight_status || '').toLowerCase().includes(term) ||
          (l.cap_status || '').toLowerCase().includes(term) ||
          (l.inspection_status || '').toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter(
        (l) => (l.inspection_status || '').toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Cap filter
    if (capFilter) {
      result = result.filter(
        (l) => (l.cap_status || '').toLowerCase() === capFilter.toLowerCase()
      );
    }

    // Weight filter
    if (weightFilter) {
      result = result.filter(
        (l) => (l.weight_status || '').toLowerCase() === weightFilter.toLowerCase()
      );
    }

    // Sorting
    result.sort((a, b) => {
      let valA: any = (a as any)[sortField];
      let valB: any = (b as any)[sortField];

      if (sortField === 'id' || sortField === 'bottle_number') {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [logs, effectiveSearch, statusFilter, capFilter, weightFilter, sortField, sortDir]);

  // Reset page when search or filters change
  useEffect(() => {
    setPage(1);
  }, [effectiveSearch, statusFilter, capFilter, weightFilter]);

  const totalFiltered = processedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPageLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return processedLogs.slice(start, start + pageSize);
  }, [processedLogs, page, pageSize]);

  const sum = report?.summary || {};
  const batch = report?.batch_details || {};

  // PDF report export handler
  const handleDownloadPdf = useCallback(() => {
    const total = Number(sum.total_bottles || 0);
    const accepted = Number(sum.accepted_bottles || 0);
    const rejected = Number(sum.rejected_bottles || 0);
    const boxes = Number(sum.total_box_packed || 0);

    const passRate = total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 100.0;
    const rejectRate = total > 0 ? Number(((rejected / total) * 100).toFixed(1)) : 0.0;

    generatePlantReportPdf({
      summary: {
        total_bottles: total,
        accepted_bottles: accepted,
        rejected_bottles: rejected,
        total_box_packed: boxes,
        pass_rate: passRate,
        reject_rate: rejectRate,
      },
      batch: {
        batch_number: batch.batch_number || 'BATCH-001',
        target_quantity: Number(batch.target_quantity || 1000),
        produced_quantity: Number(batch.produced_quantity || total),
        batch_status: batch.batch_status || 'In Progress',
      },
      logs: processedLogs.length > 0 ? processedLogs : logs,
    });
  }, [sum, batch, processedLogs, logs]);

  // Register global download handler
  useEffect(() => {
    registerDownloadHandler(handleDownloadPdf);
    return () => registerDownloadHandler(null);
  }, [handleDownloadPdf, registerDownloadHandler]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  if (loading && !report) {
    return (
      <LoadingState
        title="LOADING PLANT REPORTS"
        message="Preparing report analytics…"
        onRetry={fetchReportData}
        size="lg"
      />
    );
  }

  const totalBottles = Number(sum.total_bottles || 0);
  const acceptedBottles = Number(sum.accepted_bottles || 0);
  const rejectedBottles = Number(sum.rejected_bottles || 0);
  const passRatio = totalBottles > 0 ? ((acceptedBottles / totalBottles) * 100).toFixed(1) : '100.0';

  const startIndex = totalFiltered > 0 ? (page - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(page * pageSize, totalFiltered);

  return (
    <div className="space-y-4 select-none flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* ── Shift Operational Summary ── */}
      <GlassCard title="Shift Operational Summary" subtitle="Live aggregate operational metrics across current production run">
        <div className="space-y-4 pt-1">
          {/* Key metrics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-white uppercase tracking-wider font-bold">Total Bottles</span>
              <p className="text-2xl font-bold text-[#EDF4FA] mt-1">
                <AnimatedNumber value={totalBottles} />
              </p>
              <span className="text-[10px] text-[#53D3E2] font-medium">Cumulative plant count</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-white uppercase tracking-wider font-bold">Quality Accepted</span>
              <p className="text-2xl font-bold text-[#6BDE8B] mt-1">
                <AnimatedNumber value={acceptedBottles} />
              </p>
              <span className="text-[10px] text-[#6BDE8B] font-medium">
                <AnimatedNumber value={passRatio} suffix="%" decimals={1} /> Pass Ratio
              </span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-white uppercase tracking-wider font-bold">Total Boxes Packed</span>
              <p className="text-2xl font-bold text-[#E7DF55] mt-1">
                <AnimatedNumber value={sum.total_box_packed || 0} />
              </p>
              <span className="text-[10px] text-[#E7DF55] font-medium">3 Bottles per box</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-white uppercase tracking-wider font-bold">Defect Rejections</span>
              <p className="text-2xl font-bold text-[#EF7774] mt-1">
                <AnimatedNumber value={rejectedBottles} />
              </p>
              <span className="text-[10px] text-[#EF7774] font-medium">Flagged sensor units</span>
            </div>
          </div>

          {/* Batch details box */}
          <div className="p-3.5 rounded-2xl glass-card-sm border border-[rgba(220,238,255,0.18)]">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
              Batch Telemetry Specifications
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[#cbd5e1] font-medium">Batch Number:</span>
                <p className="font-semibold text-[#53D3E2] mt-0.5">{batch.batch_number || 'BATCH-001'}</p>
              </div>
              <div>
                <span className="text-[#cbd5e1] font-medium">Batch Status:</span>
                <p className="font-semibold text-[#6BDE8B] mt-0.5">{batch.batch_status || 'In Progress'}</p>
              </div>
              <div>
                <span className="text-[#cbd5e1] font-medium">Produced Quantity:</span>
                <p className="font-semibold text-[#EDF4FA] mt-0.5">
                  <AnimatedNumber value={batch.produced_quantity || 0} /> units
                </p>
              </div>
              <div>
                <span className="text-[#cbd5e1] font-medium">Database Target:</span>
                <p className="font-semibold text-[#E7DF55] mt-0.5">
                  {batch.target_quantity > 0 ? `${batch.target_quantity} units` : 'Continuous Run'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Main Audit Log Telemetry Glass Card (Identical to User Management Card) ── */}
      <GlassCard
        title="Audit Log Telemetry Records"
        subtitle={`Managing ${processedLogs.length} of ${logs.length} verified production records in MySQL database`}
        headerAction={
          <div className="flex items-center gap-2.5">
            {/* Download PDF button - matching Audit Logs style in User Management */}
            <button
              onClick={handleDownloadPdf}
              className="h-8 px-3.5 rounded-full bg-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.20)] border border-[rgba(215,235,255,0.28)] text-white text-xs font-semibold backdrop-blur-md transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Download Comprehensive PDF Quality Audit Report"
            >
              <FileDown className="w-3.5 h-3.5 text-[#53D3E2]" />
              <span>Download PDF</span>
            </button>

            {/* Audit Verified Badge with vibrant cyan/mint gradient */}
            <div
              className="h-8 px-3.5 rounded-full bg-gradient-to-r from-[#53D3E2] to-[#2dd4bf] text-[#0f172a] text-xs font-bold shadow-[0_0_16px_rgba(83,211,226,0.3)] flex items-center gap-1.5 select-none"
              title="Verified ISO Compliance Quality Audit Log"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Verified</span>
            </div>
          </div>
        }
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        {/* ── Unified Search & Filter Toolbar (Identical to User Management Toolbar) ── */}
        <div className="flex items-center justify-between gap-3 pb-3 mb-2.5 border-b border-[rgba(215,235,255,0.18)] flex-wrap flex-shrink-0">
          {/* Left: Search input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-3.5 h-3.5 text-[rgba(215,235,255,0.7)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by bottle #, record ID, or status..."
              className="w-full h-8 pl-8 pr-7 text-xs rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(215,235,255,0.22)] focus:border-[#53D3E2] focus:bg-[rgba(255,255,255,0.14)] text-white placeholder-[rgba(215,235,255,0.65)] outline-none transition-all shadow-inner"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white"
                title="Clear Search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right: Filters, Page Size, Sort, Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Inspection Status Filter */}
            <CustomGlassDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'All Inspections', value: '' },
                { label: 'Passed Only', value: 'Passed' },
                { label: 'Rejected Only', value: 'Rejected' },
                { label: 'Pending Only', value: 'Pending' },
              ]}
              size="sm"
            />

            {/* Cap Status Filter */}
            <CustomGlassDropdown
              value={capFilter}
              onChange={setCapFilter}
              options={[
                { label: 'All Cap Status', value: '' },
                { label: 'Capped', value: 'Capped' },
                { label: 'Pending', value: 'Pending' },
              ]}
              size="sm"
            />

            {/* Weight Status Filter */}
            <div className="hidden sm:inline-block">
              <CustomGlassDropdown
                value={weightFilter}
                onChange={setWeightFilter}
                options={[
                  { label: 'All Weight', value: '' },
                  { label: 'OK (Nominal)', value: 'OK' },
                  { label: 'Low Weight', value: 'Low Weight' },
                  { label: 'Pending', value: 'Pending' },
                ]}
                size="sm"
              />
            </div>

            {/* Page Size Selector */}
            <CustomGlassDropdown
              value={String(pageSize)}
              onChange={(val) => {
                setPageSize(Number(val));
                setPage(1);
              }}
              options={[
                { label: '25 / page', value: '25' },
                { label: '50 / page', value: '50' },
                { label: '100 / page', value: '100' },
                { label: '150 / page', value: '150' },
                { label: 'All records', value: '1000' },
              ]}
              size="sm"
            />

            {/* Sort Toggle */}
            <button
              onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="h-8 px-3 rounded-full bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.24)] text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              title="Toggle sort direction"
            >
              <ArrowUpDown className="w-3 h-3 text-[#53D3E2]" />
              <span>{sortDir === 'asc' ? 'Ascending' : 'Descending'}</span>
            </button>

            {/* Refresh button */}
            <button
              onClick={fetchReportData}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.24)] text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Refresh Audit Telemetry"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Table Container (Light Blue Frosted Glass, Subtle Blur, Soft Separators) ── */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-[rgba(215,235,255,0.22)] bg-[rgba(255,255,255,0.08)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_0_rgba(10,25,50,0.22)]">
          <div className="flex-1 flex flex-col min-h-0 overflow-x-auto hide-scrollbar scrollbar-none">
            <div className="min-w-[760px] flex-1 flex flex-col min-h-0">
              {/* ── Fixed Lite-Color Header (Records NEVER scroll behind this!) ── */}
              <div className="border-b border-[rgba(215,235,255,0.20)] bg-[rgba(195,222,248,0.20)] backdrop-blur-md flex-shrink-0 z-10 shadow-sm">
                <table className="w-full text-left table-fixed border-collapse text-xs">
                  <thead>
                    <tr className="text-[#e8f1fa] font-bold uppercase tracking-wider text-[10px]">
                      <th
                        onClick={() => handleSort('id')}
                        className="py-3 px-4 w-[14%] min-w-[100px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Record ID</span>
                          {sortField === 'id' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('bottle_number')}
                        className="py-3 px-4 w-[20%] min-w-[150px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Bottle #</span>
                          {sortField === 'bottle_number' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('weight_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[130px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Weight Status</span>
                          {sortField === 'weight_status' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('cap_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[120px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Cap Status</span>
                          {sortField === 'cap_status' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('inspection_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[140px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Inspection Result</span>
                          {sortField === 'inspection_status' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('created_at')}
                        className="py-3 px-4 w-[18%] min-w-[150px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Timestamp</span>
                          {sortField === 'created_at' && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>

              {/* ── Scrollable Records (Starts BELOW header - clipped cleanly when scrolling up!) ── */}
              <div className="flex-1 overflow-y-auto hide-scrollbar scrollbar-none">
                {loading && logs.length === 0 ? (
                  <div className="h-48 flex items-center justify-center">
                    <LoadingState message="Loading telemetry audit logs..." size="sm" />
                  </div>
                ) : processedLogs.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <Database className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
                    <p className="text-sm font-semibold text-white">No matching audit records found</p>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      Try adjusting your search criteria or inspection filters.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left table-fixed border-collapse text-xs">
                    <tbody className="divide-y divide-[rgba(215,235,255,0.10)]">
                      {currentPageLogs.map((log) => {
                        const isWeightOk = (log.weight_status || '').toLowerCase() === 'ok';
                        const isWeightLow = (log.weight_status || '').toLowerCase().includes('low');

                        const isCapped = (log.cap_status || '').toLowerCase() === 'capped';

                        const isPassed = (log.inspection_status || '').toLowerCase() === 'passed';
                        const isRejected = (log.inspection_status || '').toLowerCase() === 'rejected';

                        return (
                          <tr
                            key={log.id}
                            className="hover:bg-[rgba(255,255,255,0.12)] transition-colors duration-150 group"
                          >
                            {/* 1. Record ID */}
                            <td className="py-3 px-4 w-[14%] min-w-[100px]">
                              <span className="font-mono text-[11px] text-[#cbd5e1] font-semibold bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded-md border border-[rgba(215,235,255,0.15)]">
                                #{log.id}
                              </span>
                            </td>

                            {/* 2. Bottle Number */}
                            <td className="py-3 px-4 w-[20%] min-w-[150px]">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[rgba(83,211,226,0.15)] border border-[rgba(83,211,226,0.30)] flex items-center justify-center text-[10px] font-bold text-[#53D3E2] shadow-sm">
                                  #{log.bottle_number}
                                </div>
                                <span className="font-bold text-white text-xs tracking-wide">
                                  Bottle #{log.bottle_number}
                                </span>
                              </div>
                            </td>

                            {/* 3. Weight Status Pill */}
                            <td className="py-3 px-3.5 w-[16%] min-w-[130px] whitespace-nowrap">
                              {isWeightOk ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(34,197,94,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#22c55e]" />
                                  <span>OK</span>
                                </span>
                              ) : isWeightLow ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-[0_0_8px_rgba(239,68,68,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e]" />
                                  <span>Low Weight</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                                  <span>{log.weight_status || 'Pending'}</span>
                                </span>
                              )}
                            </td>

                            {/* 4. Cap Status Pill */}
                            <td className="py-3 px-3.5 w-[16%] min-w-[120px] whitespace-nowrap">
                              {isCapped ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-[#53D3E2] border border-cyan-500/30 shadow-[0_0_8px_rgba(83,211,226,0.15)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#53D3E2] shadow-[0_0_6px_#53D3E2]" />
                                  <span>Capped</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                                  <span>{log.cap_status || 'Pending'}</span>
                                </span>
                              )}
                            </td>

                            {/* 5. Inspection Result Pill */}
                            <td className="py-3 px-3.5 w-[16%] min-w-[140px] whitespace-nowrap">
                              {isPassed ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(34,197,94,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#22c55e]" />
                                  <span>Passed</span>
                                </span>
                              ) : isRejected ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-[0_0_8px_rgba(239,68,68,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_#f43f5e]" />
                                  <span>Rejected</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                                  <span>{log.inspection_status || 'Pending'}</span>
                                </span>
                              )}
                            </td>

                            {/* 6. Timestamp */}
                            <td className="py-3 px-4 w-[18%] min-w-[150px] text-[#9EB3C9] font-mono text-[11px] whitespace-nowrap">
                              {log.created_at || 'Recorded'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── Table Footer Summary Bar (Light Translucent Surface matching User Management) ── */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[rgba(215,235,255,0.18)] bg-[rgba(195,222,248,0.12)] text-[11px] text-[#b6cce2] flex-shrink-0 backdrop-blur-md flex-wrap gap-2">
            {/* Left: Summary text */}
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-white font-bold">{startIndex}</strong> to{' '}
                <strong className="text-white font-bold">{endIndex}</strong> of{' '}
                <strong className="text-white font-bold">{totalFiltered}</strong> verified telemetry records
              </span>
              {statusFilter && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white font-medium">
                  Result: {statusFilter}
                </span>
              )}
            </div>

            {/* Right: Audit trail status + Pagination Controls */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 text-[10px] text-[#9ebad6]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
                <span>ISO-9001 Telemetry Audit Trail</span>
                <span className="text-slate-400/60">•</span>
                <span>Automated PDF Ready</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 px-2.5 rounded-full bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] disabled:opacity-30 disabled:cursor-not-allowed border border-[rgba(215,235,255,0.22)] text-white text-xs font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="h-7 px-3 rounded-full bg-[rgba(255,255,255,0.06)] border border-[rgba(215,235,255,0.18)] text-white text-xs font-semibold flex items-center">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 px-2.5 rounded-full bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] disabled:opacity-30 disabled:cursor-not-allowed border border-[rgba(215,235,255,0.22)] text-white text-xs font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
