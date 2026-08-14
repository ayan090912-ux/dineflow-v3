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
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal, DinelyLogo, DinelyLogoMark } from '../../packages/ui';
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
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [showcaseTab, setShowcaseTab] = useState<'pos' | 'waiter' | 'kds' | 'bar' | 'customer'>('pos');
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  // Signup Form State
  const [signupForm, setSignupForm] = useState({
    ownerName: '',
    restaurantName: '',
    email: '',
    phone: '',
    password: '',
    country: 'India',
  });

  const handleSignupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSignupModal(false);
    onStartTrial({
      ownerName: signupForm.ownerName || 'Alex Mercer',
      restaurantName: signupForm.restaurantName || 'Lumiere Bistro & Grill',
      email: signupForm.email || 'alex@lumierebistro.com',
      phone: signupForm.phone || '+1 (555) 234-5678',
      country: signupForm.country,
    });
  };

  const faqs = [
    {
      q: 'How does joining Dinely Cloud work?',
      a: 'Simply create your account, configure your restaurant through our 7-step wizard (business details, logo, menu, staff, and tables), and click "Request Launch". Once our platform admin team approves your setup, your restaurant workspace goes live instantly!',
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
      a: 'When you submit your restaurant setup, our platform team reviews your details, table floorplan, and menu configuration. Once verified, you receive an instant activation notification and full access to your Restaurant Operating System.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* Top Marketing Navigation Header */}
      <nav className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
            <DinelyLogo size="md" />
            <span className="text-rose-500 font-mono text-xs font-semibold px-1.5 py-0.5 bg-rose-950/60 border border-rose-800/50 rounded-md">CLOUD</span>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <button
              onClick={() => setActiveTab('home')}
              className={`hover:text-white transition-colors ${activeTab === 'home' ? 'text-rose-400 font-bold' : ''}`}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab('features')}
              className={`hover:text-white transition-colors ${activeTab === 'features' ? 'text-rose-400 font-bold' : ''}`}
            >
              Features
            </button>
            <button
              onClick={() => setActiveTab('showcase')}
              className={`hover:text-white transition-colors ${activeTab === 'showcase' ? 'text-rose-400 font-bold' : ''}`}
            >
              Interactive Showcase
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`hover:text-white transition-colors ${activeTab === 'faq' ? 'text-rose-400 font-bold' : ''}`}
            >
              FAQ
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              className={`hover:text-white transition-colors ${activeTab === 'contact' ? 'text-rose-400 font-bold' : ''}`}
            >
              Contact
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {api.getCurrentUser() ? (
            <div className="flex items-center gap-2">
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  const u = api.getCurrentUser();
                  if (u?.role === 'PLATFORM_ADMIN') onOpenApp('platform');
                  else if (u?.role === 'WAITER') onOpenApp('waiter');
                  else onOpenApp('restaurant');
                }}
                className="text-xs font-bold"
              >
                Go to My Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.logout();
                  window.location.reload();
                }}
                className="text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                icon={<LogOut className="w-3.5 h-3.5" />}
              >
                Log Out
              </Button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsPortalModalOpen(true)}
                className="text-xs font-bold text-slate-300 hover:text-white px-3 py-2 rounded-xl transition-all hover:bg-slate-900 cursor-pointer flex items-center gap-1.5 border border-slate-800"
              >
                <span>Log In</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => onStartTrial()}
                icon={<Sparkles className="w-3.5 h-3.5" />}
                className="shadow-lg shadow-rose-950/40"
              >
                Create Restaurant
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Hero Banner Section */}
      {activeTab === 'home' && (
        <main className="flex-1">
          <section className="relative overflow-hidden pt-12 pb-20 px-4 md:px-8 max-w-7xl mx-auto text-center space-y-8">
            {/* Glow Accents */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-600/15 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-rose-300 font-medium shadow-xl">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Self-Service SaaS Platform for Modern Restaurants</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
              The Complete Operating System for <span className="bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400 bg-clip-text text-transparent">Modern Restaurants</span>
            </h1>

            <p className="text-sm md:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Create your account, set up your restaurant in 7 simple steps, request launch approval, and go live instantly with QR Table Ordering, Kitchen KDS, and Waiter OS.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button
                variant="brand"
                size="lg"
                onClick={() => onStartTrial()}
                icon={<ArrowRight className="w-4 h-4" />}
                className="px-8 py-3 text-sm font-bold shadow-xl shadow-rose-950/60"
              >
                Create Restaurant
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setActiveTab('showcase')}
                icon={<Play className="w-4 h-4 text-amber-400" />}
                className="px-6 py-3 text-sm font-bold bg-slate-900 border-slate-800 hover:bg-slate-800"
              >
                Explore Live Demo
              </Button>
            </div>

            {/* Badges / Ratings */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-slate-400 font-medium">
              <div className="flex items-center gap-1.5">
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                  ))}
                </div>
                <span className="text-white font-bold">Enterprise Grade</span> Architecture
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> No credit card required
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-rose-400" /> Instant 3-minute setup
              </div>
            </div>

            {/* Hero Interactive App Previews Switcher Card */}
            <div className="pt-10 max-w-5xl mx-auto">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 shadow-2xl space-y-3">
                <div className="flex items-center justify-between px-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="text-xs font-mono text-slate-400 ml-2">dinely.cloud/live-preview</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> Live Sync Active
                    </span>
                  </div>
                </div>

                {/* Sub-app Quick Launcher Toolbar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800/80">
                  <button
                    onClick={() => onOpenApp('restaurant')}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white transition-all text-left"
                  >
                    <Utensils className="w-4 h-4 text-rose-400" />
                    <div>
                      <div className="text-white">POS Dashboard</div>
                      <div className="text-[10px] text-slate-400 font-normal">Launch Live App →</div>
                    </div>
                  </button>

                  <button
                    onClick={() => onOpenApp('waiter')}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white transition-all text-left"
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-white">Waiter Terminal OS</div>
                      <div className="text-[10px] text-slate-400 font-normal">Launch Handheld →</div>
                    </div>
                  </button>

                  <button
                    onClick={() => onOpenApp('customer')}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white transition-all text-left"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-white">Customer QR App</div>
                      <div className="text-[10px] text-slate-400 font-normal">Scan & Order →</div>
                    </div>
                  </button>

                  <button
                    onClick={() => onOpenApp('platform')}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-white transition-all text-left"
                  >
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <div>
                      <div className="text-white">Platform Admin</div>
                      <div className="text-[10px] text-slate-400 font-normal">SaaS Control →</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Core Platform Capabilities Banner */}
          <section className="bg-slate-900/60 border-y border-slate-800/80 py-8 px-4">
            <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="space-y-1">
                <div className="text-xl md:text-2xl font-black text-white font-mono">Real-Time</div>
                <div className="text-xs text-slate-400 font-medium">WebSocket Event Sync</div>
              </div>
              <div className="space-y-1">
                <div className="text-xl md:text-2xl font-black text-rose-400 font-mono">Multi-Terminal</div>
                <div className="text-xs text-slate-400 font-medium">Waiter, Kitchen & Bar Terminals</div>
              </div>
              <div className="space-y-1">
                <div className="text-xl md:text-2xl font-black text-amber-400 font-mono">Persistent</div>
                <div className="text-xs text-slate-400 font-medium">Database Table Session Engine</div>
              </div>
              <div className="space-y-1">
                <div className="text-xl md:text-2xl font-black text-emerald-400 font-mono">Self-Service</div>
                <div className="text-xs text-slate-400 font-medium">Guided Onboarding Wizard</div>
              </div>
            </div>
          </section>

          {/* Core Feature Pillars */}
          <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-3">
              <Badge variant="brand">POWERFUL MODULES</Badge>
              <h2 className="text-3xl md:text-4xl font-black text-white">
                Everything Your Restaurant Needs to Flourish
              </h2>
              <p className="text-xs md:text-sm text-slate-400 max-w-xl mx-auto">
                Dinely Cloud replaces 5 different fragmented software tools with one integrated, real-time operating system.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Contactless QR Ordering</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Generate table-specific QR codes. Guests scan on mobile to view photo menus, customize options, split bills, and order without waiting.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-rose-400" /> Instant Mobile Web Checkout</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-rose-400" /> Multi-language & Allergen Filter</li>
                </ul>
              </Card>

              {/* Feature 2 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Waiter Terminal OS</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Handheld waiter interface for quick table assignment, instant order placement, guest call response, bill printing, and table status.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400" /> Real-time Guest Call Notifications</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-amber-400" /> Table Floorplan Heatmap</li>
                </ul>
              </Card>

              {/* Feature 3 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Flame className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Smart Kitchen KDS & ETAs</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Color-coded kitchen tickets, prep timers, course pacing, and automated ETA calculation synced directly to guest smartphones.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Color-coded Prep Timers</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" /> Course Firing & Expeditor Mode</li>
                </ul>
              </Card>

              {/* Feature 4 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Menu & 86ing Engine</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Update dish prices, add daily specials, or 86 sold-out items in 1 click across all customer screens, waiter handhelds, and POS terminals.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-blue-400" /> 1-Click 86ing across all channels</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-blue-400" /> Photo & Modifier Category Builder</li>
                </ul>
              </Card>

              {/* Feature 5 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Multi-Branch Platform</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Oversee single venues or nationwide franchise chains from one central dashboard. Manage permissions, inventory, and group revenue.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400" /> Centralized Franchising Control</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-indigo-400" /> Role-Based Access Controls (RBAC)</li>
                </ul>
              </Card>

              {/* Feature 6 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Wine className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Bar Terminal & Mixology KDS</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dedicated bartender terminal for cocktail routing, drink prep queues, age verification checks, and automated beverage dispatch.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-purple-400" /> Dedicated Cocktail Order Routing</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-purple-400" /> Age Verification & Beverage Queue</li>
                </ul>
              </Card>

              {/* Feature 7 */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Audit Logs & Security</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Full security compliance with strict multi-tenant isolation, real-time audit logs, role permissions, and SSL encrypted checkout.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-violet-400" /> Tenant-Isolated Storage</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-violet-400" /> Granular Employee PIN Security</li>
                </ul>
              </Card>
            </div>
          </section>
        </main>
      )}

      {/* Interactive Showcase View */}
      {(activeTab === 'showcase' || activeTab === 'features') && (
        <section className="py-12 px-4 md:px-8 max-w-7xl mx-auto space-y-8 flex-1">
          <div className="text-center space-y-2">
            <Badge variant="brand">LIVE INTERACTIVE SHOWCASE</Badge>
            <h2 className="text-3xl font-black text-white">Experience Dinely Operating Systems</h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Switch between modules to preview the exact interface your staff and diners will use.
            </p>
          </div>

          {/* Sub-App Tab Switcher */}
          <div className="flex justify-center border-b border-slate-800 pb-4">
            <div className="inline-flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 gap-2">
              <button
                onClick={() => setShowcaseTab('pos')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  showcaseTab === 'pos' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Utensils className="w-4 h-4" /> Restaurant POS Dashboard
              </button>
              <button
                onClick={() => setShowcaseTab('waiter')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  showcaseTab === 'waiter' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-4 h-4" /> Waiter Terminal OS
              </button>
              <button
                onClick={() => setShowcaseTab('kds')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  showcaseTab === 'kds' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Flame className="w-4 h-4" /> Kitchen Display (KDS)
              </button>
              <button
                onClick={() => setShowcaseTab('bar')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  showcaseTab === 'bar' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wine className="w-4 h-4" /> Bar Terminal KDS
              </button>
              <button
                onClick={() => setShowcaseTab('customer')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  showcaseTab === 'customer' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Customer QR App
              </button>
            </div>
          </div>

          {/* Interactive Preview Container */}
          <Card className="bg-slate-900 border-slate-800 p-6 space-y-6">
            {showcaseTab === 'pos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Utensils className="w-5 h-5 text-rose-500" /> Restaurant POS & Operations
                    </h3>
                    <p className="text-xs text-slate-400">Complete control over live orders, floor plan, staff, and inventory.</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => onOpenApp('restaurant')}>
                    Launch Full POS App →
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-xs text-slate-400">POS Revenue Engine</div>
                    <div className="text-xl font-bold text-emerald-400 font-mono">Live Order Billing</div>
                    <div className="text-[10px] text-emerald-500">Automated Tax & Receipt Calc</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-xs text-slate-400">Floor Table Layout</div>
                    <div className="text-xl font-bold text-amber-400 font-mono">Real-Time Sessions</div>
                    <div className="text-[10px] text-amber-500">Active / Vacant Heatmap</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-xs text-slate-400">Station Kitchen KDS</div>
                    <div className="text-xl font-bold text-rose-400 font-mono">Automated ETA</div>
                    <div className="text-[10px] text-rose-500">Station Firing & Course Pacing</div>
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'waiter' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" /> Waiter Terminal OS
                    </h3>
                    <p className="text-xs text-slate-400">Mobile handheld web app for waitstaff to manage floor and guest requests.</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => onOpenApp('waiter')}>
                    Launch Waiter OS →
                  </Button>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                    <span>Live Table Floorplan Status</span>
                    <span className="text-amber-400 font-bold">4 Pending Waiter Requests</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                      <div className="text-xs font-bold text-white">Table 01</div>
                      <Badge variant="warning">Call Waiter</Badge>
                      <div className="text-[10px] text-slate-400">Seated 25m ago</div>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                      <div className="text-xs font-bold text-white">Table 02</div>
                      <Badge variant="info">Bill Requested</Badge>
                      <div className="text-[10px] text-slate-400">Total $118.50</div>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                      <div className="text-xs font-bold text-white">Table 03</div>
                      <Badge variant="success">Eating</Badge>
                      <div className="text-[10px] text-slate-400">Prep Done</div>
                    </div>
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                      <div className="text-xs font-bold text-white">Table 04</div>
                      <Badge variant="secondary">Available</Badge>
                      <div className="text-[10px] text-slate-400">Cleaned & Ready</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'kds' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Flame className="w-5 h-5 text-emerald-500" /> Kitchen Display System (KDS)
                    </h3>
                    <p className="text-xs text-slate-400">Real-time tickets with prep timers and course firing.</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => onOpenApp('restaurant')}>
                    View Kitchen KDS →
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <span className="font-bold text-amber-400">Ticket #ORD-8821 • Table 04</span>
                      <span className="font-mono text-amber-300 font-bold">ETA: 8 mins</span>
                    </div>
                    <ul className="text-xs text-slate-200 space-y-1">
                      <li>• 2x Wagyu Beef Burger (Medium Well)</li>
                      <li>• 1x Truffle Parmesan Fries</li>
                    </ul>
                    <Button variant="secondary" size="sm" className="w-full text-xs">
                      Mark Complete
                    </Button>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <span className="font-bold text-slate-300">Ticket #ORD-8822 • Table 01</span>
                      <span className="font-mono text-emerald-400 font-bold">READY TO SERVE</span>
                    </div>
                    <ul className="text-xs text-slate-200 space-y-1">
                      <li>• 1x Artisanal Burrata & Fig Salad</li>
                      <li>• 2x Aperol Spritz</li>
                    </ul>
                    <Button variant="success" size="sm" className="w-full text-xs">
                      Notified Waiter 🎉
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'bar' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Wine className="w-5 h-5 text-purple-400" /> Bar Terminal & Mixology KDS
                    </h3>
                    <p className="text-xs text-slate-400">Dedicated bartender interface for drink queues, cocktail recipes, & legal age confirmation.</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => onOpenApp('restaurant')}>
                    Launch Bar Terminal →
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <span className="font-bold text-slate-300">Ticket #DRK-104 • Bar Lounge</span>
                      <span className="font-mono text-purple-400 font-bold">PREPARING 🍸</span>
                    </div>
                    <ul className="text-xs text-slate-200 space-y-1">
                      <li>• 2x Signature Smoked Old Fashioned</li>
                      <li>• 1x Artisanal Espresso Martini</li>
                    </ul>
                    <Button variant="brand" size="sm" className="w-full text-xs bg-purple-600 hover:bg-purple-500 text-white">
                      Mark Drinks Ready
                    </Button>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <span className="font-bold text-slate-300">Age Verification Gate</span>
                      <span className="font-mono text-emerald-400 font-bold">VERIFIED 21+</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Automated legal drinking age check enforced before diners can order from craft cocktail & spirit menus.
                    </p>
                    <Badge variant="warning" className="text-[10px]">
                      Compliant Beverage Workflow
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {showcaseTab === 'customer' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-blue-500" /> Mobile Customer QR Experience
                    </h3>
                    <p className="text-xs text-slate-400">Mobile-optimized web menu for diners at table 01.</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => onOpenApp('customer')}>
                    Launch Customer App →
                  </Button>
                </div>

                <div className="max-w-md mx-auto p-4 bg-slate-950 border border-slate-800 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300 pb-2 border-b border-slate-800">
                    <span className="font-bold text-rose-400">Lumiere Bistro • Table 01</span>
                    <Badge variant="brand">QR Active</Badge>
                  </div>
                  <div className="flex items-center gap-3 p-2 bg-slate-900 rounded-xl">
                    <img src="https://images.unsplash.com/photo-1544025162-d76694265947?w=150" alt="dish" className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white">Wagyu Ribeye Steak</div>
                      <div className="text-[10px] text-slate-400">$48.00 • Truffle Butter</div>
                    </div>
                    <Button variant="brand" size="sm" className="text-xs px-2.5">
                      + Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* Pricing Section */}
      {activeTab === 'pricing' && (
        <section className="py-16 px-4 md:px-8 max-w-7xl mx-auto space-y-12 flex-1">
          <div className="text-center space-y-4">
            <Badge variant="brand">TRANSPARENT PRICING</Badge>
            <h2 className="text-3xl md:text-5xl font-black text-white">Simple Plans for Every Restaurant</h2>
            <p className="text-xs md:text-sm text-slate-400 max-w-xl mx-auto">
              Start with a 14-day free trial. Upgrade or cancel anytime with zero hidden contracts.
            </p>

            {/* Billing Switcher */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-400'}`}>
                Monthly Billing
              </span>
              <button
                onClick={() => setBillingCycle((prev) => (prev === 'monthly' ? 'annual' : 'monthly'))}
                className="w-12 h-6 rounded-full bg-slate-800 p-1 flex items-center border border-slate-700 transition-all cursor-pointer"
              >
                <div
                  className={`w-4 h-4 rounded-full bg-rose-500 transition-transform ${
                    billingCycle === 'annual' ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${billingCycle === 'annual' ? 'text-white' : 'text-slate-400'}`}>
                Annual Billing <span className="px-2 py-0.5 bg-rose-950 text-rose-300 text-[10px] font-bold rounded-full border border-rose-800">Save 20%</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
            {/* Starter Plan */}
            <Card className="bg-slate-900 border-slate-800 p-6 space-y-6 flex flex-col justify-between hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Starter Plan</h3>
                  <p className="text-xs text-slate-400">Ideal for small cafes, food trucks, & pop-up diners.</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white font-mono">
                    ${billingCycle === 'annual' ? '39' : '49'}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>

                <ul className="text-xs text-slate-300 space-y-2.5 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Up to 10 QR Tables</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Digital Menu & QR Ordering</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Basic POS Dashboard</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Email Support</li>
                </ul>
              </div>

              <Button variant="secondary" className="w-full" onClick={() => setShowTrialModal(true)}>
                Start Starter Trial
              </Button>
            </Card>

            {/* Growth Pro Plan */}
            <Card className="bg-slate-900 border-rose-500/80 p-6 space-y-6 flex flex-col justify-between shadow-2xl shadow-rose-950/40 relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white text-[10px] font-black tracking-wider uppercase rounded-full shadow">
                MOST POPULAR CHOICE
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Growth Pro</h3>
                  <p className="text-xs text-slate-400">For busy restaurants needing full Waiter OS & KDS.</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-rose-400 font-mono">
                    ${billingCycle === 'annual' ? '99' : '129'}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>

                <ul className="text-xs text-slate-200 space-y-2.5 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-rose-400" /> Unlimited QR Tables & Orders</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-rose-400" /> Waiter Terminal OS Handhelds</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-rose-400" /> Kitchen Display KDS & ETA Engine</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-rose-400" /> Inventory 86ing & Staff Clock-in</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-rose-400" /> Custom Theme Styling</li>
                </ul>
              </div>

              <Button variant="brand" className="w-full shadow-lg shadow-rose-950/60" onClick={() => setShowTrialModal(true)}>
                Start 14-Day Free Trial
              </Button>
            </Card>

            {/* Enterprise Plan */}
            <Card className="bg-slate-900 border-slate-800 p-6 space-y-6 flex flex-col justify-between hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Enterprise Chain</h3>
                  <p className="text-xs text-slate-400">Multi-unit restaurant groups and franchise brands.</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white font-mono">
                    ${billingCycle === 'annual' ? '249' : '299'}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>

                <ul className="text-xs text-slate-300 space-y-2.5 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400" /> Multi-Branch Franchising Control</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400" /> Custom Domain Mapping</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400" /> Dedicated Account Manager & 24/7 SLA</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4 text-indigo-400" /> Custom API & ERP Integrations</li>
                </ul>
              </div>

              <Button variant="secondary" className="w-full" onClick={() => setShowTrialModal(true)}>
                Contact Enterprise Sales
              </Button>
            </Card>
          </div>
        </section>
      )}


      {/* FAQ Section */}
      {activeTab === 'faq' && (
        <section className="py-16 px-4 md:px-8 max-w-4xl mx-auto space-y-8 flex-1">
          <div className="text-center space-y-2">
            <Badge variant="brand">FREQUENTLY ASKED QUESTIONS</Badge>
            <h2 className="text-3xl font-black text-white">Got Questions? We Have Answers.</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 transition-all cursor-pointer"
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                >
                  <div className="flex items-center justify-between text-sm font-bold text-white">
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-rose-400' : ''}`} />
                  </div>
                  {isOpen && <p className="text-xs text-slate-300 pt-3 leading-relaxed border-t border-slate-800 mt-3">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contact Section */}
      {activeTab === 'contact' && (
        <section className="py-16 px-4 md:px-8 max-w-3xl mx-auto space-y-8 flex-1">
          <div className="text-center space-y-2">
            <Badge variant="brand">GET IN TOUCH</Badge>
            <h2 className="text-3xl font-black text-white">Contact Dinely Sales & Support</h2>
            <p className="text-xs text-slate-400">We respond in under 15 minutes during business hours.</p>
          </div>

          <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
            {contactSubmitted ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-bold text-white">Message Received!</h3>
                <p className="text-xs text-slate-300">Thank you for reaching out. Our platform team will contact you shortly.</p>
                <Button variant="secondary" size="sm" onClick={() => setContactSubmitted(false)}>
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setContactSubmitted(true);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Your Name" placeholder="Alex Mercer" required />
                  <Input label="Email Address" type="email" placeholder="alex@restaurant.com" required />
                </div>
                <Input label="Restaurant Name" placeholder="Lumiere Bistro" />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">How can we help?</label>
                  <textarea
                    rows={4}
                    placeholder="Tell us about your restaurant setup or custom requirements..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>
                <Button variant="brand" className="w-full" type="submit" icon={<Send className="w-3.5 h-3.5" />}>
                  Submit Inquiry
                </Button>
              </form>
            )}
          </Card>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800/80 pt-12 pb-8 px-4 md:px-8 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-xs text-slate-400">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <DinelyLogo size="sm" />
              <span className="text-xs font-semibold text-rose-500 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/50 font-mono">CLOUD</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              The next-generation multi-tenant cloud operating system for cafes, bars, and fine dining establishments.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-slate-200 mb-3">Product Applications</h4>
            <ul className="space-y-2">
              <li className="hover:text-white cursor-pointer" onClick={() => onOpenApp('restaurant')}>POS Operations Dashboard</li>
              <li className="hover:text-white cursor-pointer" onClick={() => onOpenApp('waiter')}>Waiter Terminal OS</li>
              <li className="hover:text-white cursor-pointer" onClick={() => onOpenApp('customer')}>Customer QR Ordering</li>
              <li className="hover:text-white cursor-pointer" onClick={() => onOpenApp('platform')}>Platform Admin Console</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-200 mb-3">Navigation</h4>
            <ul className="space-y-2">
              <li className="hover:text-white cursor-pointer" onClick={() => setActiveTab('features')}>Features</li>
              <li className="hover:text-white cursor-pointer" onClick={() => setActiveTab('showcase')}>Interactive Showcase</li>
              <li className="hover:text-white cursor-pointer" onClick={() => setActiveTab('faq')}>FAQ</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-200 mb-3">Security & Platform</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Multi-tenant isolated restaurant workspaces with 256-bit encryption and instant platform launch verification.
            </p>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> All Systems Operational
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 mt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-600">
          <div>© {new Date().getFullYear()} Dinely Cloud Inc. All rights reserved.</div>
          <div className="flex items-center gap-4 mt-2 sm:mt-0">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security</span>
          </div>
        </div>
      </footer>

      {/* Sleek Role & Staff Portal Selector Modal */}
      <Modal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        title="Select Your Dedicated Role Portal"
      >
        <div className="space-y-5 text-slate-100 p-1">
          <p className="text-xs text-slate-400">
            Select your assigned staff terminal or operating portal to sign in:
          </p>

          {/* Section 1: Staff Operational Terminals */}
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
                className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <ChefHat className="w-4 h-4 text-amber-400" />
                  <span>Kitchen KDS</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">Kitchen prep queue & timers for chefs</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/waiter/login';
                }}
                className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <PhoneCall className="w-4 h-4 text-emerald-400" />
                  <span>Waiter Terminal</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">Floor table dispatch & service calls</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  window.location.pathname = '/bar/login';
                }}
                className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <Wine className="w-4 h-4 text-purple-400" />
                  <span>Bar Terminal</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">Mixology queue & drink fulfillment</p>
              </button>
            </div>
          </div>

          {/* Section 2: Management & System Control */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <p className="text-[11px] font-mono font-bold text-rose-400 uppercase tracking-wider">
              Management & Platform Administration
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  onOpenApp('restaurant');
                }}
                className="p-3.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-2xl text-left space-y-1 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                  <Utensils className="w-4 h-4 text-rose-400" />
                  <span>Restaurant Owner OS</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">POS, menu pricing, staff roster & analytics</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  onOpenApp('platform');
                }}
                className="p-3.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left space-y-1 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Platform Admin Control Plane</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">Isolated system admin & cloud verification</p>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
