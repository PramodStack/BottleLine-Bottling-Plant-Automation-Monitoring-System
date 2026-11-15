import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  isExiting?: boolean;
}

interface ToastOptions {
  title?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Subtle audio chime
function playNotificationSound(type: ToastType) {
  try {
    if (typeof window === 'undefined') return;
    const enabled = localStorage.getItem('smart_bottling_sound_effects_enabled');
    if (enabled === 'false') return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    if (type === 'error') {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } else {
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  } catch {
    // Ignore audio restrictions
  }
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 280);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions): string => {
      const id = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const duration = options?.duration ?? 3500;

      playNotificationSound(type);

      setToasts((prev) => {
        const filtered = prev.slice(-2);
        return [...filtered, { id, type, message, title: options?.title, isExiting: false }];
      });

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const success = useCallback((message: string, options?: ToastOptions) => showToast(message, 'success', options), [showToast]);
  const error = useCallback((message: string, options?: ToastOptions) => showToast(message, 'error', options), [showToast]);
  const warning = useCallback((message: string, options?: ToastOptions) => showToast(message, 'warning', options), [showToast]);
  const info = useCallback((message: string, options?: ToastOptions) => showToast(message, 'info', options), [showToast]);

  useEffect(() => {
    const handleGlobalToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; type?: ToastType; options?: ToastOptions }>;
      if (customEvent.detail && customEvent.detail.message) {
        showToast(customEvent.detail.message, customEvent.detail.type || 'info', customEvent.detail.options);
      }
    };

    window.addEventListener('plant_toast', handleGlobalToast);
    return () => window.removeEventListener('plant_toast', handleGlobalToast);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, removeToast }}>
      {children}

      {/* ═══════════════════════════════════════════════════════════════════════════
          FLOATING PROMINENT TEXT (BIG LETTERS, POSITIONED ABOVE THE AI CIRCLE)
      ═══════════════════════════════════════════════════════════════════════════ */}
      <div
        className="fixed bottom-28 right-6 z-[99999] flex flex-col items-end gap-2 pointer-events-none select-none max-w-md"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isExit = toast.isExiting;

          let colorClass = 'text-[#53D3E2] drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]';
          let dotColor = 'bg-[#53D3E2] shadow-[0_0_12px_#53D3E2]';

          if (toast.type === 'success') {
            colorClass = 'text-[#6BDE8B] drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]';
            dotColor = 'bg-[#6BDE8B] shadow-[0_0_12px_#6BDE8B]';
          } else if (toast.type === 'error') {
            colorClass = 'text-[#FF6B6B] drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]';
            dotColor = 'bg-[#FF6B6B] shadow-[0_0_12px_#FF6B6B]';
          } else if (toast.type === 'warning') {
            colorClass = 'text-[#FBBF24] drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]';
            dotColor = 'bg-[#FBBF24] shadow-[0_0_12px_#FBBF24]';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-2.5 py-1 px-1 text-sm sm:text-base font-extrabold tracking-wide transition-all duration-300 ${
                isExit ? 'toast-exit' : 'toast-enter'
              } ${colorClass}`}
              role="status"
            >
              <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 animate-pulse ${dotColor}`} />
              <span className="truncate max-w-[420px]">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const toastNotify = (message: string, type: ToastType = 'info', options?: ToastOptions) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('plant_toast', {
        detail: { message, type, options },
      })
    );
  }
};
