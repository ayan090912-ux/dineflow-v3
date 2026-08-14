import React, { useState } from 'react';
import {
  Utensils,
  Zap,
  Smartphone,
  Building2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Clock,
  ChevronDown,
  Star,
  Users,
  Layers,
  PhoneCall,
  Flame,
  Globe,
  HelpCircle,
  Mail,
  Send,
  Play,
  Check,
  X,
  Laptop,
  LogOut,
  ChefHat,
  Wine,
  Activity,
  Layers3,
  Compass,
  Cpu,
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';

interface LandingWebsiteProps {
  onStartTrial: (ownerData?: any) => void;
  onLogin: () => void;
  onOpenApp: (app: 'restaurant' | 'waiter' | 'customer' | 'platform') => void;
}

export const LandingWebsite: React.FC<LandingWebsiteProps> = ({
  onStartTrial,
  onLogin,
  onOpenApp,
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'features' | 'showcase' | 'pricing' | 'faq' | 'contact'>('home');
  const [heroEmail, setHeroEmail] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  const currentUser = api.getCurrentUser();

  const faqs = [
    {
      q: 'How does joining Dinely Cloud work?',
      a: 'Authenticate with Google, configure your restaurant through our 4-step wizard (basics, location, tables, review), and click "Submit for Approval". Once our platform admin team approves your setup, your restaurant workspace goes live instantly!',
    },
    {
      q: 'Are there any hidden fees or subscription plans?',
      a: 'No! Dinely Cloud is a self-service restaurant enablement platform with no payment processing or subscription plan requirements.',
    },
    {
      q: 'Do I need special POS hardware or tablets?',
      a: 'No! Dinely Cloud runs on any web browser, iPad, Android tablet, phone, or touchscreen POS terminal. Customers simply scan QR codes on their phones to view menus and order.',
    },
    {
      q: 'How does the platform approval process work?',
      a: 'When you submit your restaurant setup, our platform team reviews your details and table floorplan configuration. Once verified, you receive instant activation and full access to your Restaurant Operating System.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {/* Eterna Ambient Glow Meshes */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] glow-mesh-indigo pointer-events-none z-0" />
      <div className="absolute top-[400px] right-0 w-[500px] h-[500px] glow-mesh-orange pointer-events-none z-0" />

      {/* Floating Eterna Header Navbar */}
      <div className="sticky top-4 z-50 px-4 md:px-8 max-w-6xl mx-auto w-full">
        <header className="rounded-full bg-[#12141d]/85 border border-indigo-500/20 backdrop-blur-2xl px-6 py-2.5 flex items-center justify-between shadow-2xl shadow-black/80">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" />
              <span className="text-xl font-black tracking-tight text-white font-mono">
                dinely<span className="text-purple-400">.cloud</span>
              </span>
            </div>
          </div>

          {/* Grouped Pill Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <button
              onClick={() => setActiveTab('home')}
              className={`hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${activeTab === 'home' ? 'text-indigo-400 font-bold' : ''}`}
            >
              What we do
            </button>
            <button
              onClick={() => setActiveTab('features')}
              className={`hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${activeTab === 'features' ? 'text-indigo-400 font-bold' : ''}`}
            >
              Our approach
            </button>
            <button
              onClick={() => setActiveTab('showcase')}
              className={`hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${activeTab === 'showcase' ? 'text-indigo-400 font-bold' : ''}`}
            >
              Showcase
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${activeTab === 'faq' ? 'text-indigo-400 font-bold' : ''}`}
            >
              About us
            </button>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentUser?.role === 'PLATFORM_ADMIN') onOpenApp('platform');
                    else if (currentUser?.role === 'WAITER') onOpenApp('waiter');
                    else onOpenApp('restaurant');
                  }}
                  className="eterna-pill-btn text-xs font-bold px-5 py-2 cursor-pointer shadow-lg"
                >
                  My Dashboard
                </button>
                <button
                  onClick={async () => {
                    await api.logout();
                    window.location.reload();
                  }}
                  className="p-2 rounded-full text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setIsPortalModalOpen(true)}
                  className="text-xs font-bold text-slate-300 hover:text-white px-4 py-2 rounded-full border border-indigo-500/20 hover:border-indigo-500/40 bg-[#12141d] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Log In</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => onStartTrial()}
                  className="eterna-pill-btn text-xs font-bold px-6 py-2 cursor-pointer shadow-lg"
                >
                  Create Restaurant
                </button>
              </>
            )}
          </div>
        </header>
      </div>

      {/* Main Home View */}
      {activeTab === 'home' && (
        <main className="flex-1 z-10 relative">
          {/* Eterna Hero Section 1 */}
          <section className="pt-16 pb-20 px-4 md:px-8 max-w-5xl mx-auto text-center space-y-8">
            {/* Top Eterna Pill Chip */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#12141d]/90 border border-indigo-500/30 text-xs font-semibold text-indigo-300 shadow-xl backdrop-blur-xl">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span>Data-driven product management partner</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-tight max-w-4xl mx-auto text-white">
              Perfecting every detail for <span className="eterna-gradient-text">dining & equipment</span> takes monumental effort
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
              Empower your restaurant with seamless order taking, real-time table floorplans, Kitchen KDS, Waiter OS, and multi-tenant cloud security built for scale.
            </p>

            {/* Eterna Signature Hero Email Action Bar */}
            <div className="w-full max-w-xl mx-auto rounded-full bg-[#12141d] border border-indigo-500/30 p-1.5 pl-6 flex items-center shadow-2xl focus-within:border-purple-400 transition-all">
              <input
                type="email"
                placeholder="enter your restaurant email address..."
                value={heroEmail}
                onChange={(e) => setHeroEmail(e.target.value)}
                className="bg-transparent text-white font-medium text-xs flex-1 outline-none placeholder:text-slate-500"
              />
              <button
                onClick={() => onStartTrial({ email: heroEmail })}
                className="eterna-pill-btn text-xs font-bold px-7 py-3 shadow-xl shrink-0 cursor-pointer flex items-center gap-2"
              >
                <span>Create Restaurant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>

          {/* Eterna Section 2: One Go-to Partner Process Flow Cards */}
          <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950/40 border border-indigo-500/30 text-[11px] font-mono font-bold text-indigo-400">
                <span>● Value proposition</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black eterna-gradient-text">
                One go-to partner who orchestrates and delivers
              </h2>
            </div>

            {/* 4-Stage Process Flow Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="eterna-glass-card rounded-3xl p-6 space-y-4 hover:border-indigo-500/50 transition-all duration-300 group">
                <div className="text-xs font-mono font-bold text-indigo-400">01. SETUP & AUTH</div>
                <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                  Google Account Authentication
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Single click authentication with Firebase Google Auth. Automatic owner profile synchronization.
                </p>
              </div>

              <div className="eterna-glass-card rounded-3xl p-6 space-y-4 hover:border-purple-500/50 transition-all duration-300 group">
                <div className="text-xs font-mono font-bold text-purple-400">02. FLOORPLAN</div>
                <h3 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">
                  Table & Venue Configuration
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Specify exact table capacity for automated database creation and table-specific QR codes.
                </p>
              </div>

              <div className="eterna-glass-card rounded-3xl p-6 space-y-4 hover:border-pink-500/50 transition-all duration-300 group">
                <div className="text-xs font-mono font-bold text-pink-400">03. APPROVAL</div>
                <h3 className="text-base font-bold text-white group-hover:text-pink-300 transition-colors">
                  Admin Verification Queue
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Platform admin reviews application and instantiates active table floorplan in backend storage.
                </p>
              </div>

              <div className="eterna-glass-card rounded-3xl p-6 space-y-4 hover:border-emerald-500/50 transition-all duration-300 group">
                <div className="text-xs font-mono font-bold text-emerald-400">04. LIVE POS</div>
                <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                  Live Operations & Ordering
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Instant go-live across POS Terminal, Kitchen KDS, Waiter OS, Bar Terminal, and QR Ordering.
                </p>
              </div>
            </div>
          </section>

          {/* Eterna Section 3: Trusted by Fortune 100 Hyperscalers */}
          <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto space-y-10">
            <div className="text-center space-y-3">
              <h2 className="text-3xl sm:text-4xl font-black eterna-gradient-text">
                Trusted by Fortune 100 hyperscalers from concept to completion
              </h2>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Discover how Dinely enables multi-outlet restaurant management with tenant isolation and real-time speed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="p-6 bg-[#12141d] border border-indigo-500/20 rounded-3xl space-y-3">
                <div className="text-xs font-mono text-slate-500 uppercase">Onboarding</div>
                <div className="text-lg font-bold text-white">From Idea to Setup</div>
                <div className="text-xs text-slate-400">Offer complete system.</div>
              </div>

              <div className="p-6 bg-[#12141d] border border-indigo-500/20 rounded-3xl space-y-3">
                <div className="text-xs font-mono text-slate-500 uppercase">Reviewing</div>
                <div className="text-lg font-bold text-white">From Evaluation to Approval</div>
                <button
                  onClick={() => onStartTrial()}
                  className="eterna-pill-btn text-[11px] font-bold px-4 py-1.5 shadow-md cursor-pointer"
                >
                  Request Launch &rarr;
                </button>
              </div>

              <div className="p-6 bg-[#12141d] border border-indigo-500/20 rounded-3xl space-y-3">
                <div className="text-xs font-mono text-slate-500 uppercase">Activation</div>
                <div className="text-lg font-bold text-white">From Approval to Launch</div>
                <div className="text-xs text-slate-400">Instant go-live.</div>
              </div>

              <div className="p-6 bg-[#12141d] border border-indigo-500/20 rounded-3xl space-y-3">
                <div className="text-xs font-mono text-slate-500 uppercase">Deployment</div>
                <div className="text-lg font-bold text-white">From Operating to Scale</div>
                <div className="text-xs text-slate-400">Multi-tenant security.</div>
              </div>
            </div>
          </section>

          {/* Eterna Section 4: Interactive Orbital Radar & Execution Layer */}
          <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto space-y-12">
            <div className="eterna-glass-card rounded-3xl p-8 sm:p-12 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                {/* Left: Interactive Orbital System Graphic */}
                <div className="relative flex items-center justify-center p-8">
                  {/* Glowing orbital rings */}
                  <div className="w-64 h-64 rounded-full border border-indigo-500/30 animate-spin-slow flex items-center justify-center relative">
                    <div className="w-48 h-48 rounded-full border border-purple-500/40 flex items-center justify-center">
                      <div className="w-32 h-32 rounded-full border border-pink-500/40 flex items-center justify-center bg-indigo-950/40 backdrop-blur-xl">
                        <Cpu className="w-10 h-10 text-indigo-400 animate-pulse" />
                      </div>
                    </div>
                    {/* Satellite Dots */}
                    <div className="absolute -top-2 left-1/2 w-4 h-4 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500" />
                    <div className="absolute -bottom-2 right-1/4 w-4 h-4 rounded-full bg-purple-500 shadow-lg shadow-purple-500" />
                    <div className="absolute top-1/2 -left-2 w-4 h-4 rounded-full bg-pink-500 shadow-lg shadow-pink-500" />
                  </div>
                </div>

                {/* Right: Execution Layer Text */}
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/50 border border-purple-500/30 text-[11px] font-mono text-purple-300">
                    <span>● Real-Time Sync</span>
                  </div>
                  <h3 className="text-3xl font-black eterna-gradient-text leading-tight">
                    We are the execution layer across products, terminals, and ordering
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Our real-time WebSocket bus seamlessly orchestrates table QR scans, kitchen prep queues, bartender tickets, and cashier floorplans under one unified platform.
                  </p>

                  <div className="space-y-3 pt-2 text-xs">
                    <div className="flex items-center gap-3 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>POS Terminal OS with real-time bill settlement</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Kitchen KDS countdown timer bump tickets</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Waiter handheld service call notifications</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => onStartTrial()}
                      className="eterna-pill-btn text-xs font-bold px-7 py-3 shadow-xl cursor-pointer"
                    >
                      Get Started Today &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Features View */}
      {activeTab === 'features' && (
        <main className="flex-1 py-12 px-4 md:px-8 max-w-6xl mx-auto space-y-8 z-10 relative">
          <div className="border-b border-indigo-500/20 pb-4 space-y-1">
            <h1 className="text-3xl font-black eterna-gradient-text">Our Approach & Terminal Architecture</h1>
            <p className="text-xs text-slate-400">Comprehensive overview of Dinely's dedicated operating terminals.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="eterna-glass-card rounded-3xl p-6 space-y-3">
              <Utensils className="w-6 h-6 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">POS Terminal OS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cashier checkout, table floorplan management, splitting bills, order modifications, and end-of-day daily closing summaries.
              </p>
            </div>

            <div className="eterna-glass-card rounded-3xl p-6 space-y-3">
              <ChefHat className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-bold text-white">Kitchen Display System (KDS)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dedicated station for kitchen chefs with prep countdown timers, order bumping, ingredient alerts, and ready notifications.
              </p>
            </div>

            <div className="eterna-glass-card rounded-3xl p-6 space-y-3">
              <Wine className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Bar Terminal KDS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drink prep terminal for bartenders to fulfill cocktail, beverage, and wine orders directly from customer table QR scans.
              </p>
            </div>

            <div className="eterna-glass-card rounded-3xl p-6 space-y-3">
              <Building2 className="w-6 h-6 text-emerald-400" />
              <h3 className="text-lg font-bold text-white">Multi-Tenant Platform Admin</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                SaaS platform administration dashboard to review restaurant applications, approve outlets, and manage global system compliance.
              </p>
            </div>
          </div>
        </main>
      )}

      {/* FAQ View */}
      {activeTab === 'faq' && (
        <main className="flex-1 py-12 px-4 md:px-8 max-w-4xl mx-auto space-y-6 z-10 relative">
          <div className="border-b border-indigo-500/20 pb-4 space-y-1 text-center">
            <h1 className="text-3xl font-black eterna-gradient-text">Frequently Asked Questions</h1>
            <p className="text-xs text-slate-400">Everything you need to know about joining Dinely Cloud.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="eterna-glass-card rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-bold text-white">{faq.q}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Contact View */}
      {activeTab === 'contact' && (
        <main className="flex-1 py-12 px-4 md:px-8 max-w-xl mx-auto space-y-6 z-10 relative">
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-black eterna-gradient-text">Get in Touch</h1>
            <p className="text-xs text-slate-400">Reach out to the Dinely platform architecture team.</p>
          </div>

          <div className="eterna-glass-card rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
            {contactSubmitted ? (
              <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="font-bold text-white text-sm">Submission Received!</p>
                <p className="text-slate-400">Our team will get back to you shortly.</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactSubmitted(true);
                }}
                className="space-y-4"
              >
                <Input label="Your Name *" placeholder="e.g. Ayaan Sharma" required />
                <Input label="Email Address *" type="email" placeholder="ayaan@dinely.app" required />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">Message *</label>
                  <textarea
                    rows={4}
                    placeholder="Tell us about your restaurant inquiry..."
                    className="w-full p-3.5 bg-[#12141d] border border-indigo-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="eterna-pill-btn w-full text-xs font-bold py-3 shadow-lg cursor-pointer"
                >
                  Submit Inquiry
                </button>
              </form>
            )}
          </div>
        </main>
      )}

      {/* Eterna Style Footer */}
      <footer className="border-t border-indigo-500/20 py-8 px-4 md:px-8 bg-[#0b0c10] z-10 relative">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
            <span className="font-mono text-slate-300 font-bold">dinely.cloud</span>
            <span>&copy; {new Date().getFullYear()} Dinely Cloud Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 mt-4 sm:mt-0 font-medium">
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('features')}>What we do</span>
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('showcase')}>Approach</span>
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('faq')}>About us</span>
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => onStartTrial()}>Subscribe</span>
          </div>
        </div>
      </footer>

      {/* Sleek Dedicated Role Portal Selector Modal */}
      <Modal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        title="Select Your Dedicated Role Portal"
      >
        <div className="space-y-5 text-slate-100 p-1">
          <p className="text-xs text-slate-400">
            Select your assigned staff terminal or operating portal to sign in:
          </p>

          <div className="space-y-2">
            <p className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              Staff Operational Terminals
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/kitchen/login';
                }}
                className="p-3 bg-[#12141d] hover:bg-slate-900 border border-indigo-500/20 hover:border-amber-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <ChefHat className="w-4 h-4 text-amber-400" /> Kitchen KDS
                </div>
                <div className="text-[10px] text-slate-400">Cook & Chef Terminal</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/waiter/login';
                }}
                className="p-3 bg-[#12141d] hover:bg-slate-900 border border-indigo-500/20 hover:border-sky-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                  <Zap className="w-4 h-4 text-sky-400" /> Waiter OS
                </div>
                <div className="text-[10px] text-slate-400">Floor Server Terminal</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/bar/login';
                }}
                className="p-3 bg-[#12141d] hover:bg-slate-900 border border-indigo-500/20 hover:border-purple-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <Wine className="w-4 h-4 text-purple-400" /> Bar Terminal
                </div>
                <div className="text-[10px] text-slate-400">Bartender Prep Queue</div>
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <p className="text-[11px] font-mono font-bold text-rose-400 uppercase tracking-wider">
              Management & Admin Portals
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/restaurant/login';
                }}
                className="p-3.5 bg-[#12141d] hover:bg-slate-900 border border-indigo-500/20 hover:border-rose-500/50 rounded-2xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                  <Utensils className="w-4 h-4" /> Restaurant Owner Portal
                </div>
                <div className="text-[10px] text-slate-400">Outlet POS, Floorplan & Menu OS</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/admin/login';
                }}
                className="p-3.5 bg-[#12141d] hover:bg-slate-900 border border-indigo-500/20 hover:border-indigo-500/50 rounded-2xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <Building2 className="w-4 h-4" /> Platform Admin Portal
                </div>
                <div className="text-[10px] text-slate-400">Global SaaS Console & Approvals</div>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
