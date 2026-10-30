import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  position?: 'top' | 'bottom';
  className?: string;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss, position = 'bottom', className }) => {
  const defaultPosClass = position === 'top'
    ? 'fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none'
    : 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none';

  return (
    <div className={className || defaultPosClass}>
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: position === 'top' ? -15 : 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === 'top' ? -15 : 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-start gap-3 p-3.5 bg-[#12151b]/95 backdrop-blur-md border border-white/[0.12] rounded-2xl shadow-2xl text-[#f0f2f5]"
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-white tracking-tight">{toast.title}</h5>
              {toast.message && <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{toast.message}</p>}
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="text-white/40 hover:text-white p-0.5 rounded-lg transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
