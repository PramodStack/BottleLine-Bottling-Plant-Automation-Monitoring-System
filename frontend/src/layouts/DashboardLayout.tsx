import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Search,
  Bell,
  Settings,
  Plus,
  Download,
  RotateCw,
  LayoutDashboard,
  CalendarDays,
  Waves,
  BadgeCheck,
  ShieldCheck,
  Package,
  History,
  UsersRound,
  ChartNoAxesCombined,
  User as UserIcon,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlantData } from '../context/PlantDataContext';
import { useToolbar } from '../context/ToolbarContext';
import { NewBatchModal } from '../components/dashboard/NewBatchModal';
import { CustomGlassDropdown } from '../components/common/CustomGlassDropdown';
import { GlobalAiAssistant } from '../components/dashboard/GlobalAiAssistant';
import { MacDockNav } from '../components/navigation/MacDockNav';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import { FullscreenButton } from '../components/common/FullscreenButton';

/* ── Page title map ── */
const pageTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/production': 'Production Wave',
  '/dashboard/bottle-tracking': 'Bottle Tracking',
  '/dashboard/inspection': 'Quality Inspection',
  '/dashboard/capping': 'Capping Operations',
  '/dashboard/packaging': 'Packaging Line',
  '/dashboard/history': 'Production History',
  '/dashboard/users': 'User Management',
  '/dashboard/reports': 'Plant Reports',
  '/profile': 'My Profile',
  '/dashboard/profile': 'My Profile',
};

/* ── Optional Page Subtitles ── */
const pageSubtitles: Record<string, string> = {
  '/dashboard/users': 'Manage accounts, roles, and access permissions',
  '/profile': 'Manage your personal information, account security and preferences',
  '/dashboard/profile': 'Manage your personal information, account security and preferences',
};

/* ── Isolated circular navigation items (User Management immediately to the LEFT of Reports) ── */
const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Overview', end: true, adminOnly: false },
  { to: '/dashboard/production', icon: CalendarDays, label: 'Production Schedule', adminOnly: false },
  { to: '/dashboard/bottle-tracking', icon: Waves, label: 'Process Monitoring', adminOnly: false },
  { to: '/dashboard/inspection', icon: BadgeCheck, label: 'Quality Inspection', adminOnly: false },
  { to: '/dashboard/capping', icon: ShieldCheck, label: 'Safety & Capping', adminOnly: false },
  { to: '/dashboard/packaging', icon: Package, label: 'Packaging Line', adminOnly: false },
  { to: '/dashboard/history', icon: History, label: 'Production History', adminOnly: false },
  { to: '/dashboard/users', icon: UsersRound, label: 'User Management', adminOnly: true },
  { to: '/dashboard/reports', icon: ChartNoAxesCombined, label: 'Reports & Analytics', adminOnly: false },
];

