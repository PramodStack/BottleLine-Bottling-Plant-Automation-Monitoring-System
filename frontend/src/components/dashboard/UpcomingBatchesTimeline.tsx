import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, CheckCircle, Clock } from 'lucide-react';
import { BatchData } from '../../services/api';

interface UpcomingBatchesTimelineProps {
  currentBatch?: BatchData;
  batches?: BatchData[];
}

export const UpcomingBatchesTimeline: React.FC<UpcomingBatchesTimelineProps> = ({ currentBatch, batches }) => {
  // Use verified production batches
  const batchList: BatchData[] = batches && batches.length > 0
    ? batches
    : currentBatch
    ? [currentBatch]
    : [];

  return (
    <div className="w-full h-full flex flex-col p-4 select-none justify-between" style={{ minHeight: 0 }}>
      {/* Header Row: Title on left, View All link on right */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="text-sm font-bold text-white tracking-wide drop-shadow-sm">
          Production Batches & Schedule
        </h3>
        <Link
          to="/dashboard/production"
          className="text-[11px] text-[#cbd5e1] hover:text-white flex items-center gap-1 transition-colors group cursor-pointer"
        >
          <span>Batch Schedule</span>
          <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* Items List */}
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-none pr-0.5" style={{ minHeight: 0 }}>
        {batchList.length > 0 ? (
          batchList.map((batch) => {
            const statusLower = (batch.batch_status || '').toLowerCase();
            const isCompleted = statusLower === 'completed';
            const isInProgress = statusLower === 'in progress';
            const isScheduled = statusLower === 'scheduled';
            const isPending = statusLower === 'pending';
            const isStopped = statusLower === 'stopped';

            const badgeClass = isCompleted
              ? 'bg-[rgba(34,197,94,0.18)] text-[#22c55e] border-[rgba(34,197,94,0.3)] shadow-[0_0_8px_rgba(34,197,94,0.15)]'
              : isInProgress
              ? 'bg-[rgba(0,210,255,0.18)] text-[#00d2ff] border-[rgba(0,210,226,0.3)] shadow-[0_0_8px_rgba(0,210,255,0.15)]'
              : isScheduled
              ? 'bg-[rgba(168,85,247,0.18)] text-[#c084fc] border-[rgba(168,85,247,0.3)] shadow-[0_0_8px_rgba(168,85,247,0.15)]'
              : isPending
              ? 'bg-[rgba(245,158,11,0.18)] text-[#f59e0b] border-[rgba(245,158,11,0.3)] shadow-[0_0_8px_rgba(245,158,11,0.15)]'
              : 'bg-[rgba(239,68,68,0.18)] text-[#ef4444] border-[rgba(239,68,68,0.3)]';

            const isContinuous = batch.production_mode === 'continuous' || (!batch.target_quantity || batch.target_quantity <= 0);
            const target = batch.target_quantity || 0;
            const produced = batch.produced_quantity || 0;
            const progress = !isContinuous && target > 0 ? Math.round((produced / target) * 100) : null;

            const dateSource = batch.scheduled_start || batch.created_at;
            const createdDate = dateSource ? new Date(dateSource) : null;
            const monthStr = createdDate && !isNaN(createdDate.getTime()) ? createdDate.toLocaleDateString('en-US', { month: 'short' }) : 'BAT';
            const dayStr = createdDate && !isNaN(createdDate.getTime()) ? String(createdDate.getDate()) : String(batch.id);

            return (
              <div
                key={batch.id || batch.batch_number}
                className="flex items-center justify-between p-2 rounded-2xl bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.09)] border border-[rgba(255,255,255,0.09)] hover:border-[rgba(255,255,255,0.20)] transition-all duration-200 cursor-pointer group hover-lift"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Circular Date / ID Badge */}
                  <div className="w-9 h-9 rounded-full bg-[rgba(42,60,82,0.70)] backdrop-blur-sm border border-[rgba(210,226,240,0.22)] flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-[8px] font-bold text-white leading-none">{monthStr}</span>
                    <span className="text-[8px] text-[#cbd5e1] font-semibold mt-0.5 leading-none">{dayStr}</span>
                  </div>

                  {/* Circular Icon Thumbnail */}
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-[rgba(255,255,255,0.25)] shadow-[0_0_8px_rgba(0,210,255,0.15)] flex items-center justify-center flex-shrink-0 bg-[rgba(255,255,255,0.08)] text-[#00d2ff]">
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-[#22c55e]" />
                    ) : isInProgress ? (
                      <Layers className="w-4 h-4 text-[#00d2ff]" />
                    ) : (
                      <Clock className="w-4 h-4 text-[#f59e0b]" />
                    )}
                  </div>

                  {/* Title & Route/Details */}
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white tracking-tight group-hover:text-[#00d2ff] transition-colors truncate">
                      {batch.batch_number}
                    </h4>
                    <p className="text-[10px] text-[#cbd5e1] mt-0.5 truncate font-medium">
                      Produced: {produced} {target > 0 ? `/ ${target} (${progress}%)` : '• Continuous Run'}
                    </p>
                  </div>
                </div>

                {/* Status Pill Badge */}
                <span className={`text-[9px] font-semibold px-2.5 py-0.5 rounded-full border flex-shrink-0 ml-2 backdrop-blur-md ${badgeClass}`}>
                  {batch.batch_status || 'In Progress'}
                </span>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-6 text-center text-xs text-[#94a3b8]">
            <p>No production batches found.</p>
            <span className="text-[10px] text-[#64748b] mt-1">Awaiting scheduled production batch</span>
          </div>
        )}
      </div>

      {/* Footer Link */}
      <div className="pt-2 text-center border-t border-[rgba(255,255,255,0.12)] flex-shrink-0">
        <Link
          to="/dashboard/production"
          className="text-[11px] text-[#cbd5e1] hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
        >
          <span>View All Production Batches</span>
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
