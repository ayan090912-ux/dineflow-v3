import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Command, LayoutDashboard, Utensils, Users, Settings, ShoppingBag, ArrowRight } from 'lucide-react';

export interface CommandOption {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  options: CommandOption[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  options,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(query.toLowerCase()) ||
    opt.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            className="relative w-full max-w-xl bg-[#0e1117] rounded-xl border border-white/[0.08] shadow-2xl overflow-hidden z-10 font-sans"
          >
            <div className="flex items-center px-4 py-3 border-b border-white/[0.08]">
              <Search className="w-4 h-4 text-white/40 mr-3 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search..."
                className="w-full bg-transparent text-white text-xs focus:outline-none placeholder:text-white/30"
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08]">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-white/[0.04]">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-white/40">No matching commands found.</div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      opt.action();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-[#12151b] border border-white/[0.08] text-white/60 group-hover:text-amber-400 transition-colors">
                        {opt.icon}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{opt.label}</p>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">{opt.category}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
