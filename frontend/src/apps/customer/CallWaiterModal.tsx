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
    customTitle: string,
    badgeEmoji: string
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
      title: 'Request Water',
      emoji: '💧',
      icon: Droplet,
      bgStyle: 'bg-cyan-950/40 hover:bg-cyan-900/50 border-cyan-800/50 text-cyan-200',
      iconBg: 'bg-cyan-500/20 text-cyan-400',
    },
    {
      id: 'CUTLERY' as const,
      title: 'Cutlery & Spoons',
      emoji: '🍴',
      icon: Utensils,
      bgStyle: 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-800/50 text-amber-200',
      iconBg: 'bg-amber-500/20 text-amber-400',
    },
    {
      id: 'NAPKINS' as const,
      title: 'Napkins & Tissues',
      emoji: '🧻',
      icon: FileText,
      bgStyle: 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-800/50 text-purple-200',
      iconBg: 'bg-purple-500/20 text-purple-400',
    },
    {
      id: 'BILL' as const,
      title: 'Request Final Bill',
      emoji: '🧾',
      icon: Receipt,
      bgStyle: 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/50 text-emerald-200',
      iconBg: 'bg-emerald-500/20 text-emerald-400',
    },
    {
      id: 'CALL_WAITER' as const,
      title: 'Call Waiter Assistance',
      emoji: '🔔',
      icon: PhoneCall,
      bgStyle: 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-800/50 text-rose-200',
      iconBg: 'bg-rose-500/20 text-rose-400',
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
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 sm:space-y-5 scrollbar-thin scrollbar-thumb-slate-700"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center">
                <Bell className="w-6 h-6 text-amber-400 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Call Waiter Service</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Select what you need for <span className="text-white font-bold">{tableNumber}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Service Request Options List */}
          <div className="space-y-2.5">
            {options.map((opt) => {
              const IconComponent = opt.icon;
              const isSelected = submittingType === opt.id;

              return (
                <button
                  key={opt.id}
                  disabled={submittingType !== null}
                  onClick={() => handleSelectOption(opt.id, opt.title, opt.emoji)}
                  className={`w-full p-2.5 sm:p-3.5 rounded-2xl border transition-all flex items-center justify-between group active:scale-[0.98] ${opt.bgStyle} ${
                    isSelected ? 'ring-2 ring-white/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`p-2.5 rounded-xl ${opt.iconBg} flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-sm tracking-wide">{opt.title}</span>
                  </div>

                  {isSelected ? (
                    <span className="text-xs text-white animate-pulse">Sending...</span>
                  ) : (
                    <span className="text-lg group-hover:scale-125 transition-transform">{opt.emoji}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Optional Note Input Field */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <label className="block text-[10px] font-black text-slate-400 tracking-wider uppercase">
              Additional Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Extra ice, warm water, high chair..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/80 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
