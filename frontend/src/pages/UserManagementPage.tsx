import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Edit3,
  Trash2,
  Search,
  Lock,
  Crown,
  Check,
  X,
  AlertCircle,
  RotateCw,
  FileText,
  Clock,
  Sparkles,
  Eye,
  EyeOff,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import {
  api,
  User,
  UserRole,
  UserSummary,
  AuditLogItem,
} from '../services/api';
import { GlassCard } from '../components/common/GlassCard';
import { LoadingState } from '../components/common/LoadingState';
import { CustomGlassDropdown } from '../components/common/CustomGlassDropdown';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { useToolbar } from '../context/ToolbarContext';
import { useAuth } from '../context/AuthContext';

// Color and styling helpers for roles
const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string;
    badgeClass: string;
    ringClass: string;
    avatarBg: string;
    icon: React.ReactNode;
    desc: string;
  }
> = {
  owner: {
    label: 'Owner',
    badgeClass:
      'bg-amber-400/15 text-amber-300 border-amber-400/35 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
    ringClass: 'ring-amber-400/50',
    avatarBg: 'bg-gradient-to-br from-amber-500/30 to-yellow-600/20 text-amber-300',
    icon: <Crown className="w-3 h-3 text-amber-400 fill-amber-400/40" />,
    desc: 'Highest protection, unrestricted administrative authority',
  },
  super_admin: {
    label: 'Super Admin',
    badgeClass:
      'bg-purple-500/15 text-purple-300 border-purple-500/35 shadow-[0_0_10px_rgba(168,85,247,0.18)]',
    ringClass: 'ring-purple-400/50',
    avatarBg: 'bg-gradient-to-br from-purple-500/30 to-violet-600/20 text-purple-300',
    icon: <ShieldAlert className="w-3 h-3 text-purple-400" />,
    desc: 'Full administrative access, cannot modify Owner',
  },
  manager: {
    label: 'Manager',
    badgeClass:
      'bg-blue-500/15 text-blue-300 border-blue-500/35 shadow-[0_0_10px_rgba(59,130,246,0.18)]',
    ringClass: 'ring-blue-400/50',
    avatarBg: 'bg-gradient-to-br from-blue-500/30 to-indigo-600/20 text-blue-300',
    icon: <ShieldCheck className="w-3 h-3 text-blue-400" />,
    desc: 'Batch scheduling & operational workflows',
  },
  supervisor: {
    label: 'Supervisor',
    badgeClass:
      'bg-teal-500/15 text-teal-300 border-teal-500/35 shadow-[0_0_10px_rgba(20,184,166,0.18)]',
    ringClass: 'ring-teal-400/50',
    avatarBg: 'bg-gradient-to-br from-teal-500/30 to-emerald-600/20 text-teal-300',
    icon: <Shield className="w-3 h-3 text-teal-400" />,
    desc: 'Live production monitoring & batch execution',
  },
  operator: {
    label: 'Operator',
    badgeClass:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_10px_rgba(34,197,94,0.18)]',
    ringClass: 'ring-emerald-400/50',
    avatarBg: 'bg-gradient-to-br from-emerald-500/30 to-green-600/20 text-emerald-300',
    icon: <Users className="w-3 h-3 text-emerald-400" />,
    desc: 'Routine production operations & line telemetry',
  },
  analyst: {
    label: 'Analyst',
    badgeClass:
      'bg-cyan-500/15 text-cyan-300 border-cyan-500/35 shadow-[0_0_10px_rgba(6,182,212,0.18)]',
    ringClass: 'ring-cyan-400/50',
    avatarBg: 'bg-gradient-to-br from-cyan-500/30 to-sky-600/20 text-cyan-300',
    icon: <Sparkles className="w-3 h-3 text-cyan-400" />,
    desc: 'Default role, read-only analytics & AI queries',
  },
};

