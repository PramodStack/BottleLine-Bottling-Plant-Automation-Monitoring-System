import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records available',
  description = 'No production records or telemetry events match the current filter criteria.',
  icon,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-[rgba(155,182,210,0.12)] border border-[rgba(220,238,255,0.18)] flex items-center justify-center text-[#9EB3C9] mb-4">
        {icon || <PackageOpen className="w-7 h-7 text-[#53D3E2]" />}
      </div>
      <h4 className="text-base font-semibold text-[#EDF4FA] mb-1">{title}</h4>
      <p className="text-xs text-[#9EB3C9] leading-relaxed mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
