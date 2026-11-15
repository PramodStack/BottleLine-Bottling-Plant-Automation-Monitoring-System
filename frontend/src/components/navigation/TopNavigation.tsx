import React from 'react';
import { Search, Bell, Settings, LogOut, RefreshCw, Cpu, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePlantData } from '../../context/PlantDataContext';
import { ConnectionStatus } from '../common/ConnectionStatus';
import { GlassButton } from '../common/GlassButton';

interface TopNavigationProps {
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  searchTerm = '',
  onSearchChange,
}) => {
  const { user, logout } = useAuth();
  const { data, refreshing, refresh, lastUpdated } = usePlantData();

  const dbStatus = data?.database_status?.status === 'connected' ? 'connected' : 'disconnected';

  return (
    <header className="w-full flex items-center justify-between gap-4 py-4 px-2 select-none">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#53D3E2]/30 to-[#6BDE8B]/20 border border-[rgba(220,238,255,0.22)] flex items-center justify-center shadow-lg shadow-[#06101c]/40">
          <Cpu className="w-6 h-6 text-[#53D3E2]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#EDF4FA] tracking-tight">
              SMART BOTTLING PLANT
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[rgba(83,211,226,0.14)] text-[#53D3E2] border border-[rgba(83,211,226,0.28)]">
              DIAView IoT
            </span>
          </div>
          <p className="text-xs text-[#9EB3C9] hidden sm:block">
            Industrial Analytics & Packaging System
          </p>
        </div>
      </div>

      {/* Center Search Pill */}
      <div className="hidden md:flex items-center relative flex-1 max-w-xs mx-4">
        <Search className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          placeholder="Search bottles, batches, tags..."
          className="w-full pl-9 pr-4 py-2 text-xs rounded-full glass-input"
        />
      </div>

      {/* Right Action Bar */}
      <div className="flex items-center gap-2.5">
        {/* DB Connection Indicator */}
        <ConnectionStatus
          status={dbStatus}
          lastUpdated={lastUpdated}
        />

        {/* Manual Refresh */}
        <GlassButton
          variant="circular"
          size="sm"
          onClick={() => refresh()}
          title="Refresh telemetry"
          aria-label="Refresh telemetry"
        >
          <RefreshCw className={`w-4 h-4 text-[#EDF4FA] ${refreshing ? 'animate-spin text-[#53D3E2]' : ''}`} />
        </GlassButton>

        {/* Notification Bell */}
        <GlassButton
          variant="circular"
          size="sm"
          title="System notifications"
          aria-label="System notifications"
        >
          <Bell className="w-4 h-4 text-[#EDF4FA]" />
        </GlassButton>

        {/* Settings */}
        <GlassButton
          variant="circular"
          size="sm"
          title="Plant settings"
          aria-label="Plant settings"
        >
          <Settings className="w-4 h-4 text-[#EDF4FA]" />
        </GlassButton>

        {/* User Profile Pill */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-[rgba(220,238,255,0.12)]">
            <div className="w-8 h-8 rounded-full bg-[rgba(83,211,226,0.18)] border border-[rgba(83,211,226,0.35)] flex items-center justify-center text-[#53D3E2] font-semibold text-xs">
              {user.full_name ? user.full_name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-semibold text-[#EDF4FA] leading-tight truncate max-w-[120px]">
                {user.full_name}
              </p>
              <span className="text-[10px] text-[#53D3E2] uppercase font-mono">
                {user.role}
              </span>
            </div>

            <GlassButton
              variant="circular"
              size="sm"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="text-[#EF7774] hover:bg-[rgba(239,119,116,0.2)]"
            >
              <LogOut className="w-3.5 h-3.5" />
            </GlassButton>
          </div>
        )}
      </div>
    </header>
  );
};
