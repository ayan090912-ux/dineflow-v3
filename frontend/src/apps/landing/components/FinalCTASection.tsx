import React from 'react';
import { ArrowRight } from 'lucide-react';

interface FinalCTASectionProps {
  onStartTrial: () => void;
}

export const FinalCTASection: React.FC<FinalCTASectionProps> = ({ onStartTrial }) => {
  return (
    <section className="relative w-full py-24 sm:py-32 border-t border-white/[0.06] overflow-hidden">
      {/* Subtle radial ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] pointer-events-none rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(16,185,129,0.1) 70%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 text-center">
        <h2 className="text-[2.25rem] sm:text-[3.25rem] font-semibold text-white tracking-[-0.03em] leading-[1.1]">
          Ready to put your restaurant online?
        </h2>

        <p className="mt-5 text-[15px] sm:text-[17px] text-white/75 leading-relaxed max-w-2xl mx-auto">
          Create your restaurant, connect your operations, and give your customers a better way to order.
        </p>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onStartTrial}
            className="group inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-[15px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-2xl shadow-black/80 border border-white/[0.16]"
            style={{ background: 'linear-gradient(to bottom, #2E2E2E, #111111)' }}
          >
            <span>Create your restaurant</span>
            <ArrowRight className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
