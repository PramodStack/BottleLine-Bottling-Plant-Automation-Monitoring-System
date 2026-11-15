// API client for Bottling Plant Analytics

const API_BASE = '/api';

export type UserRole = 'owner' | 'super_admin' | 'analyst' | 'manager' | 'supervisor' | 'operator';

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  is_owner?: boolean;
  is_active?: boolean;
  last_seen_at?: string | null;
  is_online?: boolean;
  online_status?: 'online' | 'recently_active' | 'offline' | 'never_logged_in';
  seconds_ago?: number | null;
  avatar_url?: string | null;
  avatar?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserSummary {
  total_users: number;
  active_users: number;
  inactive_users: number;
  online_users?: number;
  by_role: Record<UserRole, number>;
}

export interface UsersResponse {
  success: boolean;
  users: User[];
  summary: UserSummary;
  message?: string;
}

export interface AuditLogItem {
  id: number;
  actor_id: number;
  actor_email: string;
  actor_name: string;
  target_id: number;
  target_email: string;
  target_name: string;
  action: string;
  previous_role: string | null;
  new_role: string | null;
  status: string;
  details: string | null;
  created_at: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
}

export interface SummaryData {
  total_bottles: number;
  accepted_bottles: number;
  rejected_bottles: number;
  capped_bottles?: number;
  total_box_packed: number;
  quality_pass_rate?: number | null;
  rejection_rate?: number | null;
  packaging_rate?: number | null;
  bottles_per_box: number;
}

export interface BatchData {
  id: number;
  batch_number: string;
  production_mode: 'continuous' | 'set_quantity';
  target_quantity: number | null;
  produced_quantity: number;
  batch_status: string;
  progress_percentage?: number | null;
  scheduled_start?: string | null;
  actual_start?: string | null;
  completed_at?: string | null;
  stopped_at?: string | null;
  created_at?: string | null;
}

export interface BottleLog {
  id: number;
  bottle_number: number;
  weight_status: string;
  cap_status: string;
  inspection_status: string;
  created_at: string;
}

export interface ChartPoint {
  label: string;
  timeLabel?: string;
  fullLabel?: string;
  date?: string;
  bottleNumber?: number;
  bottlesProduced?: number | string;
  passRate?: number | string;
  rejectionRate?: number | string;
  rejectedCount?: number;
  acceptedCount?: number;
  boxesPacked?: number;
  boxesPackedStr?: string;
  produced?: number;
  accepted?: number;
  rejected?: number;
  packaged?: number;
  cumProduced?: number;
  cumAccepted?: number;
  cumRejected?: number;
  cumPackaged?: number;
  cyan?: number;
  green?: number;
  red?: number;
  yellow?: number;
}

export interface PeriodTelemetry {
  period: string;
  summary: SummaryData;
  avg_rate_per_hr?: number | null;
  chart_data: ChartPoint[];
  comparison?: {
    has_comparison?: boolean;
    prev_total?: number;
    total_change?: number;
  } | null;
}

