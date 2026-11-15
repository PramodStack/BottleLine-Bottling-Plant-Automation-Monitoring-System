import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ArrowUpRight, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BottleLog } from '../../services/api';

interface RecentActivityListProps {
  logs: BottleLog[];
}

export const RecentActivityList: React.FC<RecentActivityListProps> = ({ logs }) => {
  // Use verified telemetry logs
  const displayLogs = logs.slice(0, 6);

  return (
    <div className="w-full h-full flex flex-col p-4 select-none" style={{ minHeight: 0 }}>
      {/* Header Row: Title & View All Link */}
      <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
        <h3 className="text-sm font-bold text-white tracking-wide drop-shadow-sm">
          Recent Bottle Inspections
        </h3>
        <Link
          to="/dashboard/history"
          className="text-[11px] text-[#cbd5e1] hover:text-white flex items-center gap-1 transition-colors group cursor-pointer"
        >
          <span>View All</span>
          <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* Items List */}
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-none pr-0.5" style={{ minHeight: 0 }}>
        {displayLogs.length > 0 ? (
          displayLogs.map((item) => {
            const isPassed = (item.inspection_status || '').toLowerCase() === 'passed';
            const isRejected = (item.inspection_status || '').toLowerCase() === 'rejected';

            const badgeClass = isPassed
              ? 'bg-[rgba(34,197,94,0.18)] text-[#22c55e] border-[rgba(34,197,94,0.3)] shadow-[0_0_8px_rgba(34,197,94,0.15)]'
              : isRejected
              ? 'bg-[rgba(239,68,68,0.18)] text-[#f87171] border-[rgba(239,68,68,0.3)] shadow-[0_0_8px_rgba(239,68,68,0.15)]'
              : 'bg-[rgba(0,210,255,0.18)] text-[#00d2ff] border-[rgba(0,210,255,0.3)] shadow-[0_0_8px_rgba(0,210,255,0.15)]';

            const timeStr = item.created_at ? item.created_at.slice(11, 19) : '';

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.09)] border border-[rgba(255,255,255,0.09)] hover:border-[rgba(255,255,255,0.20)] transition-all duration-200 cursor-pointer group hover-lift"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status Indicator Icon */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 backdrop-blur-sm border shadow-sm ${
                      isPassed
                        ? 'bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.3)] text-[#22c55e]'
                        : isRejected
                        ? 'bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.3)] text-[#f87171]'
                        : 'bg-[rgba(0,210,255,0.12)] border-[rgba(0,210,255,0.3)] text-[#00d2ff]'
                    }`}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isRejected ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-white tracking-tight group-hover:text-[#00d2ff] transition-colors truncate">
                        Bottle #{item.bottle_number}
                      </h4>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-md ${badgeClass}`}>
                        {item.inspection_status || 'Pending'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#cbd5e1] mt-0.5 truncate font-medium">
                      Weight: {item.weight_status || 'N/A'} • Cap: {item.cap_status || 'N/A'}{timeStr ? ` • ${timeStr}` : ''}
                    </p>
                  </div>
                </div>

                {/* Right Arrow */}
                <ChevronRight className="w-4 h-4 text-[#94a3b8] group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-6 text-center text-xs text-[#94a3b8]">
            <p>No bottle inspection records logged yet.</p>
            <span className="text-[10px] text-[#64748b] mt-1">Awaiting events from SCADA / DIAView</span>
          </div>
        )}
      </div>
    </div>
  );
};