export const DashboardLayout: React.FC = () => {
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { user, logout, canManageUsers, canCreateBatch, isOwner } = useAuth();
  const { data, refreshing, refresh, error } = usePlantData();
  const {
    searchTerm,
    setSearchTerm,
    statusDropdown,
    triggerDownload,
    triggerRefresh,
    isRefreshing,
    isNewBatchOpen,
    setIsNewBatchOpen,
  } = useToolbar();
  const location = useLocation();
  const layoutRef = useRef<HTMLDivElement>(null);

  const normalizedPath = location.pathname.replace(/\/$/, '') || '/dashboard';
  const currentPage = pageTitles[normalizedPath] || 'Overview';

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGlobalRefresh = async () => {
    await Promise.all([triggerRefresh(), refresh()]);
  };

  return (
    <div
      ref={layoutRef}
      className="h-screen w-screen atmospheric-bg text-white flex flex-col overflow-hidden select-none relative"
      style={{ padding: 'clamp(10px, 1.3vw, 22px)' }}
    >
      {/* ═══════════════════════ MAIN SHELL (overflow-visible to prevent header clipping) ═══════════════════════ */}
      <div className="w-full h-full flex flex-col relative z-10 overflow-visible" style={{ minHeight: 0 }}>

        {/* ═══════════════════════ TOP HEADER ═══════════════════════ */}
        <header className="w-full flex items-center justify-between gap-4 pb-2.5 relative z-30 flex-shrink-0 overflow-visible">

          {/* ── LEFT: Branding on top, Name of page below ── */}
          <div className="flex flex-col min-w-0">
            {/* Top row: Branding */}
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white drop-shadow-sm flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2h4" />
                <path d="M10 2v4l-2 3v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2" />
                <path d="M9 13h6" />
              </svg>
              <span className="text-sm font-bold tracking-wider text-white drop-shadow-sm">
                Bottling Plant
              </span>
            </div>

            {/* Bottom row: Main Page Title with optional icon & subtitle */}
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-2xl lg:text-[28px] font-bold text-white tracking-tight leading-tight drop-shadow-md">
                {currentPage}
              </h1>
              {normalizedPath === '/dashboard/users' && (
                <span className="w-6 h-6 rounded-lg bg-[rgba(83,211,226,0.18)] border border-[rgba(83,211,226,0.35)] flex items-center justify-center text-[#53D3E2] shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            {pageSubtitles[normalizedPath] && (
              <p className="text-[11px] text-[#9EB3C9] font-medium tracking-wide -mt-0.5">
                {pageSubtitles[normalizedPath]}
              </p>
            )}
          </div>

          {/* ── CENTER: Central Circled Menu Navigation Icons (Apple macOS Dock Magnification at z-50 foreground) ── */}
          <div
            style={{ transform: 'translate(-50%, -50%) translateZ(0)' }}
            className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 z-50 pointer-events-auto overflow-visible isolate"
          >
            <MacDockNav
              items={navItems.filter((item) => !item.adminOnly || canManageUsers)}
            />
          </div>

          {/* ── RIGHT: Top-Right Controls (Two-Row Aligned Layout) ── */}
          <div className="flex flex-col items-end gap-1.5 ml-auto flex-shrink-0">
            {/* Upper Row: Page-Specific Status Dropdown (left of search), Search Bar, Settings, Notifications */}
            <div className="flex items-center gap-2">
              {/* Page-Specific Dropdown immediately to the left of the search bar */}
              {statusDropdown && (
                <div className="relative animate-fade-in">
                  <CustomGlassDropdown
                    value={statusDropdown.value}
                    onChange={statusDropdown.onChange}
                    options={statusDropdown.options}
                    size="sm"
                  />
                </div>
              )}

              {/* 1. Global Search bar with search icon */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search page..."
                  className={`w-[176px] h-[34px] pl-3.5 pr-8 text-xs rounded-full bg-[rgba(55,75,96,0.42)] backdrop-blur-md border transition-all duration-200 outline-none text-white placeholder-[#94a3b8] ${
                    searchFocused
                      ? 'border-[rgba(255,255,255,0.4)] bg-[rgba(68,90,114,0.52)] shadow-[0_0_15px_rgba(255,255,255,0.12)]'
                      : 'border-[rgba(210,226,240,0.20)] hover:border-[rgba(255,255,255,0.32)]'
                  }`}
                />
                <Search className="w-3.5 h-3.5 text-[#cbd5e1] absolute right-3 pointer-events-none" />
              </div>

              {/* 2. Settings gear icon */}
              <div ref={settingsRef} className="relative">
                <button
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border border-[rgba(210,226,240,0.22)] text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Plant Settings"
                >
                  <Settings className="w-4 h-4 text-white" />
                </button>

                {settingsOpen && (
                  <div className="absolute top-10 right-0 w-52 rounded-2xl glass-panel border border-[rgba(225,240,255,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_12px_36px_rgba(10,24,38,0.30)] backdrop-blur-2xl p-3.5 z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 text-xs">
                    <span className="font-semibold text-white pb-1.5 border-b border-[rgba(255,255,255,0.12)]">
                      Plant Configuration
                    </span>
                    <div className="flex justify-between items-center text-[#cbd5e1] py-0.5">
                      <span>System Telemetry</span>
                      <span className="font-mono text-[#6BDE8B] text-[11px]">Online</span>
                    </div>
                    <div className="flex justify-between items-center text-[#cbd5e1] py-0.5">
                      <span>SCADA Sync</span>
                      <span className="font-mono text-[#6BDE8B] text-[11px]">Active (4s)</span>
                    </div>
                    <div className="flex justify-between items-center text-[#cbd5e1] py-0.5">
                      <span>Standard Pack</span>
                      <span className="font-mono text-[#E7DF55] text-[11px]">3 Bottles/Box</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Notification bell icon with Interactive Dropdown Center */}
              <div ref={notificationsRef} className="relative">
                <button
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={`w-[34px] h-[34px] rounded-full flex items-center justify-center border text-white backdrop-blur-md transition-all cursor-pointer shadow-sm relative active:scale-95 ${
                    notificationsOpen
                      ? 'bg-[rgba(83,211,226,0.30)] border-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.4)] text-[#53D3E2]'
                      : 'bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border-[rgba(210,226,240,0.22)]'
                  }`}
                  title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                  aria-label="View important notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#53D3E2] text-[#0A1420] text-[9px] font-black flex items-center justify-center shadow-[0_0_8px_rgba(83,211,226,0.8)] border border-[#14202E]">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Panel (Light Glass Card like other cards) */}
                {notificationsOpen && (
                  <div className="absolute top-11 right-0 w-80 sm:w-96 rounded-[24px] glass-panel border border-[rgba(225,240,255,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_40px_rgba(10,24,38,0.32)] backdrop-blur-2xl p-0 z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs text-white">
                    {/* Header */}
                    <div className="p-3 px-4 flex items-center justify-between border-b border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">Notifications</span>
                        {unreadCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-[#53D3E2]/25 text-[#53D3E2] text-[10px] font-bold border border-[#53D3E2]/40 shadow-sm">
                            {unreadCount} new
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#cbd5e1]">All caught up</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] text-[#53D3E2] hover:text-white hover:underline cursor-pointer transition-colors"
                          >
                            Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAll}
                            className="text-[11px] text-[#cbd5e1] hover:text-white cursor-pointer transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[360px] overflow-y-auto divide-y divide-[rgba(255,255,255,0.08)]">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center text-[#cbd5e1]">
                          <Bell className="w-8 h-8 text-white/40 mb-2" />
                          <p className="text-xs font-semibold text-white">No Notifications</p>
                          <p className="text-[11px] text-[#cbd5e1] mt-0.5">Important alerts and security updates will appear here.</p>
                        </div>
                      ) : (
                        notifications.map((n) => {
                          let icon = <Info className="w-4 h-4 text-[#53D3E2]" />;
                          if (n.type === 'security') icon = <ShieldCheck className="w-4 h-4 text-amber-400" />;
                          else if (n.type === 'success') icon = <CheckCircle2 className="w-4 h-4 text-[#6BDE8B]" />;
                          else if (n.type === 'alert') icon = <AlertCircle className="w-4 h-4 text-rose-400" />;

                          return (
                            <div
                              key={n.id}
                              onClick={() => markAsRead(n.id)}
                              className={`p-3 px-4 flex items-start gap-3 transition-colors cursor-pointer group ${
                                n.read
                                  ? 'bg-transparent hover:bg-white/[0.08]'
                                  : 'bg-[rgba(83,211,226,0.12)] hover:bg-[rgba(83,211,226,0.18)]'
                              }`}
                            >
                              <div className="mt-0.5 flex-shrink-0">
                                {icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className={`text-xs font-semibold truncate ${n.read ? 'text-white/80' : 'text-white'}`}>
                                    {n.title}
                                  </span>
                                  <span className="text-[10px] text-[#cbd5e1] flex-shrink-0">{n.timestamp}</span>
                                </div>
                                <p className="text-[11px] text-[#cbd5e1] leading-relaxed break-words">{n.message}</p>
                              </div>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-[#53D3E2] mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(83,211,226,0.8)]" />
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNotification(n.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-[#cbd5e1] hover:text-white transition-opacity ml-1 flex-shrink-0 cursor-pointer"
                                title="Dismiss"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Fullscreen Mode Action Icon */}
              <FullscreenButton variant="glass-header" />
            </div>

            {/* Lower Row: New Batch, Download, Refresh, Account */}
            <div className="flex items-center gap-2">
              {/* 1. New Batch button (Available to Owner, Super Admin, Manager per permissions matrix) */}
              {canCreateBatch && (
                <button
                  onClick={() => setIsNewBatchOpen(true)}
                  className="w-[134px] h-[34px] flex items-center justify-center gap-1.5 px-3 rounded-full bg-[rgba(58,78,100,0.55)] hover:bg-[rgba(68,90,114,0.70)] text-white text-xs font-semibold border border-[rgba(210,226,240,0.28)] backdrop-blur-md shadow-sm transition-all duration-200 cursor-pointer active:scale-95 whitespace-nowrap"
                  title="Create New Production Batch"
                >
                  <Plus className="w-3.5 h-3.5 text-[#53D3E2]" />
                  <span>New Batch</span>
                </button>
              )}

              {/* 2. Download action icon (Operates on active page) */}
              <button
                onClick={triggerDownload}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border border-[rgba(210,226,240,0.22)] text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
                title="Download / Export Active Page Data"
              >
                <Download className="w-4 h-4 text-white" />
              </button>

              {/* 3. Refresh action icon (Replacing sliders/filter per Section 1) */}
              <button
                onClick={handleGlobalRefresh}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border border-[rgba(210,226,240,0.22)] text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
                title="Refresh Active Page Data"
              >
                <RotateCw className={`w-4 h-4 text-white ${isRefreshing || refreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* 4. Account / Profile icon (Direct Navigation to /profile) */}
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `w-[34px] h-[34px] rounded-full flex items-center justify-center border text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95 text-xs font-semibold relative ${
                    isActive || normalizedPath === '/profile' || normalizedPath === '/dashboard/profile'
                      ? 'bg-[rgba(83,211,226,0.32)] border-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.4)] text-[#53D3E2]'
                      : 'bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border-[rgba(210,226,240,0.22)]'
                  }`
                }
                title={user?.full_name ? `My Profile (${user.full_name})` : 'My Profile'}
                aria-label="My Profile"
              >
                {user?.avatar_url || user?.avatar ? (
                  <img
                    src={user.avatar_url || user.avatar || ''}
                    alt={user?.full_name || 'My Profile'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : user?.full_name ? (
                  user.full_name.charAt(0).toUpperCase()
                ) : (
                  <UserIcon className="w-4 h-4 text-white" />
                )}
                {isOwner && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#eab308] border border-[#14202E]" title="Protected Owner" />
                )}
              </NavLink>

            </div>
          </div>
        </header>

        {/* ═══════════════════════ MAIN VIEWPORT ═══════════════════════ */}
        <main className="w-full flex-1 relative z-10 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
          <Outlet context={{ searchTerm }} />
        </main>
      </div>

      {/* New Batch Modal */}
      <NewBatchModal
        isOpen={isNewBatchOpen}
        onClose={() => setIsNewBatchOpen(false)}
        onSuccess={handleGlobalRefresh}
      />

      {/* Global Floating AI Assistant & Slide-Over Glass Drawer */}
      <GlobalAiAssistant />
    </div>
  );
};
