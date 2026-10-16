import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  QrCode,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronDown,
  Calendar,
  Users,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Search,
  Wine,
  Lock,
  ChefHat,
  Check,
  Copy,
  Smartphone,
  Flame,
  Menu,
  X,
  Store,
  Layers,
  Heart,
  Crown
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { WeddingAccessRequest } from '../../packages/types';
import { DinelyLogo, ProductSwitcher, Button, Modal } from '../../packages/ui';

interface WeddingLandingPageProps {
  onNavigateHome?: () => void;
  onNavigateOrganizerLogin?: () => void;
  onNavigateOrganizerDashboard?: () => void;
  onOpenDashboard?: () => void;
  onNavigate?: (path: string) => void;
  currentUser?: any;
}

interface SampleDish {
  id: string;
  name: string;
  category: string;
  description: string;
  badge?: string;
  dietary: 'VEG' | 'NON_VEG' | 'VEGAN';
}

const SAMPLE_DISHES: SampleDish[] = [
  {
    id: 'd1',
    name: 'Pan-Seared Chilean Sea Bass',
    category: 'Mains',
    description: 'Crisp skin, saffron citrus beurre blanc, baby fennel & heirloom vegetables',
    badge: 'Chef Signature',
    dietary: 'NON_VEG',
  },
  {
    id: 'd2',
    name: 'Saffron & Wild Truffle Arancini',
    category: 'Appetizers',
    description: 'Aged carnaroli rice, black winter truffle essence & smoked san marzano coulis',
    badge: 'Popular',
    dietary: 'VEG',
  },
  {
    id: 'd3',
    name: 'Royal Dum Gosht Biryani',
    category: 'Mains',
    description: 'Slow-braised heritage cuts, 24-month aged basmati, saffron pot sealed with pastry',
    badge: 'Banquet Classic',
    dietary: 'NON_VEG',
  },
  {
    id: 'd4',
    name: 'Rosewater & Cardamom Panna Cotta',
    category: 'Desserts',
    description: 'Silken cream infused with damask rosewater, caramelized pistachio crunch',
    badge: 'Delight',
    dietary: 'VEG',
  },
  {
    id: 'd5',
    name: 'Smoked Lavender French 75',
    category: 'Bar',
    description: 'Artisan botanical gin, champagne brut, fresh lemon & charred lavender smoke',
    badge: 'Signature Cocktail',
    dietary: 'VEGAN',
  },
];

