import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  Shield,
  Key,
  Lock,
  Eye,
  EyeOff,
  Bell,
  Volume2,
  VolumeX,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Calendar,
  Sparkles,
  Save,
  RotateCw,
  LogOut,
  Crown,
  Laptop,
  Check,
  ChevronRight,
  ShieldAlert,
  X,
  Camera,
  Upload,
  Trash2,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { GlassCard } from '../components/common/GlassCard';

type TabType = 'overview' | 'personal' | 'security' | 'preferences';

interface NotificationPrefs {
  criticalAlerts: boolean;
  batchCompletion: boolean;
  telemetrySync: boolean;
}

const NOTIF_PREFS_KEY = 'plant_notification_prefs';
const SOUND_PREFS_KEY = 'smart_bottling_sound_effects_enabled';
const DENSITY_PREFS_KEY = 'plant_ui_density';

export const ProfilePage: React.FC = () => {
  const { user, isOwner, logout, updateCurrentUser, refreshUser } = useAuth();
  const toast = useToast();
  const { addNotification } = useNotifications();

  // Inline form error text (only text, no cards)
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Avatar upload state
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Sign out confirmation modal state
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Edit profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullNameInput, setFullNameInput] = useState(user?.full_name || '');
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [profileSaving, setProfileSaving] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Preferences state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SOUND_PREFS_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const [uiDensity, setUiDensity] = useState<'standard' | 'compact'>(() => {
    try {
      return (localStorage.getItem(DENSITY_PREFS_KEY) as 'standard' | 'compact') || 'standard';
    } catch {
      return 'standard';
    }
  });

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    try {
      const stored = localStorage.getItem(NOTIF_PREFS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return {
      criticalAlerts: true,
      batchCompletion: true,
      telemetrySync: false,
    };
  });



  // Sync state if user changes
  const [prevUserId, setPrevUserId] = useState(user?.id);
  if (user && user.id !== prevUserId) {
    setPrevUserId(user.id);
    setFullNameInput(user.full_name || '');
    setEmailInput(user.email || '');
  }

  // Refresh profile on mount for fresh timestamps
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Trigger avatar file selector
  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Process avatar selection with client-side canvas square crop and resize
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image file must be under 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 320;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Square center crop
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

          const dataUrl = canvas.toDataURL('image/webp', 0.88);
          setAvatarPreview(dataUrl);

          setAvatarUploading(true);
          const res = await api.updateAvatar(dataUrl);
          if (res.success && res.user) {
            updateCurrentUser(res.user);
            addNotification({
              title: 'Profile Picture Updated',
              message: 'Your custom profile picture was updated successfully.',
              type: 'success',
              category: 'account',
            });
            toast.success('Profile picture updated');
          } else {
            toast.error(res.message || 'Failed to update profile picture.');
            setAvatarPreview(null);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error uploading profile picture.';
          toast.error(msg);
          setAvatarPreview(null);
        } finally {
          setAvatarUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Remove avatar picture
  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      const res = await api.deleteAvatar();
      if (res.success && res.user) {
        updateCurrentUser(res.user);
        setAvatarPreview(null);
        addNotification({
          title: 'Profile Picture Removed',
          message: 'Profile picture removed. Reverted to letter initial.',
          type: 'info',
          category: 'account',
        });
        toast.info('Profile picture removed');
      } else {
        toast.error(res.message || 'Failed to remove profile picture.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error removing profile picture.';
      toast.error(msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Handle Edit Profile submission
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);

    const trimmedName = fullNameInput.trim();
    const trimmedEmail = emailInput.trim().toLowerCase();

    if (!trimmedName) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setProfileError('Please enter a valid email address.');
      return;
    }

    setProfileSaving(true);
    try {
      const res = await api.updateProfile({
        full_name: trimmedName,
        email: trimmedEmail,
      });

      if (res.success && res.user) {
        updateCurrentUser(res.user, res.token);
        addNotification({
          title: 'Profile Updated',
          message: `Profile details saved for ${trimmedName} (${trimmedEmail}).`,
          type: 'success',
          category: 'account',
        });
        toast.success('Profile details updated');
        setIsEditingProfile(false);
      } else {
        setProfileError(res.message || 'Failed to update profile.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error communicating with profile server.';
      setProfileError(message);
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Cancel Edit Profile
  const handleCancelEdit = () => {
    if (user) {
      setFullNameInput(user.full_name || '');
      setEmailInput(user.email || '');
    }
    setProfileError(null);
    setIsEditingProfile(false);
  };

  // Handle Change Password submission
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password cannot be the same as your current password.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      if (res.success) {
        addNotification({
          title: 'Password Changed',
          message: 'Your account authentication password was successfully updated.',
          type: 'security',
          category: 'security',
        });
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(res.message || 'Failed to change password.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error updating password.';
      setPasswordError(message);
    } finally {
      setPasswordSaving(false);
    }
  };

  // Handle Sound Effects toggle
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_PREFS_KEY, next ? 'true' : 'false');
      window.dispatchEvent(new Event('storage'));
    } catch {
      // ignore
    }
    showSavedNotification();
  };

  // Handle Density change
  const handleDensityChange = (density: 'standard' | 'compact') => {
    setUiDensity(density);
    try {
      localStorage.setItem(DENSITY_PREFS_KEY, density);
    } catch {
      // ignore
    }
    showSavedNotification();
  };

  // Handle Notification toggle
  const handleToggleNotif = (key: keyof NotificationPrefs) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    try {
      localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    showSavedNotification();
  };

  const showSavedNotification = () => {
    toast.info('Preferences saved.');
  };

  // Sign out confirmation execution
  const handleConfirmSignOut = async () => {
    setIsSigningOut(true);
    try {
      await api.logout();
    } catch {
      // ignore
    }
    logout();
  };

  // Role visual configuration
  const roleDisplay: Record<string, { label: string; badgeClass: string; roleDesc: string }> = {
    owner: {
      label: 'OWNER',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
      roleDesc: 'Full executive plant governance, user authorization, and system operations access.',
    },
    super_admin: {
      label: 'SUPER ADMIN',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(83,211,226,0.25)]',
      roleDesc: 'Plant administration, account management, and high-privilege configuration.',
    },
    manager: {
      label: 'MANAGER',
      badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      roleDesc: 'Production lifecycle scheduling, target volume planning, and batch execution.',
    },
    supervisor: {
      label: 'SUPERVISOR',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      roleDesc: 'Production wave monitoring, QA verification, and sensor threshold inspection.',
    },
    operator: {
      label: 'OPERATOR',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      roleDesc: 'Line machinery monitoring, bottle telemetry observation, and batch packaging.',
    },
    analyst: {
      label: 'ANALYST',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      roleDesc: 'Read-only statistical telemetry insights, report analysis, and yield audit.',
    },
  };

  const userRoleKey = (user?.role || 'analyst').toLowerCase();
  const currentRoleConfig = roleDisplay[userRoleKey] || roleDisplay['analyst'];

  // Formatted date helpers
  const formatJoinedDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Active Member';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Active Member';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Active Member';
    }
  };

  const userInitial = user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'P';

  return (
    <div className="h-full w-full flex flex-col gap-3 select-none overflow-hidden" style={{ minHeight: 0 }}>
      {/* ═══════════════════════════════════════════════════════════════════════════
          CLEAN TOP ACTION BAR (No Duplicate Title)
      ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between pb-1 flex-shrink-0">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-[#9EB3C9] font-medium">
          <NavLink to="/dashboard" className="hover:text-[#53D3E2] transition-colors flex items-center gap-1">
            <span>Dashboard</span>
          </NavLink>
          <span className="text-[#64748b]">/</span>
          <span className="text-white font-semibold">Profile & Account</span>
        </div>

        {/* Right Actions: Back to Dashboard & Live Status */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(107,222,139,0.12)] border border-[rgba(107,222,139,0.30)] text-[#6BDE8B] text-xs font-semibold backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#6BDE8B] animate-pulse" />
            <span>Active Operator</span>
          </div>

          <NavLink
            to="/dashboard"
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[rgba(55,75,96,0.50)] hover:bg-[rgba(68,90,114,0.75)] border border-[rgba(210,226,240,0.25)] text-white text-xs font-semibold backdrop-blur-md transition-all shadow-sm active:scale-95 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#53D3E2] group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Dashboard</span>
          </NavLink>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          BALANCED MASTER-DETAIL GRID (Left: Profile & Nav, Right: Tab Content)
      ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1 min-h-0 overflow-hidden pb-1">
        {/* ── LEFT COLUMN: Profile Identity Card + Sidebar Navigation (4 cols) ── */}
        <div className="lg:col-span-4 flex flex-col gap-3 h-full overflow-y-auto pr-1">
          {/* Identity Card */}
          <GlassCard className="p-5 flex flex-col items-center text-center relative overflow-hidden flex-shrink-0">
            {/* Ambient Background Aura */}
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-[#53D3E2]/15 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-[#3B82F6]/15 blur-2xl pointer-events-none" />

            {/* Avatar with Interactive Upload */}
            <div className="relative w-20 h-20 mb-2 group flex-shrink-0 mx-auto">
              <div
                onClick={handleTriggerFileInput}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E3046] to-[#0A1420] border-2 border-[rgba(83,211,226,0.5)] flex items-center justify-center text-white text-3xl font-black shadow-[0_0_24px_rgba(83,211,226,0.30)] select-none overflow-hidden relative cursor-pointer"
                title="Click to upload profile picture"
              >
                {avatarPreview || user?.avatar_url || user?.avatar ? (
                  <img
                    src={avatarPreview || user?.avatar_url || user?.avatar || ''}
                    alt={user?.full_name || 'Profile'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{userInitial}</span>
                )}

                {/* Subtle Hover Action Overlay */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                  <Camera className="w-5 h-5 text-[#53D3E2] mb-0.5" />
                  <span className="text-[9px] font-semibold tracking-wide">Change</span>
                </div>

                {/* Uploading Spinner */}
                {avatarUploading && (
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center">
                    <RotateCw className="w-6 h-6 text-[#53D3E2] animate-spin" />
                  </div>
                )}
              </div>

              {/* Camera Action Badge */}
              <button
                type="button"
                onClick={handleTriggerFileInput}
                disabled={avatarUploading}
                className="absolute -bottom-1 -left-1 p-1.5 rounded-full bg-[#14202E] hover:bg-[#53D3E2] hover:text-[#0A1420] text-[#53D3E2] border border-[rgba(83,211,226,0.45)] shadow-md transition-all cursor-pointer active:scale-90"
                title="Upload Profile Picture"
                aria-label="Upload Profile Picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>

              {isOwner && (
                <div
                  className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-[#EAB308] border-2 border-[#14202E] flex items-center justify-center text-[#14202E] shadow-md pointer-events-none"
                  title="Plant Owner"
                >
                  <Crown className="w-3.5 h-3.5 fill-current" />
                </div>
              )}
              <span
                className="absolute bottom-0.5 right-0.5 z-10 w-4 h-4 rounded-full bg-[#6BDE8B] border-2 border-[#14202E] shadow-sm pointer-events-none"
                title="Active Operator Online"
              />

              {/* Hidden File Picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
            </div>

            {/* Avatar Pill Actions */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={handleTriggerFileInput}
                disabled={avatarUploading}
                className="px-2.5 py-0.5 rounded-full bg-[rgba(83,211,226,0.12)] hover:bg-[rgba(83,211,226,0.24)] border border-[rgba(83,211,226,0.30)] text-[#53D3E2] text-[10px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>{user?.avatar_url || user?.avatar ? 'Change Photo' : 'Upload Photo'}</span>
              </button>
              {(user?.avatar_url || user?.avatar) && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarUploading}
                  className="px-2 py-0.5 rounded-full bg-[rgba(244,63,94,0.12)] hover:bg-[rgba(244,63,94,0.24)] border border-[rgba(244,63,94,0.30)] text-rose-300 text-[10px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                  title="Remove custom picture"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            {/* Name & Role */}
            <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
              {user?.full_name || 'Plant Operator'}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${currentRoleConfig.badgeClass}`}>
                {currentRoleConfig.label}
              </span>
              {isOwner && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Root Owner
                </span>
              )}
            </div>

            {/* Email & Details */}
            <p className="text-xs text-[#9EB3C9] flex items-center gap-1.5 mt-2 truncate max-w-full">
              <Mail className="w-3.5 h-3.5 text-[#53D3E2] flex-shrink-0" />
              <span className="truncate">{user?.email || 'operator@bottlingplant.local'}</span>
            </p>

            <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[rgba(255,255,255,0.08)] text-[11px]">
              <div className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.10)]">
                <span className="text-[#9EB3C9] block text-[10px]">Account ID</span>
                <span className="font-mono text-[#53D3E2] font-semibold">#{String(user?.id || 1).padStart(4, '0')}</span>
              </div>
              <div className="p-2 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.10)]">
                <span className="text-[#9EB3C9] block text-[10px]">Registered</span>
                <span className="text-white font-semibold">{formatJoinedDate(user?.created_at)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex items-center gap-2 mt-3.5">
              <button
                onClick={() => {
                  setActiveTab('personal');
                  setIsEditingProfile(true);
                }}
                className="flex-1 py-1.5 px-3 rounded-xl bg-[rgba(83,211,226,0.18)] hover:bg-[rgba(83,211,226,0.28)] border border-[rgba(83,211,226,0.38)] text-[#53D3E2] text-xs font-semibold backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className="flex-1 py-1.5 px-3 rounded-xl bg-[rgba(55,75,96,0.45)] hover:bg-[rgba(68,90,114,0.65)] border border-[rgba(210,226,240,0.22)] text-white text-xs font-semibold backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Key className="w-3.5 h-3.5 text-[#9EB3C9]" />
                <span>Password</span>
              </button>
            </div>
          </GlassCard>

          {/* Sidebar Tab Navigation */}
          <GlassCard className="p-2 flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-[rgba(83,211,226,0.20)] text-[#53D3E2] border border-[#53D3E2]/40 shadow-[0_0_12px_rgba(83,211,226,0.18)]'
                  : 'text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.06)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeTab === 'overview' ? 'bg-[#53D3E2]/30 text-[#53D3E2]' : 'bg-[rgba(255,255,255,0.08)] text-[#9EB3C9]'}`}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Overview</span>
                  <span className="block text-[10px] text-[#9EB3C9] font-normal">Permissions & metrics</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('personal')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'personal'
                  ? 'bg-[rgba(83,211,226,0.20)] text-[#53D3E2] border border-[#53D3E2]/40 shadow-[0_0_12px_rgba(83,211,226,0.18)]'
                  : 'text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.06)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeTab === 'personal' ? 'bg-[#53D3E2]/30 text-[#53D3E2]' : 'bg-[rgba(255,255,255,0.08)] text-[#9EB3C9]'}`}>
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Personal Information</span>
                  <span className="block text-[10px] text-[#9EB3C9] font-normal">Name, email & identity</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-[rgba(83,211,226,0.20)] text-[#53D3E2] border border-[#53D3E2]/40 shadow-[0_0_12px_rgba(83,211,226,0.18)]'
                  : 'text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.06)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeTab === 'security' ? 'bg-[#53D3E2]/30 text-[#53D3E2]' : 'bg-[rgba(255,255,255,0.08)] text-[#9EB3C9]'}`}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Security & Access</span>
                  <span className="block text-[10px] text-[#9EB3C9] font-normal">Password & sessions</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('preferences')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-[rgba(83,211,226,0.20)] text-[#53D3E2] border border-[#53D3E2]/40 shadow-[0_0_12px_rgba(83,211,226,0.18)]'
                  : 'text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.06)] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeTab === 'preferences' ? 'bg-[#53D3E2]/30 text-[#53D3E2]' : 'bg-[rgba(255,255,255,0.08)] text-[#9EB3C9]'}`}>
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">Preferences</span>
                  <span className="block text-[10px] text-[#9EB3C9] font-normal">Audio, theme & alerts</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-60" />
            </button>
          </GlassCard>

          {/* Session Sign Out Action with Confirmation Trigger */}
          <div className="mt-auto pt-1">
            <button
              onClick={() => setShowSignOutModal(true)}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 hover:text-white text-xs font-semibold backdrop-blur-md transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2 active:scale-95 group"
            >
              <LogOut className="w-4 h-4 text-rose-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Sign Out of Console...</span>
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Detailed Tab Content Panel (8 cols) ── */}
        <div className="lg:col-span-8 flex flex-col gap-3 h-full overflow-y-auto pr-1">
          {/* ═════════ TAB 1: OVERVIEW ═════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-3.5">
              {/* Account Details 4-Card Summary */}
              <GlassCard className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-[#53D3E2]" />
                    <span>Identity Overview</span>
                  </span>
                  <span className="text-[11px] text-[#6BDE8B] font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#6BDE8B] animate-pulse" />
                    Online
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Full Name</span>
                    <span className="font-semibold text-white text-sm mt-0.5 block truncate">
                      {user?.full_name || 'Plant Operator'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Primary Email</span>
                    <span className="font-semibold text-white text-sm mt-0.5 block truncate">
                      {user?.email || 'operator@bottlingplant.local'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Role Authority</span>
                    <span className="font-semibold text-[#53D3E2] text-sm mt-0.5 block uppercase tracking-wide">
                      {currentRoleConfig.label}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Account Status</span>
                    <span className="font-semibold text-[#6BDE8B] text-sm mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#6BDE8B]" />
                      <span>Active & Verified</span>
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* Plant Governance & RBAC Privileges Matrix */}
              <GlassCard className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#6BDE8B]" />
                    <span>Plant Governance & RBAC Privileges</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#53D3E2]">
                    Level: {currentRoleConfig.label}
                  </span>
                </div>

                <p className="text-xs text-[#9EB3C9] leading-relaxed">
                  {currentRoleConfig.roleDesc}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)] text-xs">
                    <span className="text-white">SCADA Telemetry View</span>
                    <span className="flex items-center gap-1 text-[#6BDE8B] font-semibold text-[11px]">
                      <Check className="w-3.5 h-3.5" /> Granted
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)] text-xs">
                    <span className="text-white">Production Reports Export</span>
                    <span className="flex items-center gap-1 text-[#6BDE8B] font-semibold text-[11px]">
                      <Check className="w-3.5 h-3.5" /> Granted
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)] text-xs">
                    <span className="text-white">Batch Scheduling & Lifecycle</span>
                    <span className={`flex items-center gap-1 font-semibold text-[11px] ${
                      isOwner || ['super_admin', 'manager'].includes(userRoleKey)
                        ? 'text-[#6BDE8B]'
                        : 'text-[#64748b]'
                    }`}>
                      {isOwner || ['super_admin', 'manager'].includes(userRoleKey) ? (
                        <><Check className="w-3.5 h-3.5" /> Granted</>
                      ) : (
                        'Restricted'
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)] text-xs">
                    <span className="text-white">User & Role Administration</span>
                    <span className={`flex items-center gap-1 font-semibold text-[11px] ${
                      isOwner || userRoleKey === 'super_admin' ? 'text-[#6BDE8B]' : 'text-[#64748b]'
                    }`}>
                      {isOwner || userRoleKey === 'super_admin' ? (
                        <><Check className="w-3.5 h-3.5" /> Granted</>
                      ) : (
                        'Restricted'
                      )}
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* Security Snapshot Card */}
              <GlassCard className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#cbd5e1] flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#53D3E2]" />
                    <span>Security & Protocol Posture</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#6BDE8B]">
                    Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Cryptographic Key Derivation</span>
                    <span className="font-semibold text-white block mt-0.5">RFC 9106 Argon2id</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                    <span className="text-[#9EB3C9] text-[11px] block">Session Token Standard</span>
                    <span className="font-mono text-[#53D3E2] font-semibold block mt-0.5">JWT HS256 Bearer</span>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}

          {/* ═════════ TAB 2: PERSONAL INFORMATION ═════════ */}
          {activeTab === 'personal' && (
            <GlassCard className="p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-[#53D3E2]" />
                    <span>Personal Profile Details</span>
                  </h4>
                  <p className="text-xs text-[#9EB3C9] mt-0.5">
                    Update your operator name and registered contact email
                  </p>
                </div>

                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="px-3 py-1.5 rounded-full bg-[rgba(83,211,226,0.18)] hover:bg-[rgba(83,211,226,0.28)] border border-[rgba(83,211,226,0.38)] text-[#53D3E2] text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    Edit Details
                  </button>
                )}
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {/* Full Name Input */}
                  <div>
                    <label className="block text-xs font-semibold text-[#cbd5e1] mb-1.5">
                      Full Name <span className="text-[#53D3E2]">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <UserIcon className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
                      <input
                        type="text"
                        value={fullNameInput}
                        onChange={(e) => { setFullNameInput(e.target.value); setProfileError(null); }}
                        placeholder="e.g. Pramod Behera"
                        className="w-full h-10 pl-10 pr-4 text-xs rounded-xl bg-[rgba(26,42,62,0.8)] border border-[rgba(210,226,240,0.25)] focus:border-[#53D3E2] text-white placeholder-[#64748b] outline-none transition-all shadow-inner"
                        disabled={profileSaving}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Email Input */}
                  <div>
                    <label className="block text-xs font-semibold text-[#cbd5e1] mb-1.5">
                      Email Address <span className="text-[#53D3E2]">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => { setEmailInput(e.target.value); setProfileError(null); }}
                        placeholder="e.g. operator@bottlingplant.local"
                        className="w-full h-10 pl-10 pr-4 text-xs rounded-xl bg-[rgba(26,42,62,0.8)] border border-[rgba(210,226,240,0.25)] focus:border-[#53D3E2] text-white placeholder-[#64748b] outline-none transition-all shadow-inner"
                        disabled={profileSaving}
                      />
                    </div>
                  </div>

                  {/* Role Notice */}
                  <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)] flex items-start gap-3">
                    <Shield className="w-4 h-4 text-[#53D3E2] flex-shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-semibold text-white block">Assigned Role: {currentRoleConfig.label}</span>
                      <p className="text-[#9EB3C9] text-[11px] mt-0.5">
                        Roles are governed by plant administrators and cannot be modified through personal profile settings.
                      </p>
                    </div>
                  </div>

                  {/* Inline Error Text (only text, no cards) */}
                  {profileError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{profileError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[rgba(255,255,255,0.08)]">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={profileSaving}
                      className="px-4 py-2 rounded-xl bg-[rgba(55,75,96,0.45)] hover:bg-[rgba(68,90,114,0.65)] border border-[rgba(210,226,240,0.22)] text-white text-xs font-semibold transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#53D3E2] to-[#2563EB] hover:brightness-110 text-white text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50 active:scale-95"
                    >
                      {profileSaving ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                      <span className="text-[#9EB3C9] text-[11px] block">Full Name</span>
                      <span className="text-white font-semibold text-sm mt-0.5 block">
                        {user?.full_name || 'Plant Operator'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                      <span className="text-[#9EB3C9] text-[11px] block">Email Address</span>
                      <span className="text-white font-semibold text-sm mt-0.5 block truncate">
                        {user?.email || 'operator@bottlingplant.local'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                      <span className="text-[#9EB3C9] text-[11px] block">Account Identifier</span>
                      <span className="font-mono text-[#53D3E2] text-sm mt-0.5 block">
                        #{user?.id ? String(user.id).padStart(4, '0') : '0001'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(210,226,240,0.10)]">
                      <span className="text-[#9EB3C9] text-[11px] block">Role Authority</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${currentRoleConfig.badgeClass}`}>
                          {currentRoleConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-[#9EB3C9] flex items-center justify-between">
                    <span>Account registered: {formatJoinedDate(user?.created_at)}</span>
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="text-[#53D3E2] hover:underline font-semibold cursor-pointer"
                    >
                      Update Profile →
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* ═════════ TAB 3: SECURITY & PASSWORD ═════════ */}
          {activeTab === 'security' && (
            <div className="space-y-3.5">
              <GlassCard className="p-5 flex flex-col gap-4">
                <div className="pb-3 border-b border-[rgba(255,255,255,0.08)]">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#53D3E2]" />
                    <span>Change Account Password</span>
                  </h4>
                  <p className="text-xs text-[#9EB3C9] mt-0.5">
                    Update your account authentication passphrase
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#cbd5e1] mb-1.5">
                      Current Password <span className="text-[#53D3E2]">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(null); }}
                        placeholder="Enter current password"
                        className="w-full h-10 pl-10 pr-10 text-xs rounded-xl bg-[rgba(26,42,62,0.8)] border border-[rgba(210,226,240,0.25)] focus:border-[#53D3E2] text-white placeholder-[#64748b] outline-none transition-all shadow-inner"
                        disabled={passwordSaving}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 text-[#9EB3C9] hover:text-white cursor-pointer"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#cbd5e1] mb-1.5">
                      New Password <span className="text-[#53D3E2]">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Key className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                        placeholder="Enter new password (min. 6 characters)"
                        className="w-full h-10 pl-10 pr-10 text-xs rounded-xl bg-[rgba(26,42,62,0.8)] border border-[rgba(210,226,240,0.25)] focus:border-[#53D3E2] text-white placeholder-[#64748b] outline-none transition-all shadow-inner"
                        disabled={passwordSaving}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 text-[#9EB3C9] hover:text-white cursor-pointer"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {newPassword && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span className={`flex items-center gap-1 font-semibold ${newPassword.length >= 6 ? 'text-[#6BDE8B]' : 'text-amber-400'}`}>
                          {newPassword.length >= 6 ? <Check className="w-3 h-3" /> : '•'} Minimum 6 characters
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#cbd5e1] mb-1.5">
                      Confirm New Password <span className="text-[#53D3E2]">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <Key className="w-4 h-4 text-[#9EB3C9] absolute left-3.5 pointer-events-none" />
                      <input
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full h-10 pl-10 pr-10 text-xs rounded-xl bg-[rgba(26,42,62,0.8)] border border-[rgba(210,226,240,0.25)] focus:border-[#53D3E2] text-white placeholder-[#64748b] outline-none transition-all shadow-inner"
                        disabled={passwordSaving}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        className="absolute right-3 text-[#9EB3C9] hover:text-white cursor-pointer"
                      >
                        {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span className={`flex items-center gap-1 font-semibold ${newPassword === confirmPassword ? 'text-[#6BDE8B]' : 'text-rose-400'}`}>
                          {newPassword === confirmPassword ? <Check className="w-3 h-3" /> : '•'} Passwords match
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Inline Error Text (only text, no cards) */}
                  {passwordError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium animate-in fade-in duration-150">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2 border-t border-[rgba(255,255,255,0.08)] flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordSaving}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#53D3E2] to-[#2563EB] hover:brightness-110 text-white text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50 active:scale-95"
                    >
                      {passwordSaving ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Save New Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </GlassCard>

              {/* Active Session & Security Notice */}
              <GlassCard className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[rgba(83,211,226,0.15)] border border-[rgba(83,211,226,0.30)] flex items-center justify-center text-[#53D3E2] flex-shrink-0">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-white block">Current Operator Session</span>
                    <span className="text-[11px] text-[#6BDE8B]">Online • Authenticated with JWT Bearer</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSignOutModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-semibold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </GlassCard>
            </div>
          )}

          {/* ═════════ TAB 4: PREFERENCES ═════════ */}
          {activeTab === 'preferences' && (
            <div className="space-y-3.5">
              {/* Sound Effects Card */}
              <GlassCard className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-[#53D3E2]" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-[#9EB3C9]" />
                    )}
                    <span>Sound Effects & Audio Feedback</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full ${soundEnabled ? 'bg-[#53D3E2]/20 text-[#53D3E2] border border-[#53D3E2]/40' : 'bg-slate-700/40 text-slate-400'}`}>
                    {soundEnabled ? 'Enabled' : 'Muted'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-[#9EB3C9]">
                    <p className="text-white font-medium">Haptic Glass UI Feedback</p>
                    <p className="text-[11px] mt-0.5">
                      Short, subtle glassy audio feedback when activating buttons, tabs, dropdown triggers, and batch operations.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEnabled}
                    onClick={handleToggleSound}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ease-in-out focus:outline-none ${
                      soundEnabled
                        ? 'bg-[#53D3E2]/35 border-[#53D3E2]/60 shadow-[0_0_12px_rgba(83,211,226,0.35)]'
                        : 'bg-[rgba(55,75,96,0.5)] border-[rgba(210,226,240,0.25)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-md transition duration-200 ease-in-out my-auto ml-[3px] mt-[3px] ${
                        soundEnabled ? 'translate-x-5 bg-[#53D3E2]' : 'translate-x-0 bg-[#94a3b8]'
                      }`}
                    />
                  </button>
                </div>
              </GlassCard>

              {/* Display Density */}
              <GlassCard className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Sliders className="w-4 h-4 text-[#53D3E2]" />
                    <span>Interface Display Density</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#9EB3C9] capitalize">
                    {uiDensity}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDensityChange('standard')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      uiDensity === 'standard'
                        ? 'bg-[rgba(83,211,226,0.18)] border-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.25)]'
                        : 'bg-[rgba(255,255,255,0.03)] border-[rgba(210,226,240,0.15)] hover:bg-[rgba(255,255,255,0.06)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-white">
                      <span>Atmospheric Standard</span>
                      {uiDensity === 'standard' && <Check className="w-4 h-4 text-[#53D3E2]" />}
                    </div>
                    <p className="text-[11px] text-[#9EB3C9] mt-0.5">
                      Spacious glass cards with full telemetry visuals.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDensityChange('compact')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      uiDensity === 'compact'
                        ? 'bg-[rgba(83,211,226,0.18)] border-[#53D3E2] shadow-[0_0_12px_rgba(83,211,226,0.25)]'
                        : 'bg-[rgba(255,255,255,0.03)] border-[rgba(210,226,240,0.15)] hover:bg-[rgba(255,255,255,0.06)]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-white">
                      <span>High-Density Compact</span>
                      {uiDensity === 'compact' && <Check className="w-4 h-4 text-[#53D3E2]" />}
                    </div>
                    <p className="text-[11px] text-[#9EB3C9] mt-0.5">
                      Tighter spacing optimized for control-room monitors.
                    </p>
                  </button>
                </div>
              </GlassCard>

              {/* Plant Alert Preferences */}
              <GlassCard className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Bell className="w-4 h-4 text-[#53D3E2]" />
                    <span>Telemetry Notification Preferences</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#9EB3C9]">
                    Local Browser
                  </span>
                </div>

                <div className="space-y-3 pt-1 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-white block">Critical Sensor Alarms</span>
                      <span className="text-[11px] text-[#9EB3C9]">Visual alerts when bottle temperatures or conveyor pressures exceed safety limits</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifPrefs.criticalAlerts}
                      onClick={() => handleToggleNotif('criticalAlerts')}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ${
                        notifPrefs.criticalAlerts ? 'bg-[#53D3E2]/35 border-[#53D3E2]/60' : 'bg-[rgba(55,75,96,0.5)] border-[rgba(210,226,240,0.25)]'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow-md transition duration-200 ml-[2px] mt-[2px] ${
                        notifPrefs.criticalAlerts ? 'translate-x-4 bg-[#53D3E2]' : 'translate-x-0 bg-[#94a3b8]'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-white block">Batch Target Milestones</span>
                      <span className="text-[11px] text-[#9EB3C9]">Notify when active bottling batches reach 100% target units</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifPrefs.batchCompletion}
                      onClick={() => handleToggleNotif('batchCompletion')}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ${
                        notifPrefs.batchCompletion ? 'bg-[#53D3E2]/35 border-[#53D3E2]/60' : 'bg-[rgba(55,75,96,0.5)] border-[rgba(210,226,240,0.25)]'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow-md transition duration-200 ml-[2px] mt-[2px] ${
                        notifPrefs.batchCompletion ? 'translate-x-4 bg-[#53D3E2]' : 'translate-x-0 bg-[#94a3b8]'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-white block">SCADA Telemetry Heartbeat Notices</span>
                      <span className="text-[11px] text-[#9EB3C9]">Informational status when SCADA sync cycles update</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifPrefs.telemetrySync}
                      onClick={() => handleToggleNotif('telemetrySync')}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ${
                        notifPrefs.telemetrySync ? 'bg-[#53D3E2]/35 border-[#53D3E2]/60' : 'bg-[rgba(55,75,96,0.5)] border-[rgba(210,226,240,0.25)]'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow-md transition duration-200 ml-[2px] mt-[2px] ${
                        notifPrefs.telemetrySync ? 'translate-x-4 bg-[#53D3E2]' : 'translate-x-0 bg-[#94a3b8]'
                      }`} />
                    </button>
                  </div>
                </div>

              </GlassCard>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════
          SIGNOUT CONFIRMATION MODAL
      ═══════════════════════════════════════════════════════════════════════════ */}
      {showSignOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(6,16,28,0.75)] backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-[28px] bg-[rgba(26,42,62,0.96)] border border-[rgba(210,226,240,0.30)] shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 flex-shrink-0 shadow-lg shadow-rose-950/40">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Sign Out of Bottling Plant?
                </h3>
                <p className="text-xs text-[#9EB3C9] mt-0.5 leading-relaxed">
                  Are you sure you want to end your current operator session? You will need to sign back in with your credentials to access SCADA telemetry and controls.
                </p>
              </div>
            </div>

            {/* User Identity Chip */}
            <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(210,226,240,0.12)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-7 h-7 rounded-full bg-[rgba(55,75,96,0.8)] border border-[rgba(210,226,240,0.3)] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {userInitial}
                </div>
                <div className="truncate">
                  <span className="text-white font-semibold block truncate">{user?.full_name}</span>
                  <span className="text-[10px] text-[#9EB3C9] block truncate">{user?.email}</span>
                </div>
              </div>
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${currentRoleConfig.badgeClass} flex-shrink-0 ml-2`}>
                {currentRoleConfig.label}
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <button
                type="button"
                onClick={() => setShowSignOutModal(false)}
                disabled={isSigningOut}
                className="px-4 py-2 rounded-xl bg-[rgba(55,75,96,0.45)] hover:bg-[rgba(68,90,114,0.65)] border border-[rgba(210,226,240,0.22)] text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                disabled={isSigningOut}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border border-rose-500/40 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-950/50 flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isSigningOut ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing out...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Yes, Sign Out</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