export interface DashboardResponse {
  success: boolean;
  period?: string;
  summary: SummaryData;
  avg_rate_per_hr?: number | null;
  comparison?: {
    has_comparison?: boolean;
    prev_total?: number;
    total_change?: number;
  } | null;
  by_period?: Record<string, PeriodTelemetry>;
  batch: BatchData;
  batches?: BatchData[];
  log_stats: {
    total_logged: number;
    weight_ok: number;
    weight_low: number;
    capped_count: number;
    pending_cap: number;
    passed_count: number;
    rejected_count: number;
    pending_insp: number;
  };
  recent_logs: BottleLog[];
  chart_data: ChartPoint[];
  historical_chart_data?: ChartPoint[];
  database_status: {
    status: string;
    database?: string;
    host?: string;
    error?: string;
  };
  last_updated: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('plant_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('plant_auth_token');
      localStorage.removeItem('plant_user');
      window.dispatchEvent(new CustomEvent('plant_auth:unauthorized'));
    }
    throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
  }
  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  signup: (payload: {
    full_name: string;
    email: string;
    password: string;
    confirm_password: string;
    role?: string;
  }) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => request<{ success: boolean; user: User }>('/auth/me'),
  getProfile: async () => {
    try {
      return await request<{ success: boolean; user: User }>('/auth/profile');
    } catch {
      return await request<{ success: boolean; user: User }>('/auth/me');
    }
  },
  updateProfile: async (data: { full_name: string; email: string; avatar_url?: string | null }) => {
    // 1. Primary: dedicated endpoint /auth/profile
    try {
      return await request<AuthResponse>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      // If endpoint is unmapped on older running server (404/405), fallback gracefully
      if (msg.includes('404') || msg.includes('405') || msg.includes('not found') || msg.includes('not allowed')) {
        const storedUser = localStorage.getItem('plant_user');
        const currentUser = storedUser ? JSON.parse(storedUser) : null;
        if (currentUser && currentUser.id) {
          try {
            const userRes = await request<{ success: boolean; message: string; user: User }>(`/users/${currentUser.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                full_name: data.full_name,
                email: data.email,
              }),
            });
            if (userRes.success && userRes.user) {
              return {
                success: true,
                message: userRes.message || 'Profile updated successfully',
                user: userRes.user,
              };
            }
          } catch {
            // continue fallback chain
          }
        }

        try {
          return await request<AuthResponse>('/auth/me', {
            method: 'PUT',
            body: JSON.stringify(data),
          });
        } catch {
          throw new Error('Please restart the backend server (python app.py) to enable profile editing.');
        }
      }
      throw err;
    }
  },
  updateAvatar: (avatarData: string) =>
    request<{ success: boolean; message: string; user: User }>('/auth/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatar: avatarData }),
    }),
  deleteAvatar: () =>
    request<{ success: boolean; message: string; user: User }>('/auth/avatar', {
      method: 'DELETE',
    }),
  changePassword: async (data: { current_password: string; new_password: string; confirm_password: string }) => {
    try {
      return await request<{ success: boolean; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('404') || msg.includes('405') || msg.includes('not found') || msg.includes('not allowed')) {
        const storedUser = localStorage.getItem('plant_user');
        const currentUser = storedUser ? JSON.parse(storedUser) : null;
        if (currentUser && currentUser.id) {
          try {
            const userRes = await request<{ success: boolean; message: string }>(`/users/${currentUser.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                password: data.new_password,
              }),
            });
            if (userRes.success) {
              return {
                success: true,
                message: 'Password updated successfully',
              };
            }
          } catch {
            // continue fallback chain
          }
        }

        return await request<{ success: boolean; message: string }>('/auth/password', {
          method: 'PUT',
          body: JSON.stringify(data),
        });
      }
      throw err;
    }
  },
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  sendHeartbeat: () =>
    request<{ success: boolean; user_id: number; timestamp: string }>('/auth/heartbeat', {
      method: 'POST',
    }),

  // Dashboard & Metrics
  getDashboardSummary: (period?: string) =>
    request<DashboardResponse>(
      period ? `/dashboard/summary?period=${encodeURIComponent(period)}` : '/dashboard/summary'
    ),

  // Production
  getProductionSummary: () => request<any>('/production/summary'),
  getProductionLogs: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    weight_status?: string;
    cap_status?: string;
    date_from?: string;
    date_to?: string;
    sort_by?: string;
    sort_dir?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.weight_status) query.set('weight_status', params.weight_status);
    if (params.cap_status) query.set('cap_status', params.cap_status);
    if (params.date_from) query.set('date_from', params.date_from);
    if (params.date_to) query.set('date_to', params.date_to);
    if (params.sort_by) query.set('sort_by', params.sort_by);
    if (params.sort_dir) query.set('sort_dir', params.sort_dir);
    return request<any>(`/production/logs?${query.toString()}`);
  },
  getProductionHistory: (page = 1, limit = 20, status = '') =>
    request<any>(`/production/history?page=${page}&limit=${limit}&status=${encodeURIComponent(status)}`),
  getNextBatchNumber: () =>
    request<{ success: boolean; next_batch_number: string }>('/production/batches/next-id'),
  getProductionBatches: (params: { search?: string; status?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.limit) query.set('limit', String(params.limit));
    return request<any>(`/production/batches?${query.toString()}`);
  },
  createProductionBatch: (payload: {
    batch_number?: string;
    production_mode: 'continuous' | 'set_quantity';
    target_quantity?: number | null;
    scheduled_start?: string | null;
  }) =>
    request<any>('/production/batches', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProductionBatch: (
    id: number,
    payload: {
      production_mode?: 'continuous' | 'set_quantity';
      target_quantity?: number | null;
      scheduled_start?: string | null;
    }
  ) =>
    request<any>(`/production/batches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  stopProductionBatch: (id: number) =>
    request<any>(`/production/batches/${id}/stop`, {
      method: 'POST',
    }),
  getProductionAnalytics: () => request<any>('/production/analytics'),
  getProductionTrends: () => request<any>('/production/trends'),

  // Packaging
  getPackagingSummary: () => request<any>('/packaging/summary'),
  getPackagingTrends: () => request<any>('/packaging/trends'),

  // Inspection
  getInspectionSummary: () => request<any>('/inspection/summary'),
  getInspectionTrends: () => request<any>('/inspection/trends'),

  // Capping
  getCappingSummary: () => request<any>('/capping/summary'),

  // Sensors
  getSensorsStatus: () => request<any>('/sensors/status'),

  // Reports
  getProductionReport: (format = 'json') =>
    format === 'csv'
      ? `${API_BASE}/reports/production?format=csv`
      : request<any>('/reports/production?format=json'),

  // AI Plant Insights Agent
  sendAiChat: (message: string, history: Array<{ sender: 'ai' | 'user'; text: string }> = []) =>
    request<{
      success: boolean;
      reply?: string;
      timestamp?: string;
      message?: string;
    }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  streamAiChat: async (
    message: string,
    history: Array<{ sender: 'ai' | 'user'; text: string }> = [],
    callbacks: {
      onStatus?: (status: string) => void;
      onDelta?: (delta: string) => void;
      onDone?: (timestamp?: string) => void;
      onError?: (error: string) => void;
    },
    signal?: AbortSignal
  ) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...getAuthHeader(),
    };

    const response = await fetch(`${API_BASE}/ai/chat?stream=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history }),
      signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `Request failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported on this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'status' && callbacks.onStatus) {
            callbacks.onStatus(event.status);
          } else if (event.type === 'delta' && callbacks.onDelta) {
            callbacks.onDelta(event.delta);
          } else if (event.type === 'done' && callbacks.onDone) {
            callbacks.onDone(event.timestamp);
          } else if (event.type === 'error' && callbacks.onError) {
            callbacks.onError(event.message || 'AI service error');
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  },

  getAiHealth: () => request<any>('/ai/health'),

  getAiForecast: (shiftHours = 8.0) =>
    request<{
      success: boolean;
      forecast?: any;
      message?: string;
    }>(`/ai/forecast?shift_hours=${shiftHours}`),

  getAiRecommendations: () =>
    request<{
      success: boolean;
      data?: any;
      message?: string;
    }>('/ai/recommendations'),

  // User Management & RBAC
  getUsers: (params?: { search?: string; role?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return request<UsersResponse>(`/users${qs ? `?${qs}` : ''}`);
  },

  createUser: (data: {
    full_name: string;
    email: string;
    password: string;
    role: string;
    is_active?: boolean;
  }) =>
    request<{ success: boolean; message: string; user?: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (
    userId: number,
    data: {
      full_name?: string;
      email?: string;
      role?: string;
      password?: string;
    }
  ) =>
    request<{ success: boolean; message: string; user?: User }>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  setUserStatus: (userId: number, isActive: boolean) =>
    request<{ success: boolean; message: string; is_active?: boolean }>(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    }),

  deleteUser: (userId: number) =>
    request<{ success: boolean; message: string }>(`/users/${userId}`, {
      method: 'DELETE',
    }),

  getUserAuditLogs: (limit = 50) =>
    request<{ success: boolean; logs: AuditLogItem[] }>(`/users/audit-logs?limit=${limit}`),
};
