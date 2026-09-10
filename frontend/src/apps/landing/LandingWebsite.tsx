import React, { useEffect, useCallback } from 'react';
import { api } from '../../packages/api/client';
import { LandingNavbar } from './components/LandingNavbar';
import { LandingHero } from './components/LandingHero';
import { ProductSection } from './components/ProductSection';
import { SolutionsSection } from './components/SolutionsSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { FinalCTASection } from './components/FinalCTASection';
import { LandingFooter } from './components/LandingFooter';

interface LandingWebsiteProps {
  onStartTrial: (ownerData?: any) => void;
  onLogin: () => void;
  onOpenApp: (app: 'restaurant' | 'waiter' | 'customer' | 'platform') => void;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  currentUser?: any;
}

export const LandingWebsite: React.FC<LandingWebsiteProps> = ({
  onStartTrial,
  onLogin,
  onOpenApp,
  onNavigate,
  onLogout,
  currentUser: propUser,
}) => {
  const currentUser = propUser !== undefined ? propUser : api.getCurrentUser();

  // Smooth scroll to a target section by ID and update URL hash cleanly without query artifacts
  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      const cleanUrl = window.location.pathname + '#' + sectionId;
      window.history.pushState(null, '', cleanUrl);
    }
  }, []);

  // On initial mount: strip any stale query parameters (e.g. ?refresh=true) and handle deep anchor links
  useEffect(() => {
    // 1. Remove unwanted query strings cleanly from browser address bar
    if (window.location.search) {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      window.history.replaceState(null, '', cleanUrl);
    }

    // 2. If a hash exists on load (e.g. #how-it-works), scroll to it smoothly
    if (window.location.hash) {
      const targetId = window.location.hash.replace('#', '');
      const timer = setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleStartTrial = () => {
    onStartTrial();
  };

  const handleOpenWorkspace = () => {
    if (currentUser?.role === 'WAITER') {
      onOpenApp('waiter');
    } else {
      onOpenApp('restaurant');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0b0d11] text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans antialiased">
      {/* 1. Sticky Navigation Bar */}
      <LandingNavbar
        currentUser={currentUser}
        onStartTrial={handleStartTrial}
        onLogin={onLogin}
        onOpenWorkspace={handleOpenWorkspace}
        onNavigateSection={scrollToSection}
      />

      {/* 2. Cinematic Hero Section */}
      <LandingHero
        onStartTrial={handleStartTrial}
        onSeeHowItWorks={() => scrollToSection('how-it-works')}
      />

      {/* 3. Product Section (8 Connected Operational Modules) */}
      <ProductSection />

      {/* 4. Solutions Section (5 Venue Types) */}
      <SolutionsSection />

      {/* 5. How It Works (4-Step Onboarding & Dining Pipeline) */}
      <HowItWorksSection />


      {/* 7. Final Call to Action */}
      <FinalCTASection onStartTrial={handleStartTrial} />

      {/* 8. Global Landing Footer */}
      <LandingFooter onNavigateSection={scrollToSection} />
    </div>
  );
};