export const WeddingLandingPage: React.FC<WeddingLandingPageProps> = ({
  onNavigateHome,
  onNavigateOrganizerLogin,
  onNavigateOrganizerDashboard,
  onOpenDashboard,
  onNavigate,
  currentUser,
}) => {
  // Navigation & Scroll states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Application Form State
  const [formData, setFormData] = useState({
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    weddingName: '',
    eventType: 'WEDDING',
    eventDate: '',
    startTime: '18:00',
    endTime: '23:30',
    venueName: '',
    venueCity: '',
    estimatedGuestCount: 150,
    cateringNotes: '',
    cateringRestaurantId: '',
    additionalRequirements: '',
    notes: '',
  });

  const [formStep, setFormStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedApplication, setSubmittedApplication] = useState<{
    requestId: string;
    lifecycleStatus: string;
    message: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Status Lookup State
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<WeddingAccessRequest | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Active Organizer Workspaces Check
  const [myWorkspaces, setMyWorkspaces] = useState<any[]>([]);

  // Interactive Guest Preview Tab
  const [activeMenuCategory, setActiveMenuCategory] = useState<string>('Mains');

  // Monitor scroll for subtle background blur increase
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Check active workspaces for logged-in user
  useEffect(() => {
    if (currentUser?.email) {
      api.getMyWeddingWorkspaces(currentUser.email)
        .then((res) => setMyWorkspaces(res.workspaces || []))
        .catch(() => setMyWorkspaces([]));
    }
  }, [currentUser]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError(null);
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.applicantName.trim()) {
        setFormError('Please enter your full name.');
        return false;
      }
      if (!formData.applicantEmail.trim() || !formData.applicantEmail.includes('@')) {
        setFormError('Please enter a valid email address.');
        return false;
      }
      if (!formData.applicantPhone.trim()) {
        setFormError('Please provide a contact phone number or WhatsApp.');
        return false;
      }
    } else if (step === 2) {
      if (!formData.weddingName.trim()) {
        setFormError('Please provide the celebration title (e.g., Vivian & Julian Wedding).');
        return false;
      }
      if (!formData.eventDate) {
        setFormError('Please select the celebration date.');
        return false;
      }
    } else if (step === 3) {
      if (!formData.venueName.trim()) {
        setFormError('Please provide the venue or banquet hall name.');
        return false;
      }
      if (!formData.venueCity.trim()) {
        setFormError('Please provide the city where the event will take place.');
        return false;
      }
    }
    setFormError(null);
    return true;
  };

  const handleNextStep = () => {
    if (validateStep(formStep)) {
      setFormStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handlePrevStep = () => {
    setFormError(null);
    setFormStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await api.submitWeddingRequest({
        ...formData,
        estimatedGuestCount: Number(formData.estimatedGuestCount) || 100,
      });

      setSubmittedApplication({
        requestId: res.requestId,
        lifecycleStatus: res.lifecycleStatus || 'SUBMITTED',
        message: res.message || 'Your wedding ordering application has been successfully submitted.',
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit application. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLookupStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);

    if (!lookupId.trim()) {
      setLookupError('Please enter your Application Reference ID (e.g., wreq-...).');
      return;
    }

    setLookupLoading(true);
    try {
      const data = await api.getWeddingRequestStatus(lookupId.trim(), lookupEmail.trim() || undefined);
      setLookupResult(data);
    } catch (err: any) {
      setLookupError(err.message || 'Unable to locate application. Please check your reference ID.');
    } finally {
      setLookupLoading(false);
    }
  };

  const copyRequestId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const scrollToApply = () => {
    setMobileMenuOpen(false);
    const el = document.getElementById('wedding-apply-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = () => {
    setMobileMenuOpen(false);
    const el = document.getElementById('how-it-works-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const navigateHome = () => {
    if (onNavigateHome) onNavigateHome();
    else if (onNavigate) onNavigate('/');
    else window.location.href = '/';
  };

  const navigateDashboard = () => {
    if (onNavigateOrganizerDashboard) onNavigateOrganizerDashboard();
    else if (onOpenDashboard) onOpenDashboard();
    else if (onNavigate) onNavigate('/weddings/dashboard');
    else window.location.href = '/weddings/dashboard';
  };

  const navigateOrganizerLogin = () => {
    if (onNavigateOrganizerLogin) onNavigateOrganizerLogin();
    else if (onNavigate) onNavigate('/weddings/login');
    else window.location.href = '/weddings/login';
  };

  return (
    <div className="min-h-screen w-full bg-[#0b0d11] text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans antialiased">
      {/* ========================================================================= */}
      {/* 1. CANONICAL DINELY STICKY NAVIGATION BAR */}
      {/* ========================================================================= */}
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0b0d11]/90 backdrop-blur-xl border-b border-white/[0.08] shadow-lg shadow-black/40 py-3.5'
            : 'bg-[#0b0d11]/60 backdrop-blur-md border-b border-white/[0.06] py-4 sm:py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Canonical Dinely Brand */}
            <button
              type="button"
              onClick={navigateHome}
              className="flex items-center gap-2.5 cursor-pointer bg-transparent border-none text-white hover:opacity-95 transition-opacity p-0"
              aria-label="Dinely Home"
            >
              <DinelyLogo size="md" />
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Weddings &amp; Events
              </span>
            </button>

            {/* Canonical Dual-Product Switcher */}
            <div className="hidden sm:flex items-center">
              <ProductSwitcher
                activeProduct="weddings"
                theme="dark"
                onSwitch={(p) => {
                  if (p === 'restaurants') navigateHome();
                }}
              />
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2" aria-label="Weddings navigation">
            <div className="flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-1.5 backdrop-blur-xl border border-white/[0.08]">
              <button
                type="button"
                onClick={scrollToHowItWorks}
                className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.10] hover:text-white cursor-pointer bg-transparent border-none"
              >
                How it works
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('guest-experience-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.10] hover:text-white cursor-pointer bg-transparent border-none"
              >
                Guest Experience
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('kitchen-connection-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.10] hover:text-white cursor-pointer bg-transparent border-none"
              >
                Connected Kitchen
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('celebrations-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-all duration-150 hover:bg-white/[0.10] hover:text-white cursor-pointer bg-transparent border-none"
              >
                Celebrations
              </button>
            </div>

            {/* Auth / Workspace CTAs */}
            <div className="flex items-center gap-2 ml-3">
              <button
                type="button"
                onClick={navigateOrganizerLogin}
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-amber-300 transition-colors hover:text-amber-200 hover:bg-amber-400/[0.08] cursor-pointer bg-transparent border border-amber-400/30 flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Organizer Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => setTrackModalOpen(true)}
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-white/75 transition-colors hover:text-white hover:bg-white/[0.08] cursor-pointer bg-transparent border border-white/[0.10]"
              >
                Track Request
              </button>
              {myWorkspaces.length > 0 ? (
                <button
                  type="button"
                  onClick={navigateDashboard}
                  className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-amber-400/30 shadow-sm shadow-black/60 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={scrollToApply}
                  className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-amber-400/30 shadow-sm shadow-black/60 flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                >
                  <span>Plan Your Event</span>
                  <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
                </button>
              )}
            </div>
          </nav>

          {/* Mobile Switcher & Menu Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ProductSwitcher
              activeProduct="weddings"
              theme="dark"
              compact
              onSwitch={(p) => {
                if (p === 'restaurants') navigateHome();
              }}
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-white/[0.06] text-white/80 border border-white/[0.1] cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden px-5 pt-3 pb-5 border-t border-white/[0.08] bg-[#0b0d11]/95 backdrop-blur-2xl space-y-2 animate-fadeIn">
            <button
              type="button"
              onClick={scrollToHowItWorks}
              className="w-full text-left py-2 px-3 text-sm text-white/80 hover:text-white rounded-lg hover:bg-white/[0.05]"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                const el = document.getElementById('guest-experience-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full text-left py-2 px-3 text-sm text-white/80 hover:text-white rounded-lg hover:bg-white/[0.05]"
            >
              Guest Experience
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                const el = document.getElementById('kitchen-connection-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full text-left py-2 px-3 text-sm text-white/80 hover:text-white rounded-lg hover:bg-white/[0.05]"
            >
              Connected Kitchen
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                const el = document.getElementById('celebrations-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full text-left py-2 px-3 text-sm text-white/80 hover:text-white rounded-lg hover:bg-white/[0.05]"
            >
              Celebrations
            </button>
            <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigateOrganizerLogin();
                }}
                className="w-full py-2.5 text-center text-xs font-medium text-amber-300 border border-amber-400/30 rounded-xl bg-amber-400/[0.06] flex items-center justify-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Organizer Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTrackModalOpen(true);
                }}
                className="w-full py-2.5 text-center text-xs font-medium text-white/80 border border-white/[0.12] rounded-xl bg-white/[0.04]"
              >
                Track Existing Request
              </button>
              <button
                type="button"
                onClick={scrollToApply}
                className="w-full py-2.5 text-center text-xs font-semibold text-white rounded-xl border border-amber-400/30"
                style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
              >
                Plan your wedding experience &rarr;
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 2. SPLIT ASYMMETRIC EDITORIAL HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative w-full overflow-hidden select-none pb-16 lg:pb-24 pt-8 sm:pt-14 border-b border-white/[0.06]">
        {/* Atmosphere scrim ensuring crisp contrast */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212, 175, 55, 0.07), transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
            {/* Left Column: Eyebrow, Headline, Copy, Primary CTAs */}
            <div className="lg:col-span-7">
              {/* Eyebrow Label */}
              <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3.5 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>ELEVATED DINING FOR YOUR MOST IMPORTANT DAY</span>
              </div>

              {/* Striking Two-Line Headline */}
              <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
                Every table has a story.
                <br />
                <span className="text-amber-200/90 font-serif italic font-normal">
                  Every order, beautifully connected.
                </span>
              </h1>

              {/* Supporting Description */}
              <p className="mt-5 text-[15px] sm:text-[16px] leading-relaxed text-white/75 max-w-lg">
                Give your wedding guests a seamless way to explore the menu and order from their table. Dinely connects every QR order to your catering team and kitchen in real time.
              </p>

              {/* Primary & Secondary CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <button
                  type="button"
                  onClick={scrollToApply}
                  className="group inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-xl shadow-black/60 border border-amber-400/30"
                  style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                >
                  <span>Plan your wedding experience</span>
                  <ArrowRight className="h-4 w-4 text-amber-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>

                <button
                  type="button"
                  onClick={scrollToHowItWorks}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-medium text-white/85 transition-all duration-200 hover:text-white hover:bg-white/[0.08] cursor-pointer bg-white/[0.04] backdrop-blur-md border border-white/[0.10]"
                >
                  <span>Explore how it works</span>
                  <ChevronDown className="h-4 w-4 text-white/60" />
                </button>
              </div>

              {/* Trust Metrics in Dinely's Clean Style */}
              <div className="mt-10 pt-6 grid grid-cols-3 gap-4 border-t border-white/[0.08] text-left">
                <div>
                  <p className="text-[14px] sm:text-[15px] font-semibold text-white">Zero Downloads</p>
                  <p className="text-[11.5px] text-white/50 mt-0.5">Instant camera QR scan on iOS & Android</p>
                </div>
                <div>
                  <p className="text-[14px] sm:text-[15px] font-semibold text-white">Real-Time KDS</p>
                  <p className="text-[11.5px] text-white/50 mt-0.5">Direct ticket routing to catering kitchen line</p>
                </div>
                <div>
                  <p className="text-[14px] sm:text-[15px] font-semibold text-white">Custom Standees</p>
                  <p className="text-[11.5px] text-white/50 mt-0.5">Print-ready designer QR cards for each table</p>
                </div>
              </div>
            </div>

            {/* Right Column: Immersive Banquet Visual with Real Product Artifacts */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.12] shadow-2xl bg-[#12151b] aspect-[4/3] sm:aspect-[5/4] lg:aspect-[4/3] group">
                <img
                  src="/images/wedding-hero.jpg"
                  alt="Luxury candlelit wedding banquet dinner"
                  className="w-full h-full object-cover object-center filter brightness-[0.88] contrast-[1.05]"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d11]/80 via-transparent to-black/30 pointer-events-none" />

                {/* Floating Product Preview 1: Table Standee Card (Top Left) */}
                <div
                  className="absolute top-4 left-4 max-w-[210px] sm:max-w-[220px] rounded-xl p-3 border border-white/[0.14] backdrop-blur-xl shadow-2xl transition-transform hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, rgba(20,24,32,0.85) 0%, rgba(11,13,17,0.92) 100%)' }}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-amber-400 block leading-none">
                        TABLE 04
                      </span>
                      <span className="text-[12px] font-semibold text-white truncate block mt-0.5">
                        Garden Gazebo
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/60 leading-tight">
                    Eleanor &amp; Julian Banquet · Touchless table ordering
                  </p>
                </div>

                {/* Floating Product Preview 2: Live Kitchen Ticket Sync (Bottom Right) */}
                <div
                  className="absolute bottom-4 right-4 max-w-[240px] sm:max-w-[250px] rounded-xl p-3.5 border border-white/[0.14] backdrop-blur-xl shadow-2xl text-white"
                  style={{ background: 'linear-gradient(135deg, rgba(20,24,32,0.90) 0%, rgba(11,13,17,0.95) 100%)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-amber-300 font-semibold bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                      TABLE 04 · PASS
                    </span>
                    <span className="text-[9.5px] font-mono text-emerald-400 flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE KDS
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-white leading-snug">
                    2x Pan-Seared Chilean Sea Bass
                  </p>
                  <p className="text-[11px] text-amber-200/70 italic mt-0.5">
                    "Gluten-free course for bride’s mother"
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-white/50">
                    <span>Chef: Plating</span>
                    <span className="font-mono text-white/80">#W-204 · 04:12</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. HOW IT WORKS (3-STEP BANQUET PIPELINE) */}
      {/* ========================================================================= */}
      <section id="how-it-works-section" className="relative w-full py-20 sm:py-28 scroll-mt-20 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
          {/* Section Header */}
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3">
              A SYNCHRONIZED JOURNEY
            </div>
            <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
              How wedding dining operates on Dinely.
            </h2>
            <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
              From tabletop placement to the catering kitchen pass, every detail is coordinated so your guests enjoy effortless, dignified hospitality.
            </p>
          </div>

          {/* 3 Steps Grid */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Step 1 */}
            <div className="relative rounded-2xl p-6 sm:p-7 border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[2rem] font-mono font-bold text-white/20">01</span>
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-amber-300">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                </div>
                <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                  Personalize the wedding experience
                </h3>
                <p className="text-[13px] text-white/65 leading-relaxed">
                  Curate your banquet courses, signature cocktails, dietary options, and welcome message inside your private host studio.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-white/[0.06] text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full menu control &amp; course pacing</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-2xl p-6 sm:p-7 border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[2rem] font-mono font-bold text-white/20">02</span>
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-amber-300">
                    <QrCode className="h-4.5 w-4.5" />
                  </div>
                </div>
                <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                  Place a QR code at each table
                </h3>
                <p className="text-[13px] text-white/65 leading-relaxed">
                  Generate high-resolution standees matched to your banquet tables. Guests simply point their smartphone camera—no app downloads required.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-white/[0.06] text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Instant camera launch on any phone</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-2xl p-6 sm:p-7 border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[2rem] font-mono font-bold text-white/20">03</span>
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-amber-300">
                    <ChefHat className="h-4.5 w-4.5" />
                  </div>
                </div>
                <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                  Send guest orders directly to the kitchen
                </h3>
                <p className="text-[13px] text-white/65 leading-relaxed">
                  Guest course selections flow straight to the catering kitchen display with table tags and allergy notes, keeping service synchronized.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-white/[0.06] text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live station tickets &amp; plating status</span>
              </div>
            </div>
          </div>

          {/* Unified Banquet Flow Banner */}
          <div className="mt-12 rounded-2xl p-6 sm:p-8 border border-white/[0.08] bg-white/[0.02] backdrop-blur-md">
            <div className="text-[11px] font-mono uppercase tracking-wider text-white/40 mb-4 text-center sm:text-left">
              Synchronized Banquet Architecture
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex-1 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
                <div className="text-[11px] font-mono text-white/50">01 / HOST STUDIO</div>
                <div className="text-[14px] font-semibold text-white mt-0.5">Organizer Dashboard</div>
                <div className="text-[11.5px] text-white/50">Event &amp; seating setup</div>
              </div>

              <ArrowRight className="h-4 w-4 text-white/30 shrink-0 rotate-90 sm:rotate-0" />

              <div className="flex-1 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
                <div className="text-[11px] font-mono text-amber-400">02 / GUEST TABLE</div>
                <div className="text-[14px] font-semibold text-white mt-0.5">Touchless QR Menu</div>
                <div className="text-[11.5px] text-white/50">Instant order placement</div>
              </div>

              <ArrowRight className="h-4 w-4 text-white/30 shrink-0 rotate-90 sm:rotate-0" />

              <div className="flex-1 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
                <div className="text-[11px] font-mono text-emerald-400">03 / KITCHEN KDS</div>
                <div className="text-[14px] font-semibold text-white mt-0.5">Catering Station Pass</div>
                <div className="text-[11.5px] text-white/50">Real-time dish plating</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. THE GUEST EXPERIENCE SHOWCASE */}
      {/* ========================================================================= */}
      <section id="guest-experience-section" className="relative w-full py-20 sm:py-28 scroll-mt-20 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Editorial Story */}
            <div className="lg:col-span-6 space-y-6">
              <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold">
                REFINED GUEST TOUCHPOINT
              </div>
              <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
                A bespoke digital menu in every guest's hand.
              </h2>
              <p className="text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
                When guests scan their table QR code, they are greeted by an editorial digital banquet menu configured specifically for your celebration. They can comfortably browse courses, specify dietary preferences, and send orders without flagging down busy servers.
              </p>

              {/* Plated Course Visual Banner */}
              <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-xl relative aspect-[16/9] sm:aspect-[2/1] my-4 group">
                <img
                  src="/images/wedding-dish.jpg"
                  alt="Michelin-grade wedding banquet course"
                  className="w-full h-full object-cover filter brightness-[0.92] group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end p-4">
                  <div>
                    <span className="text-[10px] font-mono tracking-wider uppercase text-amber-400 font-semibold block">
                      Bespoke Banquet Plating
                    </span>
                    <p className="text-[14px] font-semibold text-white leading-tight mt-0.5">
                      Pan-Seared Chilean Sea Bass with Saffron Citrus Beurre Blanc
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Core Guest Capabilities */}
              <div className="space-y-3.5 pt-2">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                    <Wine className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-semibold text-white">Dietary Harmony &amp; Ingredient Clarity</h4>
                    <p className="text-[12.5px] text-white/60 mt-0.5 leading-relaxed">
                      Clear visual indicators for Vegetarian, Non-Vegetarian, Vegan, and allergens ensure peace of mind for every invited guest.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-semibold text-white">Personalized Couple Greetings</h4>
                    <p className="text-[12.5px] text-white/60 mt-0.5 leading-relaxed">
                      Share heartfelt welcome messages, celebration schedules, and toast recommendations directly inside the menu header.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-semibold text-white">Instant Order Confirmation &amp; Tracking</h4>
                    <p className="text-[12.5px] text-white/60 mt-0.5 leading-relaxed">
                      Guests receive an immediate confirmation card with live preparation status as courses are cooked and plated by the culinary team.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Mobile Device Preview */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-sm rounded-[2.2rem] p-3.5 bg-[#141822] border border-white/[0.14] shadow-2xl">
                <div className="rounded-[1.8rem] overflow-hidden bg-[#0d0f14] border border-white/[0.08] text-white">
                  {/* Mobile Header */}
                  <div className="bg-[#12151c] text-white p-4 text-center border-b border-white/[0.08]">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono text-amber-300">
                      <span>Table 04 · Garden Gazebo</span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-white mt-1.5">
                      Eleanor &amp; Julian Wedding
                    </h3>
                    <p className="text-[11px] text-white/50 italic">
                      Complimentary Banquet Service · Tap to Order
                    </p>
                  </div>

                  {/* Course Category Chips */}
                  <div className="flex gap-1.5 p-3 overflow-x-auto bg-[#0e1117] border-b border-white/[0.06]">
                    {['Mains', 'Appetizers', 'Desserts', 'Bar'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveMenuCategory(cat)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                          activeMenuCategory === cat
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'bg-white/[0.05] text-white/65 hover:bg-white/[0.09]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Course Dish List Preview */}
                  <div className="p-3.5 space-y-2.5 max-h-72 overflow-y-auto">
                    {SAMPLE_DISHES.filter((d) => activeMenuCategory === 'All' || d.category === activeMenuCategory).map((dish) => (
                      <div
                        key={dish.id}
                        className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1 hover:border-white/[0.12] transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dish.dietary === 'NON_VEG' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                              <h5 className="text-[12.5px] font-semibold text-white">{dish.name}</h5>
                            </div>
                            <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{dish.description}</p>
                          </div>
                          {dish.badge && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-amber-400/15 text-amber-300 shrink-0">
                              {dish.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Floating Mobile Cart Preview */}
                  <div className="p-3 bg-[#12151c] border-t border-white/[0.08]">
                    <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-400/30 text-white flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-mono font-bold text-[10px] flex items-center justify-center">
                          2
                        </span>
                        <span className="text-[11px] font-medium text-amber-100">Table 04 Course Order</span>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-300">
                        Send to Kitchen &rarr;
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. CONNECTED KITCHEN INTEGRATION (THE KDS PIPELINE) */}
      {/* ========================================================================= */}
      <section id="kitchen-connection-section" className="relative w-full py-20 sm:py-28 scroll-mt-20 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3">
              KITCHEN PIPELINE INTEGRATION
            </div>
            <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
              Connected directly to the catering kitchen.
            </h2>
            <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
              Dinely Weddings is not an isolated brochure—it integrates with the actual Dinely Kitchen Display System (KDS), ensuring high-capacity banquets stay completely synchronized.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <Smartphone className="w-4 h-4" />
                <span>1. Table-Bound Sessions</span>
              </div>
              <h4 className="text-[15px] font-semibold text-white">Guaranteed Table Isolation</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                Every table QR is bound to the wedding workspace and assigned catering restaurant. Orders cannot stray to unrelated tables or outside locations.
              </p>
            </div>

            <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <Flame className="w-4 h-4" />
                <span>2. Real-Time KDS Tickets</span>
              </div>
              <h4 className="text-[15px] font-semibold text-white">Distinct Wedding Badging</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                Kitchen line terminals receive tickets clearly tagged with the celebration title, table number, and dietary modifications for flawless plating.
              </p>
            </div>

            <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <ChefHat className="w-4 h-4" />
                <span>3. Live Chef Status Updates</span>
              </div>
              <h4 className="text-[15px] font-semibold text-white">Course Bump-to-Pass</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                When chefs mark courses cooking or ready, guest screens reflect the real-time status. Table service coordinates smoothly without chaos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. DESIGNED FOR EVERY CELEBRATION */}
      {/* ========================================================================= */}
      <section id="celebrations-section" className="relative w-full py-20 sm:py-28 scroll-mt-20 border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3">
              VERSATILE EVENT CAPABILITIES
            </div>
            <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
              Designed for every scale of celebration.
            </h2>
            <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
              From grand ballroom banquets to intimate courtyard dinners and multi-day festivities.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <div className="group rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-amber-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="text-[15px] font-semibold text-white">Grand Banquets &amp; Receptions</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                Multi-course ballroom dining with synchronized course pacing across 50+ guest banquet tables.
              </p>
            </div>

            <div className="group rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-amber-400 flex items-center justify-center">
                <Heart className="w-5 h-5" />
              </div>
              <h4 className="text-[15px] font-semibold text-white">Engagements &amp; Dinners</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                Warm, ambient dining where guests explore artisan courses and cellar selections at their own rhythm.
              </p>
            </div>

            <div className="group rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-amber-400 flex items-center justify-center">
                <Wine className="w-5 h-5" />
              </div>
              <h4 className="text-[15px] font-semibold text-white">Sangeet &amp; Cocktail Soirées</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                High-speed bar service and tapas delivered right to lounge seating and cocktail tables.
              </p>
            </div>

            <div className="group rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-amber-400 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <h4 className="text-[15px] font-semibold text-white">Multi-Day Celebrations</h4>
              <p className="text-[13px] text-white/60 leading-relaxed">
                Welcome dinners, mehendi brunches, and farewell breakfasts managed under a single host workspace.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. PROGRESSIVE MULTI-STEP WEDDING APPLICATION FORM */}
      {/* ========================================================================= */}
      <section id="wedding-apply-section" className="relative w-full py-20 sm:py-28 scroll-mt-20 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <div className="text-center space-y-3 mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-mono font-medium text-amber-300">
              <Lock className="w-3.5 h-3.5" />
              <span>PRIVATE ACCESS BY APPROVAL</span>
            </div>
            <h2 className="text-[2rem] sm:text-[2.5rem] font-semibold text-white tracking-tight">
              Plan your wedding experience.
            </h2>
            <p className="text-[14px] sm:text-[15px] text-white/70 max-w-lg mx-auto leading-relaxed">
              Tell us about your celebration. Once approved by our team, your dedicated Wedding Organizer Studio and fulfillment kitchen connection will unlock.
            </p>
          </div>

          {/* Success Screen */}
          {submittedApplication ? (
            <div className="rounded-2xl p-8 bg-[#12151b] border border-white/[0.12] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  Status: {submittedApplication.lifecycleStatus}
                </span>
                <h3 className="text-[20px] font-semibold text-white mt-2">
                  Application Received
                </h3>
                <p className="text-[13px] text-white/70 max-w-md mx-auto">
                  {submittedApplication.message}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#0d0f14] border border-white/[0.08] text-left max-w-md mx-auto space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-white/50">Reference ID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-300">{submittedApplication.requestId}</span>
                    <button
                      type="button"
                      onClick={() => copyRequestId(submittedApplication.requestId)}
                      className="p-1 rounded text-white/50 hover:text-white transition-colors cursor-pointer"
                      title="Copy ID"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Host Email:</span>
                  <span className="font-medium text-white">{formData.applicantEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50">Celebration:</span>
                  <span className="font-medium text-white">{formData.weddingName}</span>
                </div>
              </div>

              <p className="text-[12px] text-white/50">
                Our team reviews each celebration to ensure proper kitchen alignment and menu readiness. You can track this request at any time using your reference ID.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedApplication(null);
                    setFormStep(1);
                  }}
                  className="px-6 py-2.5 rounded-full text-xs font-medium border border-white/[0.12] text-white/75 hover:bg-white/[0.06] cursor-pointer"
                >
                  Submit Another Request
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLookupId(submittedApplication.requestId);
                    setLookupEmail(formData.applicantEmail);
                    setTrackModalOpen(true);
                  }}
                  className="px-6 py-2.5 rounded-full text-xs font-semibold bg-white text-slate-900 shadow-md hover:bg-white/95 cursor-pointer"
                >
                  Track Application Status
                </button>
              </div>
            </div>
          ) : (
            /* Multi-Step Application Form */
            <form
              onSubmit={handleSubmitApplication}
              className="rounded-2xl p-6 sm:p-9 bg-[#12151b] border border-white/[0.12] shadow-2xl space-y-6"
            >
              {/* Progress Indicator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-white/70">
                  <span>Step {formStep} of 4: {formStep === 1 ? 'Host Details' : formStep === 2 ? 'Celebration' : formStep === 3 ? 'Venue & City' : 'Catering & Notes'}</span>
                  <span className="font-mono text-amber-400">{formStep * 25}% Complete</span>
                </div>
                <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 rounded-full"
                    style={{ width: `${formStep * 25}%` }}
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* STEP 1: Host Contact Info */}
              {formStep === 1 && (
                <div className="space-y-4">
                  <div className="border-b border-white/[0.08] pb-3">
                    <h3 className="text-[15px] font-semibold text-white">1. Host &amp; Contact Information</h3>
                    <p className="text-xs text-white/50 mt-0.5">Please provide primary contact information for verification and workspace access.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Applicant / Host Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Eleanor Vance"
                        value={formData.applicantName}
                        onChange={(e) => handleInputChange('applicantName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Contact Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. eleanor@vance-events.com"
                        value={formData.applicantEmail}
                        onChange={(e) => handleInputChange('applicantEmail', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Contact Phone / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +91 98765 43210"
                        value={formData.applicantPhone}
                        onChange={(e) => handleInputChange('applicantPhone', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Celebration Details */}
              {formStep === 2 && (
                <div className="space-y-4">
                  <div className="border-b border-white/[0.08] pb-3">
                    <h3 className="text-[15px] font-semibold text-white">2. Celebration Details</h3>
                    <p className="text-xs text-white/50 mt-0.5">Tell us about the event schedule and banquet timing.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Celebration Title *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Eleanor & Julian Royal Banquet"
                        value={formData.weddingName}
                        onChange={(e) => handleInputChange('weddingName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          Celebration Format
                        </label>
                        <select
                          value={formData.eventType}
                          onChange={(e) => handleInputChange('eventType', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none transition-all"
                        >
                          <option value="WEDDING">Wedding Ceremony &amp; Banquet</option>
                          <option value="RECEPTION">Evening Reception</option>
                          <option value="SANGEET">Sangeet / Musical Soirée</option>
                          <option value="ENGAGEMENT">Engagement Gala</option>
                          <option value="CELEBRATION">Private Celebration</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          Event Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.eventDate}
                          onChange={(e) => handleInputChange('eventDate', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          Service Start Time
                        </label>
                        <input
                          type="time"
                          value={formData.startTime}
                          onChange={(e) => handleInputChange('startTime', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          Service End Time
                        </label>
                        <input
                          type="time"
                          value={formData.endTime}
                          onChange={(e) => handleInputChange('endTime', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Venue & Guest Count */}
              {formStep === 3 && (
                <div className="space-y-4">
                  <div className="border-b border-white/[0.08] pb-3">
                    <h3 className="text-[15px] font-semibold text-white">3. Venue &amp; Guest Count</h3>
                    <p className="text-xs text-white/50 mt-0.5">Specify the destination venue and expected guest attendance.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Venue / Banquet Hall Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. The Grand Ballroom, Taj Palace"
                        value={formData.venueName}
                        onChange={(e) => handleInputChange('venueName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          City *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mumbai, New Delhi, Bengaluru"
                          value={formData.venueCity}
                          onChange={(e) => handleInputChange('venueCity', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          Estimated Guest Count
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="5000"
                          value={formData.estimatedGuestCount}
                          onChange={(e) => handleInputChange('estimatedGuestCount', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Catering & Special Requests */}
              {formStep === 4 && (
                <div className="space-y-4">
                  <div className="border-b border-white/[0.08] pb-3">
                    <h3 className="text-[15px] font-semibold text-white">4. Catering &amp; Special Touches</h3>
                    <p className="text-xs text-white/50 mt-0.5">Provide catering kitchen preferences or special dietary requirements.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Arranged Catering Team or Preferred Restaurant Partner (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. In-house culinary team or THE MAN Banquet Kitchen"
                        value={formData.cateringNotes}
                        onChange={(e) => handleInputChange('cateringNotes', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/80 mb-1.5">
                        Special Dietary Rules, Speech Schedules, or Service Notes (Optional)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Describe special requests, dietary restrictions, course sequences, champagne toasts..."
                        value={formData.notes}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-xs text-white placeholder-slate-500 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Stepper Navigation Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
                {formStep > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="px-5 py-2.5 rounded-full border border-white/[0.12] text-xs font-medium text-white/80 hover:bg-white/[0.06] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                ) : (
                  <div />
                )}

                {formStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-6 py-2.5 rounded-full bg-white text-slate-900 hover:bg-white/95 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-7 py-3 rounded-full bg-white text-slate-900 hover:bg-white/95 text-xs font-semibold uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Wedding Application</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. TRACK APPLICATION MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={trackModalOpen}
        onClose={() => setTrackModalOpen(false)}
        title="Track Application Status"
        description="Check your celebration request review, kitchen assignment, and organizer access."
        maxWidth="lg"
      >
        <form onSubmit={handleLookupStatus} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Application Reference ID *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. wreq-c98a72b14e"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs font-mono text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/80 mb-1.5">
              Registered Email Address (for verification)
            </label>
            <input
              type="email"
              placeholder="e.g. eleanor@vance-events.com"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0f14] border border-[#222734] focus:border-amber-400 text-xs text-white outline-none"
            />
          </div>

          {lookupError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {lookupError}
            </div>
          )}

          <Button
            type="submit"
            variant="brand"
            size="md"
            disabled={lookupLoading}
            className="w-full bg-white hover:bg-white/95 text-slate-900 font-semibold text-xs"
          >
            {lookupLoading ? 'Locating Application...' : 'Check Status'}
          </Button>
        </form>

        {/* Lookup Result View */}
        {lookupResult && (
          <div className="mt-5 p-4 rounded-xl bg-[#0d0f14] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-white">
                {lookupResult.weddingName}
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  lookupResult.lifecycleStatus === 'APPROVED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : lookupResult.lifecycleStatus === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {lookupResult.lifecycleStatus}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium text-white">{lookupResult.eventDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Venue:</span>
                <span className="font-medium text-white">{lookupResult.venueName}, {lookupResult.venueCity}</span>
              </div>
              {lookupResult.cateringRestaurantName && (
                <div className="flex justify-between">
                  <span>Assigned Kitchen:</span>
                  <span className="font-medium text-amber-400">{lookupResult.cateringRestaurantName}</span>
                </div>
              )}
              {lookupResult.reviewNotes && (
                <div className="pt-2 border-t border-white/[0.08] text-[11px] text-white/60">
                  <strong className="text-white/80">Review Notes:</strong> {lookupResult.reviewNotes}
                </div>
              )}
            </div>

            {lookupResult.lifecycleStatus === 'APPROVED' && (
              <div className="pt-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    setTrackModalOpen(false);
                    navigateDashboard();
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  <span>Access Your Wedding Studio</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 9. REFINED GLOBAL DINELY FOOTER */}
      {/* ========================================================================= */}
      <footer className="w-full bg-[#0b0d11] border-t border-white/[0.08] py-14 px-5 sm:px-8 lg:px-12 text-center text-xs text-white/50">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2">
            <DinelyLogo size="sm" />
            <span className="font-semibold text-sm text-white">
              Weddings &amp; Private Events
            </span>
          </div>
          <p className="max-w-md mx-auto text-white/60">
            Elevating wedding and banquet hospitality with quiet digital elegance. Connected directly to professional restaurant kitchens.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-6">
            <button
              type="button"
              onClick={navigateOrganizerLogin}
              className="text-amber-300 font-medium hover:underline bg-transparent border-none cursor-pointer text-xs flex items-center gap-1.5"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Organizer Portal Login</span>
            </button>
            <button
              type="button"
              onClick={navigateHome}
              className="text-amber-400 font-medium hover:underline bg-transparent border-none cursor-pointer text-xs"
            >
              Switch to Restaurant Platform &rarr;
            </button>
            <button
              type="button"
              onClick={() => setTrackModalOpen(true)}
              className="text-white/70 hover:underline bg-transparent border-none cursor-pointer text-xs"
            >
              Track Existing Application
            </button>
          </div>
          <p className="text-[11px] text-white/40 pt-4 font-mono">
            &copy; {new Date().getFullYear()} Dinely Inc. All rights reserved. Multi-tenant restaurant &amp; wedding OS.
          </p>
        </div>
      </footer>
    </div>
  );
};
