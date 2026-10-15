import React from 'react';
import { Sparkles, Utensils } from 'lucide-react';

export interface ProductSwitcherProps {
  activeProduct: 'restaurants' | 'weddings';
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
  compact?: boolean;
  onSwitch?: (product: 'restaurants' | 'weddings') => void;
}

export const ProductSwitcher: React.FC<ProductSwitcherProps> = ({
  activeProduct,
  theme = 'dark',
  className = '',
  compact = false,
  onSwitch,
}) => {
  const handleSelect = (product: 'restaurants' | 'weddings') => {
    if (product === activeProduct) return;

    if (onSwitch) {
      onSwitch(product);
      return;
    }

    // Default global navigation logic
    if (product === 'restaurants') {
      const activeRestId = typeof window !== 'undefined'
        ? (localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id'))
        : null;
      const target = activeRestId ? '/restaurant/dashboard' : '/';
      window.location.href = target;
    } else {
      const hasWeddingWorkspace = typeof window !== 'undefined' && localStorage.getItem('dinely_wedding_workspace_id');
      const target = hasWeddingWorkspace ? '/weddings/dashboard' : '/weddings';
      window.location.href = target;
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      role="tablist"
      aria-label="Dinely Product Experience Switcher"
      className={`inline-flex items-center p-1 rounded-full transition-all text-xs font-sans ${
        isDark
          ? 'bg-white/[0.06] border border-white/[0.12] shadow-inner backdrop-blur-md'
          : 'bg-[#ece5d8] border border-[#dacfc0] shadow-inner'
      } ${className}`}
    >
      {/* 1. Restaurants Platform Tab */}
      <button
        type="button"
        role="tab"
        aria-selected={activeProduct === 'restaurants'}
        onClick={() => handleSelect('restaurants')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all cursor-pointer outline-none border ${
          activeProduct === 'restaurants'
            ? isDark
              ? 'bg-white text-slate-950 font-bold shadow-sm border-white'
              : 'bg-white text-[#2a241c] font-bold shadow-sm border-[#dacfc0]'
            : isDark
            ? 'text-white/70 hover:text-white hover:bg-white/[0.08] border-transparent'
            : 'text-[#6b5c49] hover:text-[#2a241c] hover:bg-white/60 border-transparent'
        }`}
        title="Switch to Dinely Restaurant Management Platform"
      >
        <Utensils className="w-3.5 h-3.5 shrink-0 opacity-80" />
        <span className={compact ? 'hidden sm:inline font-medium' : 'font-medium'}>
          Restaurants
        </span>
      </button>

      {/* 2. Weddings & Events Platform Tab */}
      <button
        type="button"
        role="tab"
        aria-selected={activeProduct === 'weddings'}
        onClick={() => handleSelect('weddings')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all cursor-pointer outline-none border ${
          activeProduct === 'weddings'
            ? isDark
              ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold shadow-md shadow-amber-400/20 border-amber-300'
              : 'bg-white text-[#8c6d1f] font-bold shadow-sm border-[#dacfc0]'
            : isDark
            ? 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-400/10 border-transparent'
            : 'text-[#85651c] hover:text-[#5a4310] hover:bg-white/60 border-transparent'
        }`}
        title="Switch to Dinely Weddings & Events Ordering Platform"
      >
        <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-90" />
        <span className={compact ? 'hidden sm:inline font-medium' : 'font-medium'}>
          Weddings & Events
        </span>
        <span
          className={`text-[9px] uppercase px-1.5 py-0.2 rounded-full font-bold tracking-wider ${
            activeProduct === 'weddings'
              ? isDark
                ? 'bg-slate-950/20 text-slate-900'
                : 'bg-amber-500/15 text-[#8c6d1f]'
              : isDark
              ? 'bg-amber-400/20 text-amber-300'
              : 'bg-amber-500/20 text-[#85651c]'
          }`}
        >
          PREMIUM
        </span>
      </button>
    </div>
  );
};
