import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { GlassButton } from './GlassButton';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Telemetry Connection Notice',
  message = 'Unable to synchronize telemetry data. The plant telemetry service may be initializing.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center max-w-md mx-auto">
      <div className="w-12 h-12 rounded-full bg-[rgba(239,119,116,0.14)] border border-[rgba(239,119,116,0.3)] flex items-center justify-center text-[#EF7774] mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h4 className="text-base font-semibold text-[#EDF4FA] mb-1">{title}</h4>
      <p className="text-xs text-[#9EB3C9] leading-relaxed mb-4">{message}</p>
      {onRetry && (
        <GlassButton onClick={onRetry} size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Retry Connection
        </GlassButton>
      )}
    </div>
  );
};
