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
  ChefHat
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { WeddingAccessRequest } from '../../packages/types';

interface WeddingLandingPageProps {
  onNavigateHome: () => void;
  onNavigateOrganizerLogin?: () => void;
  onNavigateOrganizerDashboard?: () => void;
  currentUser?: any;
}

export const WeddingLandingPage: React.FC<WeddingLandingPageProps> = ({
  onNavigateHome,
  onNavigateOrganizerLogin,
  onNavigateOrganizerDashboard,
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedApplication, setSubmittedApplication] = useState<{
    requestId: string;
    lifecycleStatus: string;
    message: string;
  } | null>(null);

  // Status Lookup State
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<WeddingAccessRequest | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Active Organizer Workspaces Check
  const [myWorkspaces, setMyWorkspaces] = useState<any[]>([]);

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

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!formData.applicantName.trim()) return setFormError('Please enter your full name.');
    if (!formData.applicantEmail.trim() || !formData.applicantEmail.includes('@')) return setFormError('Please enter a valid email address.');
    if (!formData.applicantPhone.trim()) return setFormError('Please provide a contact phone number.');
    if (!formData.weddingName.trim()) return setFormError('Please enter the wedding or celebration title.');
    if (!formData.eventDate) return setFormError('Please select the scheduled event date.');
    if (!formData.venueName.trim()) return setFormError('Please provide the venue or banquet hall name.');
    if (!formData.venueCity.trim()) return setFormError('Please provide the city where the event will take place.');

    setIsSubmitting(true);
    try {
      const res = await api.submitWeddingRequest({
        ...formData,
        estimatedGuestCount: Number(formData.estimatedGuestCount) || 100,
      });

      setSubmittedApplication({
        requestId: res.requestId,
        lifecycleStatus: res.lifecycleStatus || 'SUBMITTED',
        message: res.message || 'Application submitted successfully.',
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

  const scrollToApply = () => {
    const el = document.getElementById('wedding-apply-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#2c2419] font-sans antialiased selection:bg-[#d4af37]/25 selection:text-[#1c150c]">
      {/* ========================================================================= */}
      {/* 1. LUXURY TOP NAVIGATION BAR */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#faf8f5]/90 backdrop-blur-md border-b border-[#ebdcc9] transition-all py-3.5 px-5 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand + Experience Switcher */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#c59e2b] via-[#e5c568] to-[#f3e6b7] flex items-center justify-center text-white shadow-md shadow-[#d4af37]/20">
                <Crown className="w-4 h-4 text-[#3d2f0d]" />
              </span>
              <div className="flex flex-col">
                <span className="font-serif font-bold text-lg tracking-wide text-[#2c2419]">
                  Dinely <span className="font-light italic text-[#9e7d23]">Weddings</span>
                </span>
                <span className="text-[10px] tracking-widest uppercase text-[#9e8b70] font-medium -mt-0.5">
                  Private Events Edition
                </span>
              </div>
            </div>

            {/* Seamless Dual-Product Switcher */}
            <div className="hidden md:flex items-center p-1 rounded-full bg-[#f0e7d8] border border-[#e2d4c0] shadow-inner text-xs">
              <button
                type="button"
                onClick={onNavigateHome}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[#756854] hover:text-[#2c2419] hover:bg-white/60 transition-all cursor-pointer border-none bg-transparent"
              >
                <span>🍽️</span>
                <span>Restaurants</span>
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[#916e18] font-semibold shadow-sm border border-[#ebdcc9]">
                <span>💍</span>
                <span>Weddings & Events</span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-3">
            {/* Switcher for mobile */}
            <button
              type="button"
              onClick={onNavigateHome}
              className="md:hidden text-xs text-[#756854] font-medium underline underline-offset-4"
            >
              &larr; Restaurants
            </button>

            <button
              type="button"
              onClick={() => setTrackModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-serif font-medium text-[#7a6435] bg-[#f5ede1] hover:bg-[#ede1d0] border border-[#dfd0bb] transition-all cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#9e7d23]" />
              <span>Track Request</span>
            </button>

            {myWorkspaces.length > 0 ? (
              <button
                type="button"
                onClick={onNavigateOrganizerDashboard}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-serif font-bold tracking-wider uppercase bg-gradient-to-r from-[#c59e2b] to-[#916e18] text-white shadow-md shadow-[#c59e2b]/30 hover:brightness-105 active:scale-98 transition-all cursor-pointer border-none"
              >
                <span>Open Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={scrollToApply}
                className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-full text-xs font-serif font-bold tracking-wider uppercase bg-gradient-to-r from-[#c59e2b] via-[#b89123] to-[#8d6911] text-white shadow-md shadow-[#c59e2b]/30 hover:brightness-105 active:scale-98 transition-all cursor-pointer border-none"
              >
                <span>Request Access</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. CINEMATIC LUXURY HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 px-6 text-center">
        {/* Subtle Decorative Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-b from-[#e8d7b3]/30 via-[#f0e3c8]/20 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f3ebe0] border border-[#e0cfba] text-xs font-serif tracking-wider text-[#85651c] shadow-sm animate-in fade-in duration-700">
            <Sparkles className="w-3.5 h-3.5 text-[#b89123]" />
            <span>Digital Dining Crafted for High-Profile Celebrations</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-6xl text-[#1e170e] font-bold tracking-tight leading-[1.15]">
            Curated Table QR Dining <br />
            <span className="italic font-light text-[#9e7d23]">Crafted for Unforgettable Weddings</span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-[#6b5c49] font-sans leading-relaxed">
            Elevate banquet dining into a choreographed, Michelin-grade culinary experience. Guests browse chef-crafted banquet courses directly from personalized table QR codes, with orders transmitted in real time to your kitchen.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              type="button"
              onClick={scrollToApply}
              className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-gradient-to-r from-[#c59e2b] via-[#b89123] to-[#8d6911] text-white font-serif font-bold text-xs uppercase tracking-widest shadow-xl shadow-[#c59e2b]/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer border-none"
            >
              Request Wedding Workspace &rarr;
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('how-it-works-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-white text-[#524434] font-serif font-semibold text-xs uppercase tracking-wider border border-[#dfd0bb] shadow-sm hover:bg-[#fbf7f0] transition-all cursor-pointer"
            >
              Explore How It Works
            </button>
          </div>

          {/* Social Proof Badges */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-[#8c7b67]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#a37f26]" />
              <span>Decoupled Table QR Codes</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#a37f26]" />
              <span>Real Kitchen Display Integration</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#a37f26]" />
              <span>Dedicated Host Organizer Dashboard</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. HOW WEDDING QR ORDERING WORKS (4 PILLARS) */}
      {/* ========================================================================= */}
      <section id="how-it-works-section" className="py-20 bg-white border-y border-[#ebdcc9] px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs uppercase tracking-widest font-serif font-bold text-[#b89123]">
              The Choreography
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#20180f]">
              How Wedding Digital Dining Operates
            </h2>
            <p className="text-sm text-[#73634f]">
              A complete, synchronized dining journey designed for wedding organizers, catering chefs, and honored guests.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="rounded-2xl p-6 bg-[#faf8f5] border border-[#ebdcc9] space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#f0e4cf] text-[#8d6911] font-serif font-bold text-lg flex items-center justify-center mx-auto shadow-inner">
                1
              </div>
              <h3 className="font-serif font-bold text-lg text-[#2a2116]">Request & Approval</h3>
              <p className="text-xs text-[#6e5e4b] leading-relaxed">
                Hosts submit event details and banquet guest count. Platform administrators assign the verified catering kitchen and provision a private workspace.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl p-6 bg-[#faf8f5] border border-[#ebdcc9] space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#f0e4cf] text-[#8d6911] font-serif font-bold text-lg flex items-center justify-center mx-auto shadow-inner">
                2
              </div>
              <h3 className="font-serif font-bold text-lg text-[#2a2116]">Table QR Studio</h3>
              <p className="text-xs text-[#6e5e4b] leading-relaxed">
                The host configures VIP seating, Head Table, and guest tables. Download high-res individual QR codes or print-ready designer table standees.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl p-6 bg-[#faf8f5] border border-[#ebdcc9] space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#f0e4cf] text-[#8d6911] font-serif font-bold text-lg flex items-center justify-center mx-auto shadow-inner">
                3
              </div>
              <h3 className="font-serif font-bold text-lg text-[#2a2116]">Guest Phone Order</h3>
              <p className="text-xs text-[#6e5e4b] leading-relaxed">
                Guests scan their table QR code with zero app downloads. They browse the permitted banquet courses, note dietary preferences, and place course orders.
              </p>
            </div>

            {/* Step 4 */}
            <div className="rounded-2xl p-6 bg-[#faf8f5] border border-[#ebdcc9] space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#f0e4cf] text-[#8d6911] font-serif font-bold text-lg flex items-center justify-center mx-auto shadow-inner">
                4
              </div>
              <h3 className="font-serif font-bold text-lg text-[#2a2116]">Live Kitchen Delivery</h3>
              <p className="text-xs text-[#6e5e4b] leading-relaxed">
                Orders appear on the live Kitchen Display with distinctive gold wedding badges, table numbers, and dish notes. Chefs bump tickets directly to service.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. THE GUEST EXPERIENCE SHOWCASE */}
      {/* ========================================================================= */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="text-xs uppercase tracking-widest font-serif font-bold text-[#b89123]">
              Bespoke Dining Interface
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#221a11]">
              A Guest Journey Infused with Elegance
            </h2>
            <p className="text-sm text-[#665744] leading-relaxed">
              Every detail of the wedding ordering page is tailored to match the luxury of a private gala. From gold foil accents to custom messages from the couple, guests feel valued without ever having to flag down a busy waiter.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-[#f3ebe0] border border-[#d9c7af] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <Wine className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#2b2115]">Dietary & Course Harmony</h4>
                  <p className="text-xs text-[#70604d] mt-0.5">
                    Clear indicators for Vegetarian, Non-Vegetarian, Wine, and allergens keep banquet service safe and inclusive.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-[#f3ebe0] border border-[#d9c7af] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <Heart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#2b2115]">Personalized Host Messages</h4>
                  <p className="text-xs text-[#70604d] mt-0.5">
                    Welcome your guests with heartfelt notes, couple imagery, and schedule highlights right on their mobile menu.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full bg-[#f3ebe0] border border-[#d9c7af] flex items-center justify-center text-[#8d6911] shrink-0 mt-0.5">
                  <ChefHat className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sm text-[#2b2115]">Live Prep Feedback</h4>
                  <p className="text-xs text-[#70604d] mt-0.5">
                    Guests receive an instant confirmation ticket ref and live status updates when their courses are cooking and ready.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Mockup Card */}
          <div className="rounded-3xl p-6 bg-gradient-to-b from-[#f5eee2] via-[#faf8f5] to-[#f4ebe0] border border-[#e5d5be] shadow-xl relative">
            <div className="rounded-2xl overflow-hidden bg-white border border-[#dfd0bb] shadow-sm p-6 space-y-5">
              <div className="text-center space-y-1.5 border-b border-[#f0e5d4] pb-4">
                <span className="text-[10px] tracking-widest uppercase font-serif font-bold text-[#b89123]">
                  💍 Wedding Banquet · Table 01
                </span>
                <h3 className="font-serif text-xl font-bold text-[#20180f]">
                  Vivian & Julian Royal Banquet
                </h3>
                <p className="text-xs font-serif italic text-[#877864]">
                  Honoring Vivian & Julian • Grand Ballroom
                </p>
              </div>

              {/* Sample Dish Item */}
              <div className="p-3.5 rounded-xl bg-[#faf8f5] border border-[#e8dbca] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-serif font-bold text-sm text-[#292015]">Royal Truffle Paneer Tikka</span>
                  </div>
                  <p className="text-[11px] text-[#736351] mt-0.5">Smoked cottage cheese infused with black truffle glaze</p>
                  <span className="text-xs font-serif font-bold text-[#967524]">₹280.00</span>
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-serif font-semibold bg-[#d4af37] text-white shadow-sm">
                  Selected
                </span>
              </div>

              {/* Sample KDS Ticket Sync */}
              <div className="p-3.5 rounded-xl bg-[#12151b] border border-amber-500/40 text-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-serif font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40">
                    💍 WEDDING EVENT · TABLE 01
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">● LIVE KDS SYNC</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-amber-400 font-bold">#2056 NEW</span>
                  <span className="text-slate-400 text-[11px]">Lady Eleanor (Audit Table 01)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. REQUEST WEDDING ORDERING APPLICATION FORM */}
      {/* ========================================================================= */}
      <section id="wedding-apply-section" className="py-20 bg-gradient-to-b from-[#faf8f5] to-[#f4ebe0] border-t border-[#ebdcc9] px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0e4cf] border border-[#dfd0bb] text-xs font-serif font-bold text-[#916e18]">
              <Lock className="w-3.5 h-3.5" />
              <span>Private Access by Approval</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#221a11]">
              Request a Wedding Workspace
            </h2>
            <p className="text-sm text-[#665744] max-w-lg mx-auto">
              Tell us about your celebration. Once approved by our team, you will receive full access to your personalized Wedding Organizer Studio and kitchen fulfillment connection.
            </p>
          </div>

          {/* Submitted Success Confirmation Screen */}
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

              <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#ebdcc9] text-left max-w-md mx-auto space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#857662]">Application Reference ID:</span>
                  <span className="font-mono font-bold text-[#241a0f]">{submittedApplication.requestId}</span>
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
                Our team reviews each celebration request to ensure proper kitchen alignment and menu readiness. You can track this request at any time using your reference ID.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setSubmittedApplication(null)}
                  className="px-6 py-2.5 rounded-full text-xs font-serif font-semibold border border-[#d9c7af] text-[#5e503f] hover:bg-[#faf8f5]"
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
                  className="px-6 py-2.5 rounded-full text-xs font-serif font-bold bg-[#c59e2b] text-white shadow-md hover:bg-[#b08b21]"
                >
                  Track Application Status
                </button>
              </div>
            </div>
          ) : (
            /* Application Form */
            <form
              onSubmit={handleSubmitApplication}
              className="rounded-3xl p-8 bg-white border border-[#ebdcc9] shadow-xl space-y-6"
            >
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Host Contact Info */}
              <div className="space-y-4">
                <h4 className="font-serif font-bold text-sm text-[#2b2115] border-b border-[#ebdcc9] pb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#b89123]" />
                  <span>1. Host & Contact Information</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Applicant Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={formData.applicantName}
                      onChange={(e) => handleInputChange('applicantName', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Contact Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. eleanor@vance-events.com"
                      value={formData.applicantEmail}
                      onChange={(e) => handleInputChange('applicantEmail', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Contact Phone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91 98765 43210"
                      value={formData.applicantPhone}
                      onChange={(e) => handleInputChange('applicantPhone', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Celebration Details */}
              <div className="space-y-4 pt-2">
                <h4 className="font-serif font-bold text-sm text-[#2b2115] border-b border-[#ebdcc9] pb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#b89123]" />
                  <span>2. Celebration & Seating Schedule</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Wedding / Celebration Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Vivian & Julian Royal Banquet"
                      value={formData.weddingName}
                      onChange={(e) => handleInputChange('weddingName', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Event Type
                    </label>
                    <select
                      value={formData.eventType}
                      onChange={(e) => handleInputChange('eventType', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    >
                      <option value="WEDDING">Wedding Ceremony & Banquet</option>
                      <option value="RECEPTION">Evening Reception</option>
                      <option value="SANGEET">Sangeet / Musical Night</option>
                      <option value="ENGAGEMENT">Engagement Gala</option>
                      <option value="ANNIVERSARY">Anniversary Celebration</option>
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Service Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => handleInputChange('startTime', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Venue & Catering */}
              <div className="space-y-4 pt-2">
                <h4 className="font-serif font-bold text-sm text-[#2b2115] border-b border-[#ebdcc9] pb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#b89123]" />
                  <span>3. Venue & Catering Partners</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Venue / Banquet Hall Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. The Taj Palace Ballroom"
                      value={formData.venueName}
                      onChange={(e) => handleInputChange('venueName', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mumbai"
                      value={formData.venueCity}
                      onChange={(e) => handleInputChange('venueCity', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Arranged Caterer or Preferred Restaurant Partner (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. In-house catering team or THE MAN Banquet Kitchen"
                      value={formData.cateringNotes}
                      onChange={(e) => handleInputChange('cateringNotes', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                      Special Requirements or Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Tell us about courses, champagne service, speech timings, or specific dietary rules..."
                      value={formData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] focus:bg-white text-xs text-[#20180f] outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-4 border-t border-[#ebdcc9]">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#c59e2b] via-[#b89123] to-[#8d6911] text-white font-serif font-bold text-xs uppercase tracking-widest shadow-xl shadow-[#c59e2b]/30 hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border-none"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Submit Celebration Application</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] text-[#8c7b67] mt-3">
                  Applications are verified within 24 hours. No payment or credit card is required to submit.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. TRACK APPLICATION MODAL */}
      {/* ========================================================================= */}
      {trackModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#ebdcc9] shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#f0e4cf] pb-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#9e7d23]" />
                <h3 className="font-serif font-bold text-lg text-[#241a0f]">
                  Track Application Status
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTrackModalOpen(false)}
                className="text-[#8c7b67] hover:text-[#241a0f] text-sm bg-transparent border-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLookupStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                  Application Reference ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. wreq-c98a72b14e"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] text-xs font-mono text-[#20180f] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-serif font-semibold text-[#574938] mb-1">
                  Registered Email Address (Optional for verification)
                </label>
                <input
                  type="email"
                  placeholder="e.g. eleanor@vance-events.com"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#faf8f5] border border-[#dfd0bb] focus:border-[#c59e2b] text-xs text-[#20180f] outline-none"
                />
              </div>

              {lookupError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {lookupError}
                </div>
              )}

              <button
                type="submit"
                disabled={lookupLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#c59e2b] to-[#916e18] text-white font-serif font-bold text-xs uppercase tracking-wider shadow-md hover:brightness-105 transition-all cursor-pointer border-none"
              >
                {lookupLoading ? 'Locating Application...' : 'Check Status'}
              </button>
            </form>

            {/* Lookup Result View */}
            {lookupResult && (
              <div className="p-4 rounded-2xl bg-[#faf8f5] border border-[#ebdcc9] space-y-3 animate-in fade-in">
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
                    <button
                      type="button"
                      onClick={() => {
                        setTrackModalOpen(false);
                        if (onNavigateOrganizerDashboard) onNavigateOrganizerDashboard();
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-serif font-bold text-xs uppercase tracking-wider shadow transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                    >
                      <span>Access Your Wedding Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. REFINED LUXURY FOOTER */}
      {/* ========================================================================= */}
      <footer className="bg-white border-t border-[#ebdcc9] py-12 px-6 text-center text-xs text-[#8c7b67]">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-4 h-4 text-[#9e7d23]" />
            <span className="font-serif font-bold text-sm text-[#2b2115]">
              Dinely Weddings & Private Events
            </span>
          </div>
          <p className="max-w-md mx-auto text-[#736351]">
            Transforming banquet hospitality with quiet digital elegance. Available for luxury weddings, galas, and private dining events.
          </p>
          <div className="pt-2 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={onNavigateHome}
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
