import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  RotateCw,
  Download,
  Activity,
  History,
  Database,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, BottleLog } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { LoadingState } from '../components/common/LoadingState';
import { CustomGlassDropdown } from '../components/common/CustomGlassDropdown';
import { useToolbar } from '../context/ToolbarContext';

export const HistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<BottleLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [localSearch, setLocalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [capFilter, setCapFilter] = useState('');
  const [weightFilter, setWeightFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [loading, setLoading] = useState(true);

  const {
    searchTerm,
    registerDownloadHandler,
    registerRefreshHandler,
  } = useToolbar();

  const effectiveSearch = localSearch || searchTerm || '';

  const fetchLogs = useCallback(
    async (
      page = pagination.page,
      search = effectiveSearch,
      status = statusFilter,
      sort = sortBy,
      dir = sortDir,
      limit = pagination.limit
    ) => {
      setLoading(true);
      try {
        const res = await api.getProductionLogs({
          page,
          limit,
          search,
          status,
          sort_by: sort,
          sort_dir: dir,
        });
        if (res.success) {
          setLogs(res.records || []);
          setPagination(res.pagination || { page, limit, total: 0, pages: 1 });
        }
      } catch (err) {
        console.error('Error fetching production logs:', err);
      } finally {
        setLoading(false);
      }
    },
    [effectiveSearch, statusFilter, sortBy, sortDir, pagination.limit, pagination.page]
  );

  // Client-side additional filtering for cap and weight filters
  const displayedLogs = useMemo(() => {
    return logs.filter((log) => {
      if (capFilter && (log.cap_status || '').toLowerCase() !== capFilter.toLowerCase()) {
        return false;
      }
      if (weightFilter && (log.weight_status || '').toLowerCase() !== weightFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [logs, capFilter, weightFilter]);


  // Register global and local CSV export handler
  const handleDownload = useCallback(async () => {
    try {
      const res = await api.getProductionLogs({
        page: 1,
        limit: 2000,
        search: effectiveSearch,
        status: statusFilter,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      const recordsToExport = res.success && res.records?.length ? res.records : logs;
      if (!recordsToExport.length) return;

      const headers = 'Record ID,Bottle Number,Weight Status,Cap Status,Inspection Result,Timestamp\n';
      const rows = recordsToExport
        .map(
          (l: BottleLog) =>
            `${l.id},${l.bottle_number},"${l.weight_status}","${l.cap_status}","${l.inspection_status}","${l.created_at || ''}"`
        )
        .join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Production_History_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
    }
  }, [logs, effectiveSearch, statusFilter, sortBy, sortDir]);

  useEffect(() => {
    registerDownloadHandler(handleDownload);
    return () => registerDownloadHandler(null);
  }, [handleDownload, registerDownloadHandler]);

  // Register global refresh handler
  useEffect(() => {
    registerRefreshHandler(() => fetchLogs(pagination.page, effectiveSearch, statusFilter, sortBy, sortDir));
    return () => registerRefreshHandler(null);
  }, [fetchLogs, pagination.page, effectiveSearch, statusFilter, sortBy, sortDir, registerRefreshHandler]);

  // Debounce search/filter query
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchLogs(1, effectiveSearch, statusFilter, sortBy, sortDir);
    }, 250);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [effectiveSearch, statusFilter, sortBy, sortDir]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortDir('DESC');
    }
  };

  if (loading && logs.length === 0) {
    return (
      <LoadingState
        title="LOADING PRODUCTION HISTORY"
        message="Preparing historical records…"
        onRetry={() => fetchLogs(pagination.page, effectiveSearch, statusFilter, sortBy, sortDir)}
        size="lg"
      />
    );
  }

  const startIndex = pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const endIndex = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-4 select-none flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* ── Main Production History Glass Card (Identical to User Management Card) ── */}
      <GlassCard
        title="Logged Telemetry Records"
        subtitle={`Managing ${displayedLogs.length} of ${pagination.total} production records in MySQL database`}
        headerAction={
          <div className="flex items-center gap-2.5">
            {/* Export CSV button - matching Audit Logs style in User Management */}
            <button
              onClick={handleDownload}
              className="h-8 px-3.5 rounded-full bg-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.20)] border border-[rgba(215,235,255,0.28)] text-white text-xs font-semibold backdrop-blur-md transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Export Current Telemetry Records as CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#53D3E2]" />
              <span>Export CSV</span>
            </button>

            {/* Historical Audit Badge with vibrant cyan/mint gradient */}
            <div
              className="h-8 px-3.5 rounded-full bg-gradient-to-r from-[#53D3E2] to-[#2dd4bf] text-[#0f172a] text-xs font-bold shadow-[0_0_16px_rgba(83,211,226,0.3)] flex items-center gap-1.5 select-none"
              title="Verified High-Precision SCADA Production Log"
            >
              <History className="w-3.5 h-3.5" />
              <span>Telemetry Audit</span>
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
              placeholder="Search by bottle #, record ID, or result..."
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

          {/* Right: Inspection, Cap, Weight, Page Size, Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Inspection Status Filter */}
            <CustomGlassDropdown
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              options={[
                { label: 'All Results', value: '' },
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
              value={String(pagination.limit)}
              onChange={(val) => {
                const limit = Number(val);
                setPagination((p) => ({ ...p, limit, page: 1 }));
                fetchLogs(1, effectiveSearch, statusFilter, sortBy, sortDir, limit);
              }}
              options={[
                { label: '50 / page', value: '50' },
                { label: '100 / page', value: '100' },
                { label: '250 / page', value: '250' },
                { label: 'All records', value: '1000' },
              ]}
              size="sm"
            />

            {/* Refresh button */}
            <button
              onClick={() => fetchLogs(pagination.page, effectiveSearch, statusFilter, sortBy, sortDir)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.24)] text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Refresh Telemetry History"
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
                          {sortBy === 'id' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('bottle_number')}
                        className="py-3 px-4 w-[20%] min-w-[150px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Bottle Number</span>
                          {sortBy === 'bottle_number' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('weight_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[130px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Weight Status</span>
                          {sortBy === 'weight_status' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('cap_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[120px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Cap Status</span>
                          {sortBy === 'cap_status' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('inspection_status')}
                        className="py-3 px-3.5 w-[16%] min-w-[140px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Inspection Result</span>
                          {sortBy === 'inspection_status' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('created_at')}
                        className="py-3 px-4 w-[18%] min-w-[150px] cursor-pointer hover:text-[#53D3E2] transition-colors select-none"
                      >
                        <div className="flex items-center gap-1">
                          <span>Timestamp</span>
                          {sortBy === 'created_at' ? (
                            sortDir === 'ASC' ? <ArrowUp className="w-3 h-3 text-[#53D3E2]" /> : <ArrowDown className="w-3 h-3 text-[#53D3E2]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[#9EB3C9] opacity-40" />
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
                    <LoadingState message="Loading production telemetry records..." size="sm" />
                  </div>
                ) : displayedLogs.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <Database className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
                    <p className="text-sm font-semibold text-white">No matching telemetry records found</p>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      Try adjusting your search criteria or inspection filters.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left table-fixed border-collapse text-xs">
                    <tbody className="divide-y divide-[rgba(215,235,255,0.10)]">
                      {displayedLogs.map((log) => {
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
                              {log.created_at || 'Live Stream'}
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
                <strong className="text-white font-bold">{pagination.total}</strong> production records
              </span>
              {statusFilter && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white font-medium">
                  Result: {statusFilter}
                </span>
              )}
            </div>

            {/* Right: Telemetry Audit Active + Pagination Controls */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 text-[10px] text-[#9ebad6]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
                <span>Telemetry Audit Active</span>
                <span className="text-slate-400/60">•</span>
                <span>MariaDB / MySQL Sync</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => fetchLogs(pagination.page - 1, effectiveSearch, statusFilter, sortBy, sortDir)}
                  disabled={pagination.page <= 1}
                  className="h-7 px-2.5 rounded-full bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] disabled:opacity-30 disabled:cursor-not-allowed border border-[rgba(215,235,255,0.22)] text-white text-xs font-medium flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="h-7 px-3 rounded-full bg-[rgba(255,255,255,0.06)] border border-[rgba(215,235,255,0.18)] text-white text-xs font-semibold flex items-center">
                  Page {pagination.page} of {Math.max(1, pagination.pages)}
                </span>
                <button
                  onClick={() => fetchLogs(pagination.page + 1, effectiveSearch, statusFilter, sortBy, sortDir)}
                  disabled={pagination.page >= pagination.pages}
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
