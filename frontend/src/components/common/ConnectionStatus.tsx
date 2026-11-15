import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'degraded';
  lastUpdated?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  lastUpdated,
  onRefresh,
  refreshing = false,
}) => {
  const isConnected = status === 'connected';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card-sm text-xs">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {isConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6BDE8B] opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isConnected ? 'bg-[#6BDE8B]' : 'bg-[#EF7774]'
            }`}
          ></span>
        </span>
        <span className="font-medium text-[#EDF4FA]">
          {isConnected ? 'Production Data' : 'Temporarily Unavailable'}
        </span>
      </div>

      <span className="text-[#7E95AD] hidden md:inline">|</span>
      <span className="text-[#9EB3C9] hidden md:inline text-[11px] font-medium">
        {isConnected ? 'System Ready' : 'Reconnecting'}
      </span>

      {lastUpdated && (
        <>
          <span className="text-[#7E95AD] hidden lg:inline">•</span>
          <span className="text-[#7E95AD] hidden lg:inline text-[11px]">
            {lastUpdated.split(' ')[1] || lastUpdated}
          </span>
        </>
      )}
    </div>
  );
};
