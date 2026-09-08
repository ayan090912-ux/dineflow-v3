import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Droplet,
  Utensils,
  FileText,
  Receipt,
  PhoneCall,
  X,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../packages/api/client';

export interface CallWaiterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  tableId?: string;
  tableSessionId?: string;
  restaurantId?: string;
  onRequestSuccess?: (title: string, note?: string) => void;
}

export const CallWaiterModal: React.FC<CallWaiterModalProps> = ({
  isOpen,
  onClose,
  tableNumber,
  tableId,
  tableSessionId,
  restaurantId,
  onRequestSuccess,
}) => {
  const [note, setNote] = useState('');
  const [submittingType, setSubmittingType] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectOption = async (
    requestType: 'WATER' | 'CUTLERY' | 'NAPKINS' | 'BILL' | 'CALL_WAITER',
    customTitle: string
  ) => {
    setSubmittingType(requestType);
    try {
      await api.createCustomerRequest({
        tableNumber,
        tableId,
        tableSessionId,
        restaurantId,
        requestType,
        customTitle,
        priority: requestType === 'BILL' || requestType === 'CALL_WAITER' ? 'HIGH' : 'MEDIUM',
        customerNotes: note.trim() || undefined,
      });

      if (onRequestSuccess) {
        onRequestSuccess(customTitle, note.trim());
      }
      setNote('');
      onClose();
    } catch (err: any) {
      console.error('Failed to submit waiter request:', err);
      alert(`Unable to submit request: ${err.message || 'Server error'}`);
    } finally {
      setSubmittingType(null);
    }
  };

  const options = [
    {
      id: 'WATER' as const,
      title: 'Water Service',
      description: 'Chilled or regular table water',
      icon: Droplet,
    },
    {
      id: 'CUTLERY' as const,
      title: 'Cutlery & Plates',
      description: 'Extra forks, spoons, or side plates',
      icon: Utensils,
    },
    {
      id: 'NAPKINS' as const,
      title: 'Napkins & Tissues',
      description: 'Fresh paper or cloth napkins',
      icon: FileText,
    },
    {
      id: 'BILL' as const,
      title: 'Request Bill',
      description: 'Check presentation & payment settlement',
      icon: Receipt,
    },
    {
      id: 'CALL_WAITER' as const,
      title: 'Floor Waiter Assistance',
      description: 'General questions, recommendations or help',
      icon: PhoneCall,
    },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#12151b] border border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-2xl z-10 space-y-4"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white tracking-tight">Call Staff</h3>
                <p className="text-xs text-white/50 mt-0.5 font-mono">
                  Table {tableNumber.replace(/^Table\s*/i, '')} • Floor Request
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/[0.04] text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Service Request Options List */}
          <div className="space-y-2">
            {options.map((opt) => {
              const IconComponent = opt.icon;
              const isSelected = submittingType === opt.id;

              return (
                <button
                  key={opt.id}
                  disabled={submittingType !== null}
                  onClick={() => handleSelectOption(opt.id, opt.title)}
                  className={`w-full p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all flex items-center justify-between text-left group active:scale-[0.99] ${
                    isSelected ? 'ring-1 ring-amber-400/50 bg-amber-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70 group-hover:text-amber-400 transition-colors">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-medium text-xs text-white block">{opt.title}</span>
                      <span className="text-[11px] text-white/40 block">{opt.description}</span>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="text-xs font-mono text-amber-400 animate-pulse">Notifying...</span>
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Optional Note Input Field */}
          <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
            <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wider font-mono">
              Optional Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Extra ice, warm water, high chair..."
              className="w-full bg-[#0b0d11] border border-white/[0.08] focus:border-amber-400/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none transition-colors font-medium"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
