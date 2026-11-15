import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, User } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
  canManageUsers: boolean;
  canCreateBatch: boolean;
  canAccessAi: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (fullName: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updatedUser: User, newToken?: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('plant_auth_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('plant_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('plant_auth_token');
      localStorage.removeItem('plant_user');
    };

    window.addEventListener('plant_auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('plant_auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    const verifyUser = async () => {
      const storedToken = localStorage.getItem('plant_auth_token');
      if (!storedToken) {
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await api.getMe();
        if (res.success && res.user) {
          setUser(res.user);
          localStorage.setItem('plant_user', JSON.stringify(res.user));
        } else {
          logout();
        }
      } catch (err) {
        logout();
      } finally {
        setLoading(false);
      }
    };

    verifyUser();
  }, []);

  // Periodic authenticated heartbeat to maintain real-time online presence
  useEffect(() => {
    if (!token || !user) return;

    const triggerHeartbeat = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        await api.sendHeartbeat();
      } catch (err) {
        // Silent catch; handled by api interceptor if session expires
      }
    };

    // Send initial heartbeat immediately
    triggerHeartbeat();

    // Pulse heartbeat every 30 seconds
    const interval = setInterval(triggerHeartbeat, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [token, user?.id]);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    if (res.token && res.user) {
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('plant_auth_token', res.token);
      localStorage.setItem('plant_user', JSON.stringify(res.user));
    }
  };

  const signup = async (fullName: string, email: string, password: string, confirmPassword: string) => {
    const res = await api.signup({
      full_name: fullName,
      email,
      password,
      confirm_password: confirmPassword,
      role: 'analyst',
    });
    if (res.token && res.user) {
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('plant_auth_token', res.token);
      localStorage.setItem('plant_user', JSON.stringify(res.user));
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('plant_auth_token');
    localStorage.removeItem('plant_user');
  };

  const updateCurrentUser = (updatedUser: User, newToken?: string) => {
    setUser(updatedUser);
    localStorage.setItem('plant_user', JSON.stringify(updatedUser));
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('plant_auth_token', newToken);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.getProfile();
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem('plant_user', JSON.stringify(res.user));
      }
    } catch {
      // ignore
    }
  };

  const role = user?.role;
  const isOwner = role === 'owner' || !!user?.is_owner;
  const isSuperAdmin = role === 'super_admin';
  const canManageUsers = isOwner || isSuperAdmin;
  const canCreateBatch = isOwner || isSuperAdmin || role === 'manager';
  const canAccessAi = role !== 'operator';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        loading,
        isOwner,
        isSuperAdmin,
        canManageUsers,
        canCreateBatch,
        canAccessAi,
        login,
        signup,
        logout,
        updateCurrentUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
