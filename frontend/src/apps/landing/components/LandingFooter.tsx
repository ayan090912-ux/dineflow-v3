import React from 'react';
import { DinelyLogo } from '../../../packages/ui';

interface LandingFooterProps {
  onNavigateSection: (sectionId: string) => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ onNavigateSection }) => {
  const links = [
    { label: 'Product', id: 'product' },
    { label: 'Solutions', id: 'solutions' },
    { label: 'How it works', id: 'how-it-works' },
  ];

  return (
    <footer className="w-full border-t border-white/[0.08] bg-[#07090c] py-14">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Brand & Mission */}
          <div>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (window.location.hash) {
                  window.history.replaceState(null, '', window.location.pathname);
                }
              }}
              className="flex items-center cursor-pointer bg-transparent border-none text-white hover:opacity-95 transition-opacity"
              aria-label="Dinely Home"
            >
              <DinelyLogo size="md" />
            </button>
            <p className="mt-3 text-[13px] text-white/50 max-w-sm leading-relaxed">
              Connected operating platform for restaurant ordering, kitchen dispatch, waiter service, and billing.
            </p>
          </div>

          {/* Clean Navigation Links */}
          <div className="flex flex-wrap items-center gap-6">
            {links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateSection(link.id);
                }}
                className="text-[13px] font-medium text-white/60 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div className="mt-12 pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40">
          <div>&copy; {new Date().getFullYear()} Dinely. All rights reserved.</div>

          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
