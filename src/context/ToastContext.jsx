import React, { createContext, useState, useContext, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'error' ? 9000 : 6000); // 3s was too short to read the longer instructions on a phone
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Contrast: white on the old green/amber was about 2.2:1. Dark text on green/amber and white on a
          darker red are all above 4.5:1. Screen readers announce new messages (aria-live). */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className="animate-fade-in toast-item" style={{
            background: toast.type === 'error' ? '#b91c1c' : (toast.type === 'warning' ? '#f59e0b' : (toast.type === 'info' ? '#38bdf8' : '#00c896')),
            color: toast.type === 'error' ? 'white' : '#070a12',
            padding: '1rem 1.5rem',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            fontWeight: 'bold'
          }}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
