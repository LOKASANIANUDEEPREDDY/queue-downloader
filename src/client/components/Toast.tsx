import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

let toastsList: ToastMessage[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  for (const listener of listeners) {
    listener([...toastsList]);
  }
}

export const toast = {
  success(message: string, title?: string, duration = 4000) {
    this.add({ type: 'success', message, title, duration });
  },
  error(message: string, title?: string, duration = 6000) {
    this.add({ type: 'error', message, title, duration });
  },
  warning(message: string, title?: string, duration = 5000) {
    this.add({ type: 'warning', message, title, duration });
  },
  info(message: string, title?: string, duration = 4000) {
    this.add({ type: 'info', message, title, duration });
  },
  add(t: Omit<ToastMessage, 'id'>) {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastMessage = { ...t, id };
    toastsList = [newToast, ...toastsList].slice(0, 5);
    notify();

    if (t.duration && t.duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, t.duration);
    }
  },
  remove(id: string) {
    toastsList = toastsList.filter((item) => item.id !== id);
    notify();
  },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4">
      {toasts.map((t) => {
        const icons = {
          success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
          error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
          warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
          info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
        };

        const bgBorders = {
          success: 'bg-white dark:bg-slate-900 border-emerald-500/30 text-slate-800 dark:text-slate-100',
          error: 'bg-white dark:bg-slate-900 border-rose-500/30 text-slate-800 dark:text-slate-100',
          warning: 'bg-white dark:bg-slate-900 border-amber-500/30 text-slate-800 dark:text-slate-100',
          info: 'bg-white dark:bg-slate-900 border-blue-500/30 text-slate-800 dark:text-slate-100',
        };

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in slide-in-from-bottom-2 ${bgBorders[t.type]}`}
          >
            {icons[t.type]}
            <div className="flex-1 min-w-0 pt-0.5">
              {t.title && <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">{t.title}</div>}
              <div className="text-sm font-medium leading-snug break-words">{t.message}</div>
            </div>
            <button
              onClick={() => toast.remove(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -mr-1 -mt-1 rounded-lg transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

