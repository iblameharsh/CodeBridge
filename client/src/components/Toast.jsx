import React, { createContext, useContext, useCallback, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'success') => {
      const id = ++idCounter;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icon = icons[t.type] || icons.info;
          return (
            <div
              key={t.id}
              className={`toast toast-${t.type}`}
              onClick={() => remove(t.id)}
            >
              <Icon size={18} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};