'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface Toast {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  href?: string;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<Toast['severity'], number | null> = {
  INFO: 8_000,
  WARNING: 15_000,
  CRITICAL: null, // manual dismiss only
};

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (input: Omit<Toast, 'id' | 'createdAt'>) => {
      const id = `toast-${++counterRef.current}-${Date.now()}`;
      const toast: Toast = { ...input, id, createdAt: Date.now() };

      setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));

      const timeout = AUTO_DISMISS_MS[input.severity];
      if (timeout !== null) {
        setTimeout(() => dismissToast(id), timeout);
      }
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
