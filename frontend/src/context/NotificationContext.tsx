import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface PlantNotification {
  id: string;
  title: string;
  message: string;
  type: 'security' | 'success' | 'alert' | 'info';
  timestamp: string;
  read: boolean;
  category?: 'account' | 'security' | 'system' | 'production';
}

interface NotificationContextType {
  notifications: PlantNotification[];
  unreadCount: number;
  addNotification: (notif: {
    title: string;
    message: string;
    type?: 'security' | 'success' | 'alert' | 'info';
    category?: 'account' | 'security' | 'system' | 'production';
  }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'smart_bottling_notifications_v1';

const defaultNotifications: PlantNotification[] = [
  {
    id: 'init-1',
    title: 'Plant SCADA Telemetry Online',
    message: 'Continuous line tracking and fill weight inspection sensors active.',
    type: 'system' as any,
    timestamp: 'Just now',
    read: false,
    category: 'system',
  },
  {
    id: 'init-2',
    title: 'Authenticated Operator Session',
    message: 'Argon2id token verified. Operator permissions active.',
    type: 'security',
    timestamp: '5m ago',
    read: false,
    category: 'security',
  },
];

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<PlantNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return defaultNotifications;
  });

  // Save to localStorage whenever notifications change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // ignore
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notif: {
      title: string;
      message: string;
      type?: 'security' | 'success' | 'alert' | 'info';
      category?: 'account' | 'security' | 'system' | 'production';
    }) => {
      const newEntry: PlantNotification = {
        id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        title: notif.title,
        message: notif.message,
        type: notif.type || 'info',
        timestamp: 'Just now',
        read: false,
        category: notif.category || 'system',
      };

      setNotifications((prev) => [newEntry, ...prev.slice(0, 24)]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Listen to global event for non-react triggers
  useEffect(() => {
    const handleGlobalNotif = (e: Event) => {
      const ce = e as CustomEvent<{
        title: string;
        message: string;
        type?: 'security' | 'success' | 'alert' | 'info';
        category?: 'account' | 'security' | 'system' | 'production';
      }>;
      if (ce.detail && ce.detail.title && ce.detail.message) {
        addNotification(ce.detail);
      }
    };

    window.addEventListener('plant_add_notification', handleGlobalNotif);
    return () => window.removeEventListener('plant_add_notification', handleGlobalNotif);
  }, [addNotification]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

// Global helper for emitting notifications from anywhere
export const postNotification = (
  title: string,
  message: string,
  type: 'security' | 'success' | 'alert' | 'info' = 'info',
  category?: 'account' | 'security' | 'system' | 'production'
) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('plant_add_notification', {
        detail: { title, message, type, category },
      })
    );
  }
};
