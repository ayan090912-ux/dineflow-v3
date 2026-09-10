import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { DinelyLogo } from '../../../packages/ui';

interface LandingNavbarProps {
  currentUser?: any;
  onStartTrial: () => void;
  onLogin: () => void;
  onOpenWorkspace: () => void;
  onNavigateSection: (sectionId: string) => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({
  currentUser,
  onStartTrial,
  onLogin,
  onOpenWorkspace,
  onNavigateSection,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Monitor scroll for subtle background blur increase
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'Product', id: 'product' },
    { label: 'Solutions', id: 'solutions' },
    { label: 'How it works', id: 'how-it-works' },
  ];

  const handleLinkClick = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    onNavigateSection(sectionId);
  };

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0b0d11]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-lg shadow-black/40 py-3.5'
            : 'bg-transparent py-5 sm:py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 flex items-center justify-between">
          {/* Canonical Dinely Brand */}
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

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2" aria-label="Main navigation">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-1.5 backdrop-blur-xl border border-white/[0.08]">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={(e) => handleLinkClick(e, link.id)}
                  className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.10] hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Auth / Workspace CTAs */}
            <div className="flex items-center gap-2 ml-3">
              {currentUser ? (
                <button
                  type="button"
                  onClick={onOpenWorkspace}
                  className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-white/[0.14] shadow-sm shadow-black/60"
                  style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                >
                  My Workspace
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="rounded-full px-4 py-2 text-[13px] font-medium text-white/75 transition-colors hover:text-white cursor-pointer bg-transparent border-none"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={onStartTrial}
                    className="group inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-white/[0.14] shadow-sm shadow-black/60"
                    style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                  >
                    <span>Create your restaurant</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </>
              )}
            </div>
          </nav>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.08] md:hidden cursor-pointer text-white"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside
            className="fixed right-0 top-0 z-40 flex h-full w-72 flex-col bg-[#0b0d11]/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl transition-transform duration-300 ease-out"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col gap-1.5 px-6 pt-24">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={(e) => handleLinkClick(e, link.id)}
                  className="rounded-xl px-4 py-3 text-[15px] font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Mobile Drawer Bottom CTAs */}
            <div className="mt-auto px-6 pb-10 flex flex-col gap-3">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenWorkspace();
                  }}
                  className="w-full rounded-full py-3 text-center text-[14px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer border border-white/[0.14]"
                  style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                >
                  My Workspace
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogin();
                    }}
                    className="w-full rounded-full py-2.5 text-center text-[14px] font-medium text-white/75 hover:text-white transition-colors bg-white/[0.05] border border-white/[0.08] cursor-pointer"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onStartTrial();
                    }}
                    className="w-full rounded-full py-3 text-center text-[14px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer border border-white/[0.14]"
                    style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                  >
                    Create your restaurant
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
