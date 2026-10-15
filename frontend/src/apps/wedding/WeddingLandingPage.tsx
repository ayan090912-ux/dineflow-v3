import React, { useState, useEffect } from 'react';
import {
  Heart,
  Sparkles,
  QrCode,
  UtensilsCrossed,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Calendar,
  MapPin,
  Users,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Search,
  ExternalLink,
  Crown,
  Wine,
  Phone,
  Mail,
  FileText,
  Lock,
  Layers,
  ChefHat,
  Check,
  Copy,
  Smartphone,
  Flame,
  ArrowDown
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
    const el = document.getElementById('wedding-apply-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = () => {
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

  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#1c1611] font-sans antialiased selection:bg-[#c5a059]/25 selection:text-[#1c150c]">
      {/* ========================================================================= */}
      {/* 1. REFINED LUXURY TOP NAVIGATION */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#faf7f2]/92 backdrop-blur-md border-b border-[#e8dfd3] py-3.5 px-5 sm:px-10 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand + Experience Switcher */}
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={navigateHome}
              className="flex items-center gap-2.5 cursor-pointer bg-transparent border-none text-left p-0"
              aria-label="Dinely Home"
            >
              <DinelyLogo size="md" />
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-[#efe7da] text-[#7a5e1d] border border-[#dfd0bb]">
                <Crown className="w-3 h-3 text-[#b89033]" />
                <span>Weddings & Events</span>
              </span>
            </button>

            {/* Canonical Dual-Product Switcher */}
            <div className="hidden sm:flex items-center">
              <ProductSwitcher
                activeProduct="weddings"
                theme="light"
                onSwitch={(product) => {
                  if (product === 'restaurants') {
                    navigateHome();
                  }
                }}
              />
            </div>
          </div>

          {/* Quick Anchor Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-[#6e604f]">
            <button
              type="button"
              onClick={scrollToHowItWorks}
              className="hover:text-[#1c1611] transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('guest-experience-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-[#1c1611] transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              Guest Experience
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('kitchen-connection-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-[#1c1611] transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              Kitchen Integration
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('celebrations-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="hover:text-[#1c1611] transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              Celebrations
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            {/* Mobile Switcher */}
            <div className="sm:hidden">
              <ProductSwitcher
                activeProduct="weddings"
                theme="light"
                compact
                onSwitch={(product) => {
                  if (product === 'restaurants') {
                    navigateHome();
                  }
                }}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTrackModalOpen(true)}
              className="border-[#d9cbba] text-[#635442] hover:bg-[#ede3d5] text-xs hidden md:inline-flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-[#a37f26]" />
              <span>Track Request</span>
            </Button>

            {myWorkspaces.length > 0 ? (
              <Button
                variant="brand"
                size="sm"
                onClick={navigateDashboard}
                className="bg-[#1f1912] hover:bg-[#2c241a] text-white font-medium text-xs shadow-md border border-[#c5a059]/40"
              >
                <span>Open Workspace</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5 text-[#d4af37]" />
              </Button>
            ) : (
              <Button
                variant="brand"
                size="sm"
                onClick={scrollToApply}
                className="bg-[#1f1912] hover:bg-[#2c241a] text-white font-medium text-xs shadow-md border border-[#c5a059]/40"
              >
                <span>Plan Your Event</span>
                <ChevronRight className="w-3.5 h-3.5 ml-1 text-[#d4af37]" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. SPLIT ASYMMETRIC EDITORIAL HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-10 pb-16 sm:pt-16 sm:pb-24 px-5 sm:px-10 border-b border-[#e8dfd3]">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/4 -left-20 w-[450px] h-[450px] bg-[#edd9d0]/30 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-10 right-0 w-[550px] h-[550px] bg-[#eadecb]/40 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Editorial Headline & Actions */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-7">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f1e8da] border border-[#ded0ba] text-[11px] font-semibold tracking-wider text-[#85651c] uppercase shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-[#b89033]" />
              <span>ELEVATED DINING FOR YOUR MOST IMPORTANT DAY</span>
            </div>

            {/* Striking Two-Line Headline */}
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-[3.25rem] font-bold text-[#1a140e] tracking-tight leading-[1.12]">
              Every table has a story.{' '}
              <span className="block italic font-normal text-[#8c691c] mt-1 sm:mt-2">
                Every order, beautifully connected.
              </span>
            </h1>

            {/* Supporting Description */}
            <p className="text-base sm:text-lg text-[#5e5141] font-sans leading-relaxed max-w-xl">
              Give your wedding guests a seamless way to explore the menu and order from their table. Dinely connects every QR order to your catering team and kitchen in real time.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                type="button"
                onClick={scrollToApply}
                className="px-7 py-3.5 rounded-full bg-[#1c1611] text-[#f7f2ea] hover:bg-[#2b221a] font-serif font-bold text-xs uppercase tracking-widest shadow-xl shadow-stone-900/15 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border border-[#c5a059]/40 flex items-center justify-center gap-2"
              >
                <span>Plan your wedding experience</span>
                <ArrowRight className="w-4 h-4 text-[#d4af37]" />
              </button>

              <button
                type="button"
                onClick={scrollToHowItWorks}
                className="px-6 py-3.5 rounded-full bg-white text-[#4f4233] font-serif font-semibold text-xs uppercase tracking-wider border border-[#d9ccb9] shadow-sm hover:bg-[#fbf7f0] hover:border-[#bfa780] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Explore how it works</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#8c691c]" />
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-4 grid grid-cols-3 gap-3 border-t border-[#ebdcc9] text-left">
              <div>
                <p className="font-serif font-bold text-base sm:text-lg text-[#1f170e]">0 Downloads</p>
                <p className="text-[11px] text-[#73634f] mt-0.5">Instant camera QR scan on iOS & Android</p>
              </div>
              <div>
                <p className="font-serif font-bold text-base sm:text-lg text-[#1f170e]">Real-Time KDS</p>
                <p className="text-[11px] text-[#73634f] mt-0.5">Direct ticket routing to catering kitchen line</p>
              </div>
              <div>
                <p className="font-serif font-bold text-base sm:text-lg text-[#1f170e]">Custom Standees</p>
                <p className="text-[11px] text-[#73634f] mt-0.5">Print-ready designer QR cards for each table</p>
              </div>
            </div>
          </div>

          {/* Right Column: Immersive Banquet Visual with Floating Live Artifacts */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-3xl overflow-hidden border border-[#d6c4ac] shadow-2xl bg-[#231a12] aspect-[4/3] sm:aspect-[5/4] lg:aspect-[4/3]">
              <img
                src="/images/wedding-hero.jpg"
                alt="Luxury candlelit wedding banquet dinner"
                className="w-full h-full object-cover object-center filter brightness-[0.92] contrast-[1.05]"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#140e09]/80 via-transparent to-black/20" />

              {/* Floating Product Preview 1: Table Standee Card (Top Left) */}
              <div className="absolute top-4 left-4 max-w-[210px] bg-white/90 backdrop-blur-md border border-[#ebdcc9] rounded-2xl p-3 shadow-xl transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-lg bg-[#b89033]/15 text-[#8d6911] flex items-center justify-center">
                    <QrCode className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#9e7d23] block leading-none">
                      Table 04
                    </span>
                    <span className="text-[11px] font-serif font-semibold text-[#292015] truncate block leading-tight">
                      Garden Gazebo
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-[#695844] leading-tight">
                  Eleanor & Julian Banquet · Touchless table ordering
                </p>
              </div>

              {/* Floating Product Preview 2: Live Kitchen Ticket Sync (Bottom Right) */}
              <div className="absolute bottom-4 right-4 max-w-[240px] bg-[#10141b]/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3.5 text-white shadow-2xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-amber-300 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                    💍 TABLE 04 · PASS
                  </span>
                  <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE KDS
                  </span>
                </div>
                <p className="text-xs font-serif font-bold text-white leading-snug">
                  2x Chilean Sea Bass
                </p>
                <p className="text-[10px] text-amber-200/70 italic mt-0.5">
                  "Gluten-free course for bride’s mother"
                </p>
                <div className="mt-2 pt-1.5 border-t border-white/[0.1] flex items-center justify-between text-[10px] text-white/50">
                  <span>Chef: Cooking</span>
                  <span className="font-mono text-white/70">#W-204</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. HOW IT WORKS (THE 3-STEP CEREMONY) */}
      {/* ========================================================================= */}
      <section id="how-it-works-section" className="py-20 bg-white border-b border-[#e8dfd3] px-5 sm:px-10">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-[11px] uppercase tracking-widest font-mono font-bold text-[#a37f26]">
              A Synchronized Journey
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f170e]">
              How Wedding Digital Dining Operates
            </h2>
            <p className="text-sm text-[#665744] leading-relaxed">
              From tabletop placement to the hot kitchen pass, every detail is coordinated so your guests enjoy effortless hospitality.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="rounded-3xl p-8 bg-[#faf7f2] border border-[#ebdcc9] space-y-4 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#efe5d5] border border-[#ded0bb] text-[#7a5e1d] font-serif font-bold text-lg flex items-center justify-center shadow-sm">
                01
              </div>
              <h3 className="font-serif font-bold text-xl text-[#241a0f]">
                Personalize the Wedding Experience
              </h3>
              <p className="text-xs sm:text-sm text-[#665541] leading-relaxed">
                Curate your banquet courses, signature cocktails, dietary options, and welcome message inside your private host studio.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#8c691c] flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Full menu control & course pacing</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-3xl p-8 bg-[#faf7f2] border border-[#ebdcc9] space-y-4 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#efe5d5] border border-[#ded0bb] text-[#7a5e1d] font-serif font-bold text-lg flex items-center justify-center shadow-sm">
                02
              </div>
              <h3 className="font-serif font-bold text-xl text-[#241a0f]">
                Place a QR Code at Each Table
              </h3>
              <p className="text-xs sm:text-sm text-[#665541] leading-relaxed">
                Generate high-resolution standees matched to your banquet tables. Guests simply point their phone camera—no app downloads required.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#8c691c] flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Instant camera launch on any smartphone</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="rounded-3xl p-8 bg-[#faf7f2] border border-[#ebdcc9] space-y-4 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#efe5d5] border border-[#ded0bb] text-[#7a5e1d] font-serif font-bold text-lg flex items-center justify-center shadow-sm">
                03
              </div>
              <h3 className="font-serif font-bold text-xl text-[#241a0f]">
                Send Guest Orders to the Kitchen
              </h3>
              <p className="text-xs sm:text-sm text-[#665541] leading-relaxed">
                Guest course choices flow straight to the catering kitchen display with table tags and allergy notes, keeping service prompt and graceful.
              </p>
              <div className="pt-2 text-[11px] font-semibold text-[#8c691c] flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Synchronized line tickets & chef status</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. THE GUEST EXPERIENCE SHOWCASE */}
      {/* ========================================================================= */}
      <section id="guest-experience-section" className="py-20 px-5 sm:px-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Side: Editorial Story */}
          <div className="lg:col-span-6 space-y-6">
            <span className="text-[11px] uppercase tracking-widest font-mono font-bold text-[#a37f26]">
              Refined Guest Touchpoint
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f170e] leading-snug">
              A Bespoke Digital Menu Built for Honored Guests
            </h2>
            <p className="text-sm sm:text-base text-[#635340] leading-relaxed">
              When guests scan their table QR code, they are greeted by an editorial digital banquet menu designed specifically for your celebration. They can comfortably browse courses, specify dietary preferences, and send orders without flagging down busy servers.
            </p>

            {/* Plated Course Visual Banner */}
            <div className="rounded-2xl overflow-hidden border border-[#ebdcc9] shadow-md relative aspect-[16/9] sm:aspect-[2/1] my-4 group">
              <img
                src="/images/wedding-dish.jpg"
                alt="Michelin-grade wedding banquet course"
                className="w-full h-full object-cover filter brightness-[0.96] group-hover:scale-105 transition-transform duration-700"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-4">
                <div className="text-white">
                  <span className="text-[10px] font-mono tracking-wider uppercase text-amber-300 font-bold block">
                    Bespoke Banquet Plating
                  </span>
                  <p className="font-serif font-bold text-sm text-white leading-tight">
                    Pan-Seared Chilean Sea Bass with Saffron Citrus Beurre Blanc
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-white border border-[#ebdcc9] flex items-start gap-3.5 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#f5ede0] border border-[#dfd0ba] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <Wine className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#261c10]">Dietary Harmony & Ingredient Clarity</h4>
                  <p className="text-xs text-[#6e5e4b] mt-0.5 leading-relaxed">
                    Clear visual indicators for Vegetarian, Non-Vegetarian, Vegan, and allergens ensure peace of mind for every invited guest.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#ebdcc9] flex items-start gap-3.5 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#f5ede0] border border-[#dfd0ba] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <Heart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#261c10]">Personalized Couple Messages</h4>
                  <p className="text-xs text-[#6e5e4b] mt-0.5 leading-relaxed">
                    Share heartfelt greetings, schedule details, and toast recommendations directly inside the header of your banquet menu.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#ebdcc9] flex items-start gap-3.5 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-[#f5ede0] border border-[#dfd0ba] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#261c10]">Instant Order Tracking & Confirmation</h4>
                  <p className="text-xs text-[#6e5e4b] mt-0.5 leading-relaxed">
                    Guests receive an immediate order confirmation card with a live preparation badge as courses are cooked and plated.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Interactive Mobile Device Preview */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-sm rounded-[2.5rem] p-3.5 bg-[#1a140e] border-4 border-[#3a2d21] shadow-2xl">
              <div className="rounded-[2rem] overflow-hidden bg-[#faf7f2] border border-[#ebdcc9] text-[#1c1611]">
                {/* Mobile Header */}
                <div className="bg-[#241a11] text-white p-4 text-center border-b border-[#3b2d1f]">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#3b2d1f] text-[10px] font-mono text-amber-300">
                    <span>Table 04 · Garden Gazebo</span>
                  </div>
                  <h3 className="font-serif text-base font-bold text-white mt-1">
                    Eleanor & Julian Wedding
                  </h3>
                  <p className="text-[10px] text-amber-200/60 italic font-serif">
                    Welcome Honored Guests · Complimentary Banquet Service
                  </p>
                </div>

                {/* Course Category Chips */}
                <div className="flex gap-1.5 p-3 overflow-x-auto bg-white border-b border-[#ebdcc9]">
                  {['Mains', 'Appetizers', 'Desserts', 'Bar'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveMenuCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[11px] font-serif font-semibold whitespace-nowrap transition-all ${
                        activeMenuCategory === cat
                          ? 'bg-[#241a11] text-amber-200 shadow-sm'
                          : 'bg-[#faf7f2] text-[#6e5e4b] hover:bg-[#ede4d6]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Course Dish List Preview */}
                <div className="p-3.5 space-y-3 max-h-72 overflow-y-auto">
                  {SAMPLE_DISHES.filter((d) => activeMenuCategory === 'All' || d.category === activeMenuCategory).map((dish) => (
                    <div
                      key={dish.id}
                      className="p-3 rounded-xl bg-white border border-[#e8ddce] space-y-1 hover:border-[#bfa780] transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${dish.dietary === 'NON_VEG' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            <h5 className="font-serif font-bold text-xs text-[#20180f]">{dish.name}</h5>
                          </div>
                          <p className="text-[10px] text-[#6e5e4b] mt-0.5 leading-snug">{dish.description}</p>
                        </div>
                        {dish.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-[#f3ebd9] text-[#7a5e1d] shrink-0">
                            {dish.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Floating Mobile Cart Preview */}
                <div className="p-3 bg-white border-t border-[#ebdcc9]">
                  <div className="p-2.5 rounded-xl bg-[#241a11] text-white flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-[#1a140e] font-mono font-bold text-[10px] flex items-center justify-center">
                        2
                      </span>
                      <span className="text-[11px] font-medium text-amber-100">Table 04 Course Order</span>
                    </div>
                    <span className="text-[11px] font-serif font-bold text-amber-300">
                      Send to Kitchen &rarr;
                    </span>
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
      <section id="kitchen-connection-section" className="py-20 bg-[#1c1611] text-white border-y border-[#382b1f] px-5 sm:px-10">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-[11px] uppercase tracking-widest font-mono font-bold text-amber-400">
              Kitchen Pipeline Integration
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white">
              Connected Directly to the Catering Kitchen
            </h2>
            <p className="text-sm text-stone-300 leading-relaxed">
              Dinely Weddings is not an isolated brochure—it integrates with the actual Dinely Kitchen Display System (KDS), ensuring high-capacity banquets stay completely synchronized.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl p-6 bg-[#261e17] border border-amber-500/20 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <Smartphone className="w-4 h-4" />
                <span>1. Guest Orders at Table</span>
              </div>
              <h4 className="font-serif font-bold text-base text-white">Table-Bound Sessions</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Every table QR is bound to the wedding workspace and catering restaurant. Orders cannot accidentally stray to unrelated locations or dining tables.
              </p>
            </div>

            <div className="rounded-2xl p-6 bg-[#261e17] border border-amber-500/20 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <Flame className="w-4 h-4" />
                <span>2. Real-Time KDS Tickets</span>
              </div>
              <h4 className="font-serif font-bold text-base text-white">Distinct Wedding Badging</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Kitchen line terminals receive tickets clearly tagged with the celebration title, table number, and dietary modifications for flawless plating.
              </p>
            </div>

            <div className="rounded-2xl p-6 bg-[#261e17] border border-amber-500/20 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                <ChefHat className="w-4 h-4" />
                <span>3. Live Chef Status Updates</span>
              </div>
              <h4 className="font-serif font-bold text-base text-white">Course Bump-to-Pass</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                When chefs mark courses cooking or ready, guest screens reflect the real-time status. Table service coordinates smoothly without chaos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. DESIGNED FOR EVERY CELEBRATION */}
      {/* ========================================================================= */}
      <section id="celebrations-section" className="py-20 px-5 sm:px-10 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <span className="text-[11px] uppercase tracking-widest font-mono font-bold text-[#a37f26]">
            Versatile Elegance
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f170e]">
            Designed for Every Format of Celebration
          </h2>
          <p className="text-sm text-[#635340] leading-relaxed">
            From intimate engagement dinners to grand ballroom receptions, Dinely provides effortless dining hospitality.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-3xl p-6 bg-white border border-[#ebdcc9] space-y-3 hover:border-[#bfa780] shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#efe5d5] text-[#7a5e1d] flex items-center justify-center">
              <Crown className="w-5 h-5" />
            </div>
            <h4 className="font-serif font-bold text-lg text-[#20180f]">Grand Banquets & Receptions</h4>
            <p className="text-xs text-[#6b5b47] leading-relaxed">
              Multi-course ballroom dining with synchronized course pacing across 50+ guest tables.
            </p>
          </div>

          <div className="rounded-3xl p-6 bg-white border border-[#ebdcc9] space-y-3 hover:border-[#bfa780] shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#efe5d5] text-[#7a5e1d] flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </div>
            <h4 className="font-serif font-bold text-lg text-[#20180f]">Engagements & Courtyard Dinners</h4>
            <p className="text-xs text-[#6b5b47] leading-relaxed">
              Warm, ambient dining where honored guests order artisan courses and cellar wines at their own rhythm.
            </p>
          </div>

          <div className="rounded-3xl p-6 bg-white border border-[#ebdcc9] space-y-3 hover:border-[#bfa780] shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#efe5d5] text-[#7a5e1d] flex items-center justify-center">
              <Wine className="w-5 h-5" />
            </div>
            <h4 className="font-serif font-bold text-lg text-[#20180f]">Sangeet & Cocktail Soirées</h4>
            <p className="text-xs text-[#6b5b47] leading-relaxed">
              High-speed bar service and tapas delivered right to lounge seating and cocktail tables.
            </p>
          </div>

          <div className="rounded-3xl p-6 bg-white border border-[#ebdcc9] space-y-3 hover:border-[#bfa780] shadow-sm hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-2xl bg-[#efe5d5] text-[#7a5e1d] flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <h4 className="font-serif font-bold text-lg text-[#20180f]">Multi-Day Celebrations</h4>
            <p className="text-xs text-[#6b5b47] leading-relaxed">
              Welcome dinners, mehendi brunches, and farewell breakfasts managed under a single host account.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. PROGRESSIVE MULTI-STEP WEDDING APPLICATION FORM */}
      {/* ========================================================================= */}
      <section id="wedding-apply-section" className="py-20 bg-gradient-to-b from-[#faf7f2] via-[#f4ebe0] to-[#faf7f2] border-t border-[#ebdcc9] px-5 sm:px-10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center space-y-3 mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#eee3d1] border border-[#d9ccb9] text-xs font-mono font-bold text-[#85651c]">
              <Lock className="w-3.5 h-3.5" />
              <span>Private Access by Approval</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f170e]">
              Plan Your Wedding Experience
            </h2>
            <p className="text-sm text-[#665744] max-w-lg mx-auto leading-relaxed">
              Tell us about your celebration. Once approved by our team, your dedicated Wedding Organizer Studio and fulfillment kitchen connection will unlock.
            </p>
          </div>

          {/* Success Screen */}
          {submittedApplication ? (
            <div className="rounded-3xl p-8 bg-white border border-[#ebdcc9] shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-700 font-bold bg-emerald-100/60 px-3 py-1 rounded-full">
                  Status: {submittedApplication.lifecycleStatus}
                </span>
                <h3 className="font-serif text-2xl font-bold text-[#241a0f]">
                  Application Received with Honor
                </h3>
                <p className="text-sm text-[#6b5c49] max-w-md mx-auto">
                  {submittedApplication.message}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#faf7f2] border border-[#ebdcc9] text-left max-w-md mx-auto space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#857662]">Application Reference ID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[#241a0f]">{submittedApplication.requestId}</span>
                    <button
                      type="button"
                      onClick={() => copyRequestId(submittedApplication.requestId)}
                      className="p-1 rounded text-[#857662] hover:text-[#1c1611] transition-colors"
                      title="Copy ID"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#857662]">Registered Email:</span>
                  <span className="font-semibold text-[#241a0f]">{formData.applicantEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#857662]">Wedding Title:</span>
                  <span className="font-semibold text-[#241a0f]">{formData.weddingName}</span>
                </div>
              </div>

              <p className="text-xs text-[#8c7a65]">
                Our team reviews each celebration to ensure proper kitchen alignment and menu readiness. You can track this request at any time using your reference ID.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedApplication(null);
                    setFormStep(1);
                  }}
                  className="px-6 py-2.5 rounded-full text-xs font-serif font-semibold border border-[#d9c7af] text-[#5e503f] hover:bg-[#faf7f2]"
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
                  className="px-6 py-2.5 rounded-full text-xs font-serif font-bold bg-[#1f1912] text-white shadow-md hover:bg-[#2e251a] border border-[#c5a059]/40"
                >
                  Track Application Status
                </button>
              </div>
            </div>
          ) : (
            /* Multi-Step Application Form */
            <form
              onSubmit={handleSubmitApplication}
              className="rounded-3xl p-6 sm:p-10 bg-white border border-[#ebdcc9] shadow-xl space-y-8"
            >
              {/* Progress Indicator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-serif font-semibold text-[#665744]">
                  <span>Step {formStep} of 4: {formStep === 1 ? 'Host Details' : formStep === 2 ? 'Celebration' : formStep === 3 ? 'Venue & City' : 'Catering & Notes'}</span>
                  <span className="font-mono text-[#8c691c]">{formStep * 25}% Complete</span>
                </div>
                <div className="w-full h-1.5 bg-[#f0e5d4] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#b89033] to-[#8c691c] transition-all duration-300 rounded-full"
                    style={{ width: `${formStep * 25}%` }}
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* STEP 1: Host Contact Info */}
              {formStep === 1 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-[#ebdcc9] pb-3">
                    <h3 className="font-serif font-bold text-base text-[#1f170e]">1. Host & Contact Information</h3>
                    <p className="text-xs text-[#70604d] mt-0.5">Please provide primary contact information for verification and workspace access.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Applicant / Host Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Eleanor Vance"
                        value={formData.applicantName}
                        onChange={(e) => handleInputChange('applicantName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Contact Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. eleanor@vance-events.com"
                        value={formData.applicantEmail}
                        onChange={(e) => handleInputChange('applicantEmail', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Contact Phone / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +91 98765 43210"
                        value={formData.applicantPhone}
                        onChange={(e) => handleInputChange('applicantPhone', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Celebration Details */}
              {formStep === 2 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-[#ebdcc9] pb-3">
                    <h3 className="font-serif font-bold text-base text-[#1f170e]">2. Celebration Details</h3>
                    <p className="text-xs text-[#70604d] mt-0.5">Tell us about the event schedule and banquet timing.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Celebration Title *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Eleanor & Julian Royal Banquet"
                        value={formData.weddingName}
                        onChange={(e) => handleInputChange('weddingName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          Celebration Format
                        </label>
                        <select
                          value={formData.eventType}
                          onChange={(e) => handleInputChange('eventType', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        >
                          <option value="WEDDING">Wedding Ceremony & Banquet</option>
                          <option value="RECEPTION">Evening Reception</option>
                          <option value="SANGEET">Sangeet / Musical Soirée</option>
                          <option value="ENGAGEMENT">Engagement Gala</option>
                          <option value="CELEBRATION">Private Celebration</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          Event Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.eventDate}
                          onChange={(e) => handleInputChange('eventDate', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        >
                        </input>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          Service Start Time
                        </label>
                        <input
                          type="time"
                          value={formData.startTime}
                          onChange={(e) => handleInputChange('startTime', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          Service End Time
                        </label>
                        <input
                          type="time"
                          value={formData.endTime}
                          onChange={(e) => handleInputChange('endTime', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Venue & Guest Count */}
              {formStep === 3 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-[#ebdcc9] pb-3">
                    <h3 className="font-serif font-bold text-base text-[#1f170e]">3. Venue & Guest Count</h3>
                    <p className="text-xs text-[#70604d] mt-0.5">Specify the destination venue and expected guest attendance.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Venue / Banquet Hall Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. The Grand Ballroom, Taj Palace"
                        value={formData.venueName}
                        onChange={(e) => handleInputChange('venueName', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          City *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mumbai, New Delhi, Bengaluru"
                          value={formData.venueCity}
                          onChange={(e) => handleInputChange('venueCity', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                          Estimated Guest Count
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="5000"
                          value={formData.estimatedGuestCount}
                          onChange={(e) => handleInputChange('estimatedGuestCount', e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: Catering & Special Requests */}
              {formStep === 4 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-b border-[#ebdcc9] pb-3">
                    <h3 className="font-serif font-bold text-base text-[#1f170e]">4. Catering & Special Touches</h3>
                    <p className="text-xs text-[#70604d] mt-0.5">Provide catering kitchen preferences or special dietary requirements.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Arranged Catering Team or Preferred Restaurant Partner (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. In-house culinary team or THE MAN Banquet Kitchen"
                        value={formData.cateringNotes}
                        onChange={(e) => handleInputChange('cateringNotes', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                        Special Dietary Rules, Speech Schedules, or Service Notes (Optional)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Describe special requests, dietary restrictions, course sequences, champagne toasts..."
                        value={formData.notes}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] focus:bg-white text-xs text-[#20180f] outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Stepper Navigation Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-[#ebdcc9]">
                {formStep > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="px-5 py-2.5 rounded-full border border-[#d9ccb9] text-xs font-serif font-semibold text-[#574938] hover:bg-[#faf7f2] transition-all flex items-center gap-1.5 cursor-pointer"
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
                    className="px-6 py-2.5 rounded-full bg-[#1c1611] text-white hover:bg-[#2b221a] text-xs font-serif font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-[#c5a059]/40"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#d4af37]" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-7 py-3 rounded-full bg-[#1c1611] text-[#f7f2ea] hover:bg-[#2b221a] text-xs font-serif font-bold uppercase tracking-wider shadow-lg hover:brightness-105 active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-[#c5a059]/40"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Wedding Application</span>
                        <ArrowRight className="w-4 h-4 text-[#d4af37]" />
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
            <label className="block text-xs font-semibold text-[#574938] mb-1">
              Application Reference ID *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. wreq-c98a72b14e"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] text-xs font-mono text-[#20180f] outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#574938] mb-1">
              Registered Email Address (for verification)
            </label>
            <input
              type="email"
              placeholder="e.g. eleanor@vance-events.com"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf7f2] border border-[#dfd0bb] focus:border-[#b89033] text-xs text-[#20180f] outline-none"
            />
          </div>

          {lookupError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {lookupError}
            </div>
          )}

          <Button
            type="submit"
            variant="brand"
            size="md"
            disabled={lookupLoading}
            className="w-full bg-[#1f1912] hover:bg-[#2c241a] text-white font-medium text-xs border border-[#c5a059]/40"
          >
            {lookupLoading ? 'Locating Application...' : 'Check Status'}
          </Button>
        </form>

        {/* Lookup Result View */}
        {lookupResult && (
          <div className="mt-5 p-4 rounded-2xl bg-[#faf7f2] border border-[#ebdcc9] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-serif font-bold text-sm text-[#20180f]">
                {lookupResult.weddingName}
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  lookupResult.lifecycleStatus === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : lookupResult.lifecycleStatus === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {lookupResult.lifecycleStatus}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-[#6e5d48]">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="font-medium text-[#20180f]">{lookupResult.eventDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Venue:</span>
                <span className="font-medium text-[#20180f]">{lookupResult.venueName}, {lookupResult.venueCity}</span>
              </div>
              {lookupResult.cateringRestaurantName && (
                <div className="flex justify-between">
                  <span>Assigned Kitchen:</span>
                  <span className="font-medium text-[#916e18]">{lookupResult.cateringRestaurantName}</span>
                </div>
              )}
              {lookupResult.reviewNotes && (
                <div className="pt-2 border-t border-[#ebdcc9] text-[11px] text-[#806f5b]">
                  <strong>Review Notes:</strong> {lookupResult.reviewNotes}
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
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
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
      {/* 9. REFINED EDITORIAL FOOTER */}
      {/* ========================================================================= */}
      <footer className="bg-white border-t border-[#ebdcc9] py-12 px-5 sm:px-10 text-center text-xs text-[#8c7b67]">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-4 h-4 text-[#9e7d23]" />
            <span className="font-serif font-bold text-sm text-[#2b2115]">
              Dinely Weddings & Private Events
            </span>
          </div>
          <p className="max-w-md mx-auto text-[#736351]">
            Elevating wedding and gala hospitality with quiet digital elegance. Connected directly to professional restaurant kitchens.
          </p>
          <div className="pt-2 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={navigateHome}
              className="text-[#916e18] font-semibold hover:underline bg-transparent border-none cursor-pointer text-xs"
            >
              Switch to Restaurant Platform &rarr;
            </button>
            <button
              type="button"
              onClick={() => setTrackModalOpen(true)}
              className="text-[#594d3f] hover:underline bg-transparent border-none cursor-pointer text-xs"
            >
              Track Existing Application
            </button>
          </div>
          <p className="text-[10px] text-[#a19280] pt-4">
            &copy; {new Date().getFullYear()} Dinely Inc. All rights reserved. Encrypted and verified private dining.
          </p>
        </div>
      </footer>
    </div>
  );
};
