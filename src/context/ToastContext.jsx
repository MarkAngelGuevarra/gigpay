import { createContext, useState, useContext, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

const TOAST_META = {
  success: {
    Icon: CheckCircle2,
    bar: 'bg-[var(--signal-money)]',
    iconColor: 'text-[var(--signal-money)]',
  },
  warning: {
    Icon: AlertTriangle,
    bar: 'bg-[var(--signal-warn)]',
    iconColor: 'text-[var(--signal-warn)]',
  },
  error: {
    Icon: XCircle,
    bar: 'bg-[var(--signal-danger)]',
    iconColor: 'text-[var(--signal-danger)]',
  },
  info: {
    Icon: Info,
    bar: 'bg-[var(--accent-primary)]',
    iconColor: 'text-[var(--text-secondary)]',
  },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const toastSeqRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${++toastSeqRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, type === 'error' ? 9000 : 6000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => {
          const meta = TOAST_META[toast.type] || TOAST_META.info;
          const Icon = meta.Icon;
          return (
            <div
              key={toast.id}
              className="animate-fade-in toast-item relative flex items-start gap-3 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-3 pr-3 pl-4 text-[var(--text-primary)] shadow-[var(--shadow-lg)]"
            >
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} />
              <Icon size={17} className={`mt-0.5 shrink-0 ${meta.iconColor}`} />
              <div className="min-w-0 flex-1 text-[13.5px] leading-snug font-medium text-[var(--text-primary)]">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