export const UserManagementPage: React.FC = () => {
  const { user: currentUser, isOwner } = useAuth();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<UserSummary>({
    total_users: 0,
    active_users: 0,
    inactive_users: 0,
    online_users: 0,
    by_role: {
      owner: 0,
      super_admin: 0,
      analyst: 0,
      manager: 0,
      supervisor: 0,
      operator: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Filters
  const [localSearch, setLocalSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'analyst' as UserRole,
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { searchTerm, registerRefreshHandler } = useToolbar();

  // Load users directory
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getUsers({
        search: localSearch || searchTerm || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      if (res.success) {
        setUsers(res.users || []);
        if (res.summary) setSummary(res.summary);
      } else {
        setErrorMessage(res.message || 'Failed to retrieve users');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with User Management API');
    } finally {
      setLoading(false);
    }
  }, [localSearch, searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Periodic tick (10s) to keep relative time strings ("Last seen 2 min ago") live without page refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Background status polling (30s) so online changes reflect seamlessly
  useEffect(() => {
    const pollInterval = setInterval(() => {
      api.getUsers({
        search: localSearch || searchTerm || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      }).then((res) => {
        if (res.success) {
          setUsers(res.users || []);
          if (res.summary) setSummary(res.summary);
        }
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [localSearch, searchTerm, roleFilter, statusFilter]);

  // Hook into toolbar refresh
  useEffect(() => {
    registerRefreshHandler(loadUsers);
    return () => registerRefreshHandler(null);
  }, [loadUsers, registerRefreshHandler]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Load audit logs
  const openAuditLogs = async () => {
    setIsAuditModalOpen(true);
    setAuditLoading(true);
    try {
      const res = await api.getUserAuditLogs(100);
      if (res.success) {
        setAuditLogs(res.logs || []);
      }
    } catch (e: any) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setAuditLoading(false);
    }
  };

  // Filtered in-memory users
  const displayedUsers = useMemo(() => {
    const q = (localSearch || searchTerm || '').trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q);
      const matchesRole = !roleFilter || u.role === roleFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' && u.is_active) ||
        (statusFilter === 'inactive' && !u.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, localSearch, searchTerm, roleFilter, statusFilter]);

  // Handle Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.full_name.trim() || !formData.email.trim() || !formData.password.trim()) {
      setFormError('All fields are required.');
      return;
    }
    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await api.createUser({
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        is_active: formData.is_active,
      });

      if (res.success) {
        setIsCreateOpen(false);
        setSuccessMessage(`User "${res.user?.full_name || 'Account'}" created successfully.`);
        setFormData({
          full_name: '',
          email: '',
          password: '',
          role: 'analyst',
          is_active: true,
        });
        setShowPassword(false);
        await loadUsers();
      } else {
        setFormError(res.message || 'Failed to create user.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while creating user.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserTarget) return;
    setFormError(null);

    setFormSubmitting(true);
    try {
      const payload: any = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
      };

      // Only send role if changed and target is not owner
      if (!editUserTarget.is_owner && formData.role !== editUserTarget.role) {
        payload.role = formData.role;
      }
      if (formData.password.trim()) {
        if (formData.password.length < 6) {
          setFormError('Password must be at least 6 characters.');
          setFormSubmitting(false);
          return;
        }
        payload.password = formData.password.trim();
      }

      const res = await api.updateUser(editUserTarget.id, payload);
      if (res.success) {
        setEditUserTarget(null);
        setSuccessMessage(`User "${res.user?.full_name || 'Account'}" updated successfully.`);
        setShowPassword(false);
        await loadUsers();
      } else {
        setFormError(res.message || 'Failed to update user.');
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while updating user.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Status Toggle (Activate / Deactivate)
  const handleStatusConfirm = async () => {
    if (!statusTarget) return;
    setFormSubmitting(true);
    try {
      const newStatus = !statusTarget.is_active;
      const res = await api.setUserStatus(statusTarget.id, newStatus);
      if (res.success) {
        setStatusTarget(null);
        setSuccessMessage(
          `Account for "${statusTarget.full_name}" has been ${newStatus ? 'activated' : 'deactivated'}.`
        );
        await loadUsers();
      } else {
        setErrorMessage(res.message || 'Status update failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error changing status.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Delete
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setFormSubmitting(true);
    try {
      const res = await api.deleteUser(deleteTarget.id);
      if (res.success) {
        setDeleteTarget(null);
        setSuccessMessage(`User "${deleteTarget.full_name}" has been removed.`);
        await loadUsers();
      } else {
        setErrorMessage(res.message || 'Deletion failed.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error deleting user.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Role options eligible to be created or assigned by current user
  const assignableRoles: UserRole[] = isOwner
    ? ['super_admin', 'manager', 'supervisor', 'operator', 'analyst']
    : ['manager', 'supervisor', 'operator', 'analyst'];

  // Format date helper
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Format Online Status / Last Seen relative time
  const formatLastSeen = (
    lastSeenAt?: string | null,
    isOnline?: boolean,
    nowMs: number = Date.now()
  ): {
    status: 'online' | 'recent' | 'offline' | 'never';
    label: string;
  } => {
    if (!lastSeenAt) {
      return { status: 'never', label: 'Never logged in' };
    }
    const then = new Date(lastSeenAt).getTime();
    if (isNaN(then)) {
      return { status: 'never', label: 'Never logged in' };
    }
    const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
    if (isOnline || diffSec < 90) {
      return { status: 'online', label: 'Online' };
    }
    if (diffSec < 60) {
      return { status: 'recent', label: 'Last seen just now' };
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin === 1) {
      return { status: 'recent', label: 'Last seen 1 min ago' };
    }
    if (diffMin < 60) {
      return {
        status: diffMin <= 5 ? 'recent' : 'offline',
        label: `Last seen ${diffMin} min ago`,
      };
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) {
      return { status: 'offline', label: 'Last seen 1 hour ago' };
    }
    if (diffHours < 24) {
      return { status: 'offline', label: `Last seen ${diffHours} hours ago` };
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return { status: 'offline', label: 'Last seen yesterday' };
    }
    if (diffDays < 7) {
      return { status: 'offline', label: `Last seen ${diffDays} days ago` };
    }
    const d = new Date(then);
    return {
      status: 'offline',
      label: `Last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    };
  };

  const activePct =
    summary.total_users > 0
      ? Math.round((summary.active_users / summary.total_users) * 100)
      : 100;

  if (loading && users.length === 0) {
    return (
      <LoadingState
        title="LOADING USER DIRECTORY"
        message="Preparing user directory…"
        error={errorMessage}
        onRetry={loadUsers}
        size="lg"
      />
    );
  }

  return (
    <div className="h-full flex flex-col gap-3.5 select-none overflow-hidden pb-1">
      {/* ── KPI & Summary Row (Exact matching 108px height & visual balance) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 flex-shrink-0">
        {/* Card 1: Total Users */}
        <div className="h-[108px] p-4 rounded-[22px] glass-panel-sm border border-[rgba(210,226,240,0.18)] hover:border-[rgba(210,226,240,0.32)] transition-all duration-200 flex flex-col justify-between hover-lift transform-gpu">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#9EB3C9] uppercase tracking-wider">
              Total Users
            </span>
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[#53D3E2] shadow-sm">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-3xl font-black text-white tracking-tight tabular-nums drop-shadow-sm">
              <AnimatedNumber value={summary.total_users} />
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Verified Accounts
            </span>
          </div>
        </div>

        {/* Card 2: Active Accounts */}
        <div className="h-[108px] p-4 rounded-[22px] glass-panel-sm border border-[rgba(210,226,240,0.18)] hover:border-[rgba(210,226,240,0.32)] transition-all duration-200 flex flex-col justify-between hover-lift transform-gpu">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#9EB3C9] uppercase tracking-wider">
              Active Accounts
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[#4ade80] shadow-sm">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-3xl font-black text-[#4ade80] tracking-tight tabular-nums drop-shadow-sm">
              <AnimatedNumber value={summary.active_users} />
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#4ade80]" />
              {summary.online_users !== undefined && summary.online_users > 0
                ? `${summary.online_users} Online Now`
                : `${activePct}% Enabled`}
            </span>
          </div>
        </div>

        {/* Card 3: Deactivated */}
        <div className="h-[108px] p-4 rounded-[22px] glass-panel-sm border border-[rgba(210,226,240,0.18)] hover:border-[rgba(210,226,240,0.32)] transition-all duration-200 flex flex-col justify-between hover-lift transform-gpu">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#9EB3C9] uppercase tracking-wider">
              Deactivated
            </span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm ${
                summary.inactive_users > 0
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                  : 'bg-slate-500/15 border border-slate-500/30 text-slate-400'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-3xl font-black tracking-tight tabular-nums drop-shadow-sm ${
                summary.inactive_users > 0 ? 'text-rose-400' : 'text-white'
              }`}
            >
              <AnimatedNumber value={summary.inactive_users} />
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-300 border border-slate-500/20">
              {summary.inactive_users > 0 ? 'Access Restricted' : 'Clean Roster'}
            </span>
          </div>
        </div>

        {/* Card 4: Roles Breakdown (Readable chips matching card dimensions) */}
        <div className="h-[108px] p-3.5 rounded-[22px] glass-panel-sm border border-[rgba(210,226,240,0.18)] hover:border-[rgba(210,226,240,0.32)] transition-all duration-200 flex flex-col justify-between hover-lift transform-gpu">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[#9EB3C9] uppercase tracking-wider">
              Roles Breakdown
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 2-row clean role pill breakdown */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            {/* Owner */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.owner > 0
                  ? 'bg-amber-400/15 border-amber-400/30 text-amber-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Owner: Highest protection account"
            >
              <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400/50" />
              <span>{summary.by_role.owner} Owner</span>
            </div>

            {/* Super Admin */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.super_admin > 0
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Super Admin: Full management access"
            >
              <ShieldAlert className="w-2.5 h-2.5 text-purple-400" />
              <span>{summary.by_role.super_admin} Admin</span>
            </div>

            {/* Manager */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.manager > 0
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Manager: Batch scheduling & workflows"
            >
              <ShieldCheck className="w-2.5 h-2.5 text-blue-400" />
              <span>{summary.by_role.manager} Mgr</span>
            </div>

            {/* Supervisor */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.supervisor > 0
                  ? 'bg-teal-500/15 border-teal-500/30 text-teal-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Supervisor: Batch execution & line monitoring"
            >
              <Shield className="w-2.5 h-2.5 text-teal-400" />
              <span>{summary.by_role.supervisor} Sup</span>
            </div>

            {/* Operator */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.operator > 0
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Operator: Line operations & telemetry"
            >
              <Users className="w-2.5 h-2.5 text-emerald-400" />
              <span>{summary.by_role.operator} Op</span>
            </div>

            {/* Analyst */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
                summary.by_role.analyst > 0
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 font-bold'
                  : 'bg-white/5 border-white/5 text-slate-400'
              }`}
              title="Analyst: Default read-only analytics"
            >
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>{summary.by_role.analyst} Analyst</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Banners: Success & Error Notifications ── */}
      {successMessage && (
        <div className="p-2.5 px-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 text-xs flex items-center justify-between flex-shrink-0 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-white/70 hover:text-white text-xs p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-2.5 px-4 rounded-2xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs flex items-center justify-between flex-shrink-0 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-white/70 hover:text-white text-xs p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Main User Accounts Glass Card ── */}
      <GlassCard
        title="User Accounts & Access Control"
        subtitle={`Managing ${displayedUsers.length} of ${users.length} registered accounts in MySQL database`}
        headerAction={
          <div className="flex items-center gap-2.5">
            {/* Audit Logs button */}
            <button
              onClick={openAuditLogs}
              className="h-8 px-3.5 rounded-full bg-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.20)] border border-[rgba(215,235,255,0.28)] text-white text-xs font-semibold backdrop-blur-md transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="View Security & Role Audit Trail"
            >
              <FileText className="w-3.5 h-3.5 text-[#53D3E2]" />
              <span>Audit Logs</span>
            </button>

            {/* Add User button with vibrant cyan/mint gradient */}
            <button
              onClick={() => {
                setFormError(null);
                setFormData({
                  full_name: '',
                  email: '',
                  password: '',
                  role: 'analyst',
                  is_active: true,
                });
                setShowPassword(false);
                setIsCreateOpen(true);
              }}
              className="h-8 px-4 rounded-full bg-gradient-to-r from-[#53D3E2] to-[#2dd4bf] text-[#0f172a] text-xs font-bold shadow-[0_0_16px_rgba(83,211,226,0.3)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Create New User Account"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>
        }
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        {/* ── Unified Search & Filter Toolbar ── */}
        <div className="flex items-center justify-between gap-3 pb-3 mb-2.5 border-b border-[rgba(215,235,255,0.18)] flex-wrap flex-shrink-0">
          {/* Left: Search input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-3.5 h-3.5 text-[rgba(215,235,255,0.7)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full h-8 pl-8 pr-7 text-xs rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(215,235,255,0.22)] focus:border-[#53D3E2] focus:bg-[rgba(255,255,255,0.14)] text-white placeholder-[rgba(215,235,255,0.65)] outline-none transition-all shadow-inner"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right: Role, Status, Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Role Filter */}
            <CustomGlassDropdown
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { label: 'All Roles', value: '' },
                { label: 'Owner', value: 'owner' },
                { label: 'Super Admin', value: 'super_admin' },
                { label: 'Manager', value: 'manager' },
                { label: 'Supervisor', value: 'supervisor' },
                { label: 'Operator', value: 'operator' },
                { label: 'Analyst (Default)', value: 'analyst' },
              ]}
              size="sm"
            />

            {/* Status Filter */}
            <CustomGlassDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: 'All Statuses', value: '' },
                { label: 'Active Only', value: 'active' },
                { label: 'Deactivated Only', value: 'inactive' },
              ]}
              size="sm"
            />

            {/* Refresh button */}
            <button
              onClick={loadUsers}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.09)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.24)] text-white transition-all cursor-pointer shadow-sm active:scale-95"
              title="Refresh User Directory"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Table Container (Light Blue Frosted Glass, Subtle Blur, Soft Separators) ── */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-[rgba(215,235,255,0.22)] bg-[rgba(255,255,255,0.08)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_0_rgba(10,25,50,0.22)]">
          <div className="flex-1 flex flex-col min-h-0 overflow-x-auto hide-scrollbar scrollbar-none">
            <div className="min-w-[860px] flex-1 flex flex-col min-h-0">
              {/* ── Fixed Lite-Color Header (Records NEVER scroll behind this!) ── */}
              <div className="border-b border-[rgba(215,235,255,0.20)] bg-[rgba(195,222,248,0.20)] backdrop-blur-md flex-shrink-0 z-10 shadow-sm">
                <table className="w-full text-left table-fixed border-collapse text-xs">
                  <thead>
                    <tr className="text-[#e8f1fa] font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 w-[28%] min-w-[240px]">User</th>
                      <th className="py-3 px-3.5 w-[15%] min-w-[120px]">Role</th>
                      <th className="py-3 px-3.5 w-[13%] min-w-[105px]">Status</th>
                      <th className="py-3 px-3.5 w-[14%] min-w-[115px] hidden lg:table-cell">Created</th>
                      <th className="py-3 px-3.5 w-[18%] min-w-[160px]">Online Status / Last Seen</th>
                      <th className="py-3 px-4 w-[12%] min-w-[110px] text-right">Actions</th>
                    </tr>
                  </thead>
                </table>
              </div>

              {/* ── Scrollable Body (Starts BELOW header - clipped cleanly when scrolling up!) ── */}
              <div className="flex-1 overflow-y-auto hide-scrollbar scrollbar-none">
                {loading && users.length === 0 ? (
                  <div className="h-48 flex items-center justify-center">
                    <LoadingState message="Loading user directory from database..." size="sm" />
                  </div>
                ) : displayedUsers.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <Users className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
                    <p className="text-sm font-semibold text-white">No matching users found</p>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      Try adjusting your search criteria or role filters.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left table-fixed border-collapse text-xs">
                    <tbody className="divide-y divide-[rgba(215,235,255,0.10)]">
                      {displayedUsers.map((u) => {
                        const roleCfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.analyst;
                        const isCurrentAccount = currentUser?.id === u.id;
                        const isProtectedOwner = Boolean(u.is_owner);

                        return (
                          <tr
                            key={u.id}
                            className="hover:bg-[rgba(255,255,255,0.12)] transition-colors duration-150 group"
                          >
                            {/* 1. User: Avatar, Name, Email, Protected Owner badge, You tag */}
                            <td className="py-3 px-4 w-[28%] min-w-[240px]">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 shadow-sm ${roleCfg.avatarBg} ${roleCfg.ringClass} ring-2 ring-offset-1 ring-offset-[rgba(20,38,62,0.5)]`}
                                >
                                  {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white tracking-wide text-sm truncate drop-shadow-sm">
                                      {u.full_name}
                                    </span>
                                    {isProtectedOwner && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/35 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                                        <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                                        Protected Owner
                                      </span>
                                    )}
                                    {isCurrentAccount && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-[#53D3E2] border border-cyan-500/30">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-[#9EB3C9] font-mono truncate mt-0.5">
                                    {u.email}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* 2. Role Badge */}
                            <td className="py-3 px-3.5 w-[15%] min-w-[120px] whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${roleCfg.badgeClass}`}
                                title={roleCfg.desc}
                              >
                                {roleCfg.icon}
                                <span>{roleCfg.label}</span>
                              </span>
                            </td>

                            {/* 3. Account Status */}
                            <td className="py-3 px-3.5 w-[13%] min-w-[105px] whitespace-nowrap">
                              {u.is_active ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(34,197,94,0.12)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#22c55e]" />
                                  <span>Active</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                  <span>Deactivated</span>
                                </span>
                              )}
                            </td>

                            {/* 4. Created Date */}
                            <td className="py-3 px-3.5 w-[14%] min-w-[115px] text-xs text-[#9EB3C9] whitespace-nowrap hidden lg:table-cell font-medium">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{formatDate(u.created_at)}</span>
                              </div>
                            </td>

                            {/* 5. Online Status / Last Seen */}
                            <td className="py-3 px-3.5 w-[18%] min-w-[160px] text-xs whitespace-nowrap font-medium">
                              {(() => {
                                const presence = formatLastSeen(u.last_seen_at, u.is_online, nowTick);
                                if (presence.status === 'online') {
                                  return (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-[0_0_8px_rgba(34,197,94,0.15)]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#22c55e]" />
                                      <span className="font-semibold text-white">{presence.label}</span>
                                    </div>
                                  );
                                }
                                if (presence.status === 'recent') {
                                  return (
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[#bce7fc]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
                                      <span>{presence.label}</span>
                                    </div>
                                  );
                                }
                                if (presence.status === 'offline') {
                                  return (
                                    <div className="inline-flex items-center gap-1.5 text-[#9EB3C9]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60" />
                                      <span>{presence.label}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="inline-flex items-center gap-1.5 text-slate-400 italic text-[11px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500/40" />
                                    <span>{presence.label}</span>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* 6. Action Buttons */}
                            <td className="py-3 px-4 w-[12%] min-w-[110px] text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Case A: Protected Owner Row */}
                                {isProtectedOwner ? (
                                  isOwner && isCurrentAccount ? (
                                    <button
                                      onClick={() => {
                                        setFormError(null);
                                        setFormData({
                                          full_name: u.full_name,
                                          email: u.email,
                                          password: '',
                                          role: u.role,
                                          is_active: Boolean(u.is_active),
                                        });
                                        setShowPassword(false);
                                        setEditUserTarget(u);
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                                      title="Edit your account credentials"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Edit</span>
                                    </button>
                                  ) : (
                                    <div
                                      className="px-3 py-1.5 rounded-xl bg-amber-400/12 border border-amber-400/25 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-not-allowed shadow-sm select-none"
                                      title="Protected Owner Account — Immune to demotion, deactivation, or deletion."
                                    >
                                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Protected</span>
                                    </div>
                                  )
                                ) : (
                                  /* Case B: Ordinary User Row */
                                  <>
                                    {/* Edit Button */}
                                    <button
                                      onClick={() => {
                                        setFormError(null);
                                        setFormData({
                                          full_name: u.full_name,
                                          email: u.email,
                                          password: '',
                                          role: u.role,
                                          is_active: Boolean(u.is_active),
                                        });
                                        setShowPassword(false);
                                        setEditUserTarget(u);
                                      }}
                                      className="p-1.5 rounded-xl bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.18)] border border-[rgba(215,235,255,0.22)] text-slate-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
                                      title="Edit user details & role"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Activate / Deactivate Toggle */}
                                    <button
                                      onClick={() => setStatusTarget(u)}
                                      disabled={Boolean(isCurrentAccount)}
                                      className={`p-1.5 rounded-xl border transition-all ${
                                        isCurrentAccount
                                          ? 'opacity-30 cursor-not-allowed border-transparent'
                                          : u.is_active
                                          ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-300 hover:text-rose-100 cursor-pointer shadow-sm active:scale-95'
                                          : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35 text-emerald-300 hover:text-emerald-100 cursor-pointer shadow-sm active:scale-95'
                                      }`}
                                      title={
                                        isCurrentAccount
                                          ? 'You cannot deactivate your own account'
                                          : u.is_active
                                          ? 'Deactivate User Account'
                                          : 'Activate User Account'
                                      }
                                    >
                                      {u.is_active ? (
                                        <UserX className="w-3.5 h-3.5" />
                                      ) : (
                                        <UserCheck className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    {/* Delete Button */}
                                    <button
                                      onClick={() => setDeleteTarget(u)}
                                      disabled={Boolean(isCurrentAccount)}
                                      className={`p-1.5 rounded-xl border transition-all ${
                                        isCurrentAccount
                                          ? 'opacity-30 cursor-not-allowed border-transparent'
                                          : 'bg-[rgba(255,255,255,0.08)] hover:bg-rose-500/25 border-[rgba(215,235,255,0.20)] hover:border-rose-500/40 text-slate-300 hover:text-rose-200 cursor-pointer shadow-sm active:scale-95'
                                      }`}
                                      title={
                                        isCurrentAccount
                                          ? 'You cannot delete your own account'
                                          : 'Delete User Account'
                                      }
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
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

          {/* ── Table Footer Summary Bar (Light Translucent Surface) ── */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[rgba(215,235,255,0.18)] bg-[rgba(195,222,248,0.12)] text-[11px] text-[#b6cce2] flex-shrink-0 backdrop-blur-md">
            <span>
              Showing <strong className="text-white font-bold">{displayedUsers.length}</strong> of{' '}
              <strong className="text-white font-bold">{users.length}</strong> registered accounts
            </span>
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-[#9ebad6]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#22c55e]" />
              <span>Role-Based Access Control Active</span>
              <span className="text-slate-400/60">•</span>
              <span>Argon2id Hashes</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ════════════════════════════════════════════════════════════════
          MODAL 1: CREATE NEW USER
          ════════════════════════════════════════════════════════════════ */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-md p-6 rounded-3xl glass-panel-elevated shadow-[0_24px_70px_rgba(0,0,0,0.75)] border border-[rgba(255,255,255,0.18)] max-h-[92vh] overflow-y-auto scrollbar-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[rgba(255,255,255,0.1)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#53D3E2]/25 to-[#2dd4bf]/20 border border-[#53D3E2]/40 flex items-center justify-center text-[#53D3E2] shadow-sm">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Create New Account
                  </h3>
                  <p className="text-[10px] text-[#9EB3C9]">
                    Add a verified user with role-based access permissions
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error in form */}
            {formError && (
              <div className="mt-3.5 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  className="w-full h-9 px-3.5 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] focus:bg-[rgba(255,255,255,0.09)] text-white outline-none transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. jdoe@bottlingplant.local"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full h-9 px-3.5 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] focus:bg-[rgba(255,255,255,0.09)] text-white outline-none transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full h-9 pl-3.5 pr-10 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] focus:bg-[rgba(255,255,255,0.09)] text-white outline-none transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Role Assignment
                </label>
                <CustomGlassDropdown
                  value={formData.role}
                  onChange={(val) =>
                    setFormData({ ...formData, role: val as UserRole })
                  }
                  options={assignableRoles.map((r) => ({
                    value: r,
                    label: `${ROLE_CONFIG[r].label} — ${ROLE_CONFIG[r].desc}`,
                  }))}
                  size="md"
                  className="w-full"
                  menuWidth="w-full min-w-full"
                  align="left"
                />
                <span className="text-[10px] text-[#9EB3C9] mt-1 block">
                  * Protected Owner role cannot be assigned through public dialogs.
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-white font-medium">Initial Account Status</span>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, is_active: !formData.is_active })
                  }
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    formData.is_active
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                  }`}
                >
                  {formData.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-[rgba(255,255,255,0.1)]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#53D3E2] to-[#2dd4bf] text-[#0f172a] text-xs font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 2: EDIT USER
          ════════════════════════════════════════════════════════════════ */}
      {editUserTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-md p-6 rounded-3xl glass-panel-elevated shadow-[0_24px_70px_rgba(0,0,0,0.75)] border border-[rgba(255,255,255,0.18)] max-h-[92vh] overflow-y-auto scrollbar-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[rgba(255,255,255,0.1)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/35 flex items-center justify-center text-[#53D3E2]">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Edit Account — {editUserTarget.full_name}
                  </h3>
                  <p className="text-[10px] text-[#9EB3C9]">
                    Update user credentials and role assignment
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditUserTarget(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error in form */}
            {formError && (
              <div className="mt-3.5 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  className="w-full h-9 px-3.5 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] text-white outline-none transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full h-9 px-3.5 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] text-white outline-none transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Reset Password (Leave blank to keep existing)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter new password (optional)"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full h-9 pl-3.5 pr-10 text-xs rounded-xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.14)] focus:border-[#53D3E2] text-white outline-none transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#cbd5e1] uppercase tracking-wider block mb-1">
                  Role Assignment
                </label>
                {editUserTarget.is_owner ? (
                  <div className="p-2.5 rounded-xl bg-amber-400/15 border border-amber-400/35 text-amber-200 text-xs flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400 fill-amber-400/40 flex-shrink-0" />
                    <span>
                      Protected Owner account. Role cannot be changed or demoted.
                    </span>
                  </div>
                ) : (
                  <CustomGlassDropdown
                    value={formData.role}
                    onChange={(val) =>
                      setFormData({ ...formData, role: val as UserRole })
                    }
                    options={assignableRoles.map((r) => ({
                      value: r,
                      label: `${ROLE_CONFIG[r].label} — ${ROLE_CONFIG[r].desc}`,
                    }))}
                    size="md"
                    className="w-full"
                    menuWidth="w-full min-w-full"
                    align="left"
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-[rgba(255,255,255,0.1)]">
                <button
                  type="button"
                  onClick={() => setEditUserTarget(null)}
                  className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#53D3E2] to-[#2dd4bf] text-[#0f172a] text-xs font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 3: STATUS TOGGLE CONFIRMATION (ACTIVATE / DEACTIVATE)
          ════════════════════════════════════════════════════════════════ */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-sm p-6 rounded-3xl glass-panel-elevated shadow-[0_24px_70px_rgba(0,0,0,0.75)] border border-[rgba(255,255,255,0.18)]">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  statusTarget.is_active
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/35'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35'
                }`}
              >
                {statusTarget.is_active ? (
                  <UserX className="w-5 h-5" />
                ) : (
                  <UserCheck className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {statusTarget.is_active ? 'Deactivate Account?' : 'Activate Account?'}
                </h3>
                <p className="text-[11px] text-[#9EB3C9]">{statusTarget.full_name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              {statusTarget.is_active
                ? `Deactivating will immediately invalidate active login sessions and block "${statusTarget.email}" from signing in.`
                : `Activating will restore login privileges for "${statusTarget.email}".`}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[rgba(255,255,255,0.1)]">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStatusConfirm}
                disabled={formSubmitting}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusTarget.is_active
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
                }`}
              >
                {formSubmitting
                  ? 'Processing...'
                  : statusTarget.is_active
                  ? 'Confirm Deactivation'
                  : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 4: DELETE CONFIRMATION
          ════════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-sm p-6 rounded-3xl glass-panel-elevated shadow-[0_24px_70px_rgba(0,0,0,0.75)] border border-rose-500/35">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/35 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete User Account</h3>
                <p className="text-[11px] text-[#9EB3C9]">{deleteTarget.full_name}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/25 text-rose-200 text-xs mb-3 space-y-1">
              <span className="font-bold block">Security Notice:</span>
              <span>
                Account deactivation is preferred to preserve historical audit logs and
                production records.
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Are you sure you want to permanently delete{' '}
              <span className="text-white font-semibold">{deleteTarget.email}</span>?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[rgba(255,255,255,0.1)]">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={formSubmitting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                {formSubmitting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 5: AUDIT LOGS VIEWER
          ════════════════════════════════════════════════════════════════ */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-3xl p-6 rounded-3xl glass-panel-elevated shadow-[0_24px_70px_rgba(0,0,0,0.75)] border border-[rgba(255,255,255,0.18)] max-h-[88vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[rgba(255,255,255,0.1)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/35 flex items-center justify-center text-purple-300 shadow-sm">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Security & User Audit Trail
                  </h3>
                  <p className="text-[10px] text-[#9EB3C9]">
                    Immutable record of user creation, role changes, and security events
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openAuditLogs}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Refresh Audit Logs"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setIsAuditModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 flex flex-col min-h-0 my-3.5 rounded-2xl border border-[rgba(215,235,255,0.18)] bg-[rgba(16,28,44,0.7)] overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0 overflow-x-auto hide-scrollbar scrollbar-none">
                <div className="min-w-[680px] flex-1 flex flex-col min-h-0">
                  {/* Fixed Lite Header */}
                  <div className="border-b border-[rgba(215,235,255,0.18)] bg-[rgba(195,222,248,0.20)] backdrop-blur-md flex-shrink-0 z-10 shadow-sm">
                    <table className="w-full text-left table-fixed border-collapse text-xs">
                      <thead>
                        <tr className="text-[#e8f1fa] font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-3.5 w-[20%] min-w-[130px]">Timestamp</th>
                          <th className="py-2.5 px-3.5 w-[18%] min-w-[110px]">Actor</th>
                          <th className="py-2.5 px-3 w-[14%] min-w-[90px]">Action</th>
                          <th className="py-2.5 px-3.5 w-[18%] min-w-[110px]">Target</th>
                          <th className="py-2.5 px-3.5 w-[18%] min-w-[110px]">Role Transition</th>
                          <th className="py-2.5 px-3.5 w-[12%] min-w-[80px]">Outcome</th>
                        </tr>
                      </thead>
                    </table>
                  </div>

                  {/* Scrollable Rows (Clipped cleanly at top below header) */}
                  <div className="flex-1 overflow-y-auto hide-scrollbar scrollbar-none">
                    {auditLoading ? (
                      <div className="h-48 flex items-center justify-center">
                        <LoadingState message="Loading audit trail from database..." size="sm" />
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center p-6 text-xs text-slate-400">
                        <Clock className="w-6 h-6 mb-2 opacity-50 text-slate-400" />
                        <span>No audit events recorded yet.</span>
                      </div>
                    ) : (
                      <table className="w-full text-left table-fixed border-collapse text-xs">
                        <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                          {auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-white/5 text-[11px] transition-colors">
                              <td className="py-2.5 px-3.5 w-[20%] min-w-[130px] text-[#9EB3C9] whitespace-nowrap">
                                {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-2.5 px-3.5 w-[18%] min-w-[110px] text-white font-semibold truncate">
                                {log.actor_name || (log.actor_id ? `ID #${log.actor_id}` : 'System / Setup')}
                              </td>
                              <td className="py-2.5 px-3 w-[14%] min-w-[90px]">
                                <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-white font-mono text-[10px]">
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 w-[18%] min-w-[110px] text-slate-300 truncate">
                                {log.target_name || (log.target_id ? `ID #${log.target_id}` : '—')}
                              </td>
                              <td className="py-2.5 px-3.5 w-[18%] min-w-[110px] whitespace-nowrap">
                                {log.previous_role || log.new_role ? (
                                  <span className="font-mono text-[10px] text-[#53D3E2] flex items-center gap-1">
                                    <span>{log.previous_role || 'none'}</span>
                                    <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                                    <span className="font-bold">{log.new_role || 'none'}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 w-[12%] min-w-[80px]">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    log.status === 'success'
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2.5 border-t border-[rgba(255,255,255,0.1)] text-[11px] text-[#9EB3C9] flex-shrink-0">
              <span>Showing last {auditLogs.length} audit trail entries</span>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
