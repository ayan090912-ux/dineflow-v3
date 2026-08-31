import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Zap,
  Smartphone,
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
  Receipt,
  QrCode,
  Package,
  Cpu,
  Store,
  ChevronRight,
  IndianRupee,
  RefreshCw,
  Sliders,
  Shield,
  Layers3,
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { navigate } from '../../packages/router';

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
  const navigate = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.href = path;
  };
  const [activeModuleTab, setActiveModuleTab] = useState<'customer' | 'waiter' | 'kitchen' | 'bar' | 'inventory' | 'owner'>('customer');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [localUser, setLocalUser] = useState<any>(() => propUser || api.getCurrentUser());

  useEffect(() => {
    setLocalUser(propUser !== undefined ? propUser : api.getCurrentUser());
  }, [propUser]);

  const currentUser = propUser !== undefined ? propUser : localUser;

  const faqs = [
    {
      q: 'What is Dinely and how is it different from a basic QR menu or POS?',
      a: 'Most apps only handle one part of a restaurant—like printing a bill or displaying a PDF menu. Dinely is a complete real-time operating system. When a guest scans a table QR code and places an order, the food ticket instantly routes to the Kitchen KDS, drinks route to the Bar Terminal, guest service requests chime the Waiter Terminal in under 2 seconds, and the Owner Billing system calculates GST and UPI payments automatically.',
    },
    {
      q: 'Do I need expensive POS hardware, tablets, or proprietary terminals?',
      a: 'No proprietary hardware is required. Dinely runs on any modern web browser—including iPads, Android tablets, smartphones, and existing touchscreen POS terminals. Customers simply scan the table QR code on their own mobile devices without downloading any app.',
    },
    {
      q: 'How does UPI QR payment work on customer bills?',
      a: 'In your Owner Billing settings, you enter your Merchant UPI ID (VPA) and display name, or upload your physical standee QR. When a customer requests their bill, Dinely displays the exact bill amount with an automated UPI QR code and deep link (GPay, PhonePe, Paytm, BHIM) for instant payment.',
    },
    {
      q: 'Can Dinely adapt to my specific restaurant type (e.g. Bar or Food Cart)?',
      a: 'Yes. During our 4-step onboarding wizard, you select your business type (Restaurant, Bar, or Food Cart). Food Carts get a streamlined counter setup without bar clutter; Bars get a dedicated mixology queue; and Full-Service Restaurants get floorplans, table sessions, waiter dispatch, and kitchen management.',
    },
    {
      q: 'How fast do updates happen between the customer and staff?',
      a: 'Instantly. Dinely uses persistent WebSocket connections. When a customer taps "Request Water" or places an order, the Waiter and Kitchen terminals update in real time with zero manual page refreshes.',
    },
    {
      q: 'How do I get started with Dinely?',
      a: 'Click "Start Your Restaurant Free", enter your restaurant details, configure your tables or counters, select your terminals, and your live restaurant workspace is generated immediately.',
    },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {/* Dynamic Background Glow Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[650px] bg-gradient-to-b from-indigo-900/15 via-purple-900/10 to-transparent blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-[800px] -right-40 w-[600px] h-[600px] bg-indigo-900/10 blur-[160px] pointer-events-none z-0" />
      <div className="absolute top-[1800px] -left-40 w-[600px] h-[600px] bg-emerald-900/10 blur-[160px] pointer-events-none z-0" />

      {/* Floating Header Navbar */}
      <div className="sticky top-4 z-50 px-4 sm:px-6 md:px-8 max-w-6xl mx-auto w-full">
        <header className="rounded-full bg-[#10121a]/90 border border-slate-800/80 backdrop-blur-xl px-5 sm:px-6 py-2.5 flex items-center justify-between shadow-2xl shadow-black/80">
          {/* Brand Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-lg font-black tracking-tight text-white font-mono">
              dinely<span className="text-indigo-400">.food</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <button
              onClick={() => scrollToSection('problem')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              The Problem
            </button>
            <button
              onClick={() => scrollToSection('flow')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('modules')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Product Modules
            </button>
            <button
              onClick={() => scrollToSection('business-types')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Business Types
            </button>
            <button
              onClick={() => scrollToSection('billing')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Billing & UPI
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              FAQ
            </button>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentUser?.role === 'WAITER') onOpenApp('waiter');
                    else onOpenApp('restaurant');
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg transition-all cursor-pointer"
                >
                  My Dashboard
                </button>
                <button
                  onClick={async () => {
                    await api.logout();
                    setLocalUser(null);
                    if (onLogout) {
                      onLogout();
                    } else if (onNavigate) {
                      onNavigate('/');
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="p-2 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Log Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setIsPortalModalOpen(true)}
                  className="text-xs font-bold text-slate-300 hover:text-white px-3.5 py-1.5 rounded-full border border-slate-800 hover:border-slate-700 bg-slate-900/80 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Sign In</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => onStartTrial()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Start Free</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </header>
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 sm:pt-24 pb-16 sm:pb-24 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs font-semibold text-indigo-300 shadow-sm animate-fade-in">
          <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Real-Time Connected Restaurant Operating System</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.15] max-w-4xl mx-auto">
            Run Your Entire Restaurant From{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-200">
              One Connected Platform.
            </span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Dinely connects table QR menus, staff terminals, kitchen KDS, bar orders, inventory, and UPI billing into one zero-latency cloud operating system.
          </p>
        </div>

        {/* Dual Primary Call-to-Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onStartTrial()}
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer group"
          >
            <span>Start Your Restaurant Free</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => scrollToSection('flow')}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
            <span>See How It Works</span>
          </button>
        </div>

        {/* Value Metric Badges */}
        <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto text-left">
          <div className="p-3.5 rounded-xl bg-[#11131c] border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs">
              <Laptop className="w-3.5 h-3.5" />
              <span>Zero Lock-in</span>
            </div>
            <p className="text-[11px] text-slate-400">Runs on any iPad, Android, phone, or browser</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#11131c] border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
              <Activity className="w-3.5 h-3.5" />
              <span>&lt; 2s Realtime</span>
            </div>
            <p className="text-[11px] text-slate-400">Zero manual page refresh across all terminals</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#11131c] border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <IndianRupee className="w-3.5 h-3.5" />
              <span>UPI & GST Ready</span>
            </div>
            <p className="text-[11px] text-slate-400">Custom standee QR, VPA & automated tax bills</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#11131c] border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
              <Sliders className="w-3.5 h-3.5" />
              <span>Modular Setup</span>
            </div>
            <p className="text-[11px] text-slate-400">Tailored for Restaurant, Bar, or Food Cart</p>
          </div>
        </div>

        {/* Live Connected Pipeline Visual Card */}
        <div className="pt-6">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#111420]/90 border border-indigo-500/20 backdrop-blur-xl shadow-2xl space-y-6 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                  Interactive Ecosystem
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  The Connected Dinely Dining Pipeline
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 self-start sm:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live WebSocket Sync
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 relative">
              {/* Step 1: Customer */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative group hover:border-indigo-500/50 transition-all">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono font-bold text-xs">
                  01
                </div>
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Table QR Menu</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Customer scans table QR code. Views digital menu, adds items, and submits order.
                </p>
              </div>

              {/* Step 2: Waiter OS */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative group hover:border-purple-500/50 transition-all">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-mono font-bold text-xs">
                  02
                </div>
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-purple-400" />
                  <span>Waiter Terminal</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Receives guest service requests (Water, Cutlery, Bill) and chimes immediately.
                </p>
              </div>

              {/* Step 3: Kitchen KDS */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative group hover:border-rose-500/50 transition-all">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-mono font-bold text-xs">
                  03
                </div>
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-rose-400" />
                  <span>Kitchen KDS</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Cooks track tickets with preparation timers, modify status, and mark plates ready.
                </p>
              </div>

              {/* Step 4: Bar Queue */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative group hover:border-amber-500/50 transition-all">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
                  04
                </div>
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <Wine className="w-3.5 h-3.5 text-amber-400" />
                  <span>Bar Terminal</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Beverages route to the bartender queue. Synchronized with table session orders.
                </p>
              </div>

              {/* Step 5: Billing & UPI */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 relative group hover:border-emerald-500/50 transition-all">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs">
                  05
                </div>
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GST Bill & UPI</span>
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Automated invoice generation with taxes. Customer pays via configured UPI QR.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem vs Solution Section */}
      <section id="problem" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
            Why Restaurants Struggle
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            The Cost of Disconnected Restaurant Software
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Traditional restaurants juggle 4–5 unintegrated tools: paper KOTs, offline billing desktops, and unmanaged QR standees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Traditional Disconnected */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#12131b] border border-rose-500/20 space-y-5">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <span>Traditional Fragmented Setup</span>
            </div>

            <ul className="space-y-3.5 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Lost Orders:</strong> Paper tickets get misplaced between floor staff and kitchen burners.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Customer Waiting Fatigue:</strong> Guests wave hands for 10–15 minutes just to ask for water or their bill.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Static UPI QR Chaos:</strong> Table standee QRs don't know the bill total, causing cashier bottlenecks.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Zero Central Visibility:</strong> The owner cannot see real-time floor occupancy or active ticket turnaround.</span>
              </li>
            </ul>
          </div>

          {/* Connected Dinely Setup */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#121422] border border-emerald-500/30 space-y-5 shadow-xl shadow-emerald-950/20">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span>The Dinely Connected System</span>
            </div>

            <ul className="space-y-3.5 text-xs text-slate-200">
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong>Instant Digital Flow:</strong> Orders route to kitchen & bar displays in milliseconds without paper.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong>1-Tap Service Calls:</strong> Customers tap "Water" or "Bill" and the assigned waiter receives a chime.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong>Automated UPI Checkout:</strong> Dynamic bill amount generated directly on customer phone with UPI QR.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong>Real-Time Owner Dashboard:</strong> Live table sessions, revenue, inventory levels, and shift closing in one place.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6-Step Dining Lifecycle Flow */}
      <section id="flow" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
            End-to-End Guest Journey
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            How Dinely Powers a Table from Scan to Settlement
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            A frictionless digital dining experience that speeds up table turnover and keeps staff perfectly coordinated.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Step 1 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              1
            </div>
            <h3 className="font-bold text-sm text-white">Table QR Scan</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customer sits at Table 04 and scans the QR code. The mobile menu opens instantly in mobile browser without requiring an app download or account creation.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              2
            </div>
            <h3 className="font-bold text-sm text-white">Smart Order Routing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Guest selects Garlic Butter Naan and Mojitos. Dinely automatically routes food to the Kitchen KDS and drinks to the Bar Terminal in real time.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              3
            </div>
            <h3 className="font-bold text-sm text-white">1-Tap Service Calls</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Guest taps "Water Requested" on their phone. The Waiter Terminal receives the call instantly with table number and priority chime.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              4
            </div>
            <h3 className="font-bold text-sm text-white">KDS Preparation Timers</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Chefs manage prep countdown timers on the KDS touchscreen. When food is ready, the chef taps "Ready", alerting the waiter for delivery.
            </p>
          </div>

          {/* Step 5 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              5
            </div>
            <h3 className="font-bold text-sm text-white">Automated GST & UPI Checkout</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customer taps "Request Bill". Dinely computes itemized CGST/SGST taxes, displays the owner's UPI QR code, and enables 1-click payment.
            </p>
          </div>

          {/* Step 6 */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs font-mono">
              6
            </div>
            <h3 className="font-bold text-sm text-white">Fast Table Turnover</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Waiter marks the session completed. The table resets to "Available" across all staff terminals, ready for the next customer scan.
            </p>
          </div>
        </div>
      </section>

      {/* Product Modules Deep Dive */}
      <section id="modules" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-10">
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
            Dedicated Workspaces
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Built for Every Role in Your Restaurant
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            From the guest table to the head chef and general manager, Dinely provides role-scoped interfaces with zero clutter.
          </p>
        </div>

        {/* Module Switcher Tabs */}
        <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-4 scrollbar-none">
          {[
            { id: 'customer', label: 'Customer App', icon: <QrCode className="w-3.5 h-3.5" /> },
            { id: 'waiter', label: 'Waiter Terminal', icon: <PhoneCall className="w-3.5 h-3.5" /> },
            { id: 'kitchen', label: 'Kitchen KDS', icon: <ChefHat className="w-3.5 h-3.5" /> },
            { id: 'bar', label: 'Bar Terminal', icon: <Wine className="w-3.5 h-3.5" /> },
            { id: 'inventory', label: 'Inventory OS', icon: <Package className="w-3.5 h-3.5" /> },
            { id: 'owner', label: 'Owner Control Plane', icon: <Utensils className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveModuleTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                activeModuleTab === tab.id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'bg-[#11131c] text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Active Module Card Content */}
        <div className="mt-6 p-6 sm:p-8 rounded-2xl bg-[#11131c] border border-slate-800 space-y-6">
          {activeModuleTab === 'customer' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <QrCode className="w-4 h-4" />
                  <span>Customer Mobile Web Experience</span>
                </div>
                <Badge variant="brand">Guest Facing</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                A fast, lightweight web application that runs directly in Safari or Chrome when scanning a table QR standee. Zero app download, zero password signup friction.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Interactive Menu</h4>
                  <p className="text-[11px] text-slate-400">High-res photos, veg/non-veg tags, spice levels & descriptions.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">1-Tap Service Calls</h4>
                  <p className="text-[11px] text-slate-400">Call waiter for Water, Cutlery, Clean Table or Custom assistance.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Instant UPI Payment</h4>
                  <p className="text-[11px] text-slate-400">View bill breakdown with GST and pay directly via GPay / PhonePe / BHIM.</p>
                </div>
              </div>
            </div>
          )}

          {activeModuleTab === 'waiter' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <PhoneCall className="w-4 h-4" />
                  <span>Waiter Terminal OS</span>
                </div>
                <Badge variant="info">Floor Operations</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                Dedicated tablet and mobile interface for floor captains and servers. Instant sound chime alerts for guest service calls and ready kitchen plates.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Live Service Queue</h4>
                  <p className="text-[11px] text-slate-400">Sort calls by priority, accept requests, and mark fulfilled in real time.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Ready Plates Feed</h4>
                  <p className="text-[11px] text-slate-400">Real-time alerts when kitchen finishes an order so food is served hot.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Table Floorplan & Sessions</h4>
                  <p className="text-[11px] text-slate-400">Track active table timers, order totals, and close tables upon payment.</p>
                </div>
              </div>
            </div>
          )}

          {activeModuleTab === 'kitchen' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <ChefHat className="w-4 h-4" />
                  <span>Kitchen Display System (KDS)</span>
                </div>
                <Badge variant="warning">Kitchen Station</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                High-contrast, touchscreen-ready ticket display for head chefs and line cooks. Eliminates thermal paper printers and misplaced paper tickets.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">ETA & Prep Timers</h4>
                  <p className="text-[11px] text-slate-400">Live countdown clock per ticket with color-coded delay warnings.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Station Item Routing</h4>
                  <p className="text-[11px] text-slate-400">Automatically separates food items for the hot line from bar cocktails.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">1-Tap Status Updates</h4>
                  <p className="text-[11px] text-slate-400">Mark items as Preparing, Ready, or Completed with live waiter notifications.</p>
                </div>
              </div>
            </div>
          )}

          {activeModuleTab === 'bar' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <Wine className="w-4 h-4" />
                  <span>Bar Terminal & Mixology Queue</span>
                </div>
                <Badge variant="warning">Bar Station</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                Streamlined drink queue for bartenders. Keeps alcoholic and beverage orders synchronized with table sessions without cross-contaminating kitchen food tickets.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Beverage Dispatch</h4>
                  <p className="text-[11px] text-slate-400">Separate cocktail and mocktail tickets with special customer notes.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Mixology Queue</h4>
                  <p className="text-[11px] text-slate-400">Track drink queue speed and mark beverages ready for floor pickup.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Modular Activation</h4>
                  <p className="text-[11px] text-slate-400">Easily toggled on for bars and lounges, or disabled for food carts.</p>
                </div>
              </div>
            </div>
          )}

          {activeModuleTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Package className="w-4 h-4" />
                  <span>Inventory OS</span>
                </div>
                <Badge variant="info">Supply Chain</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                Real-time ingredient and stock management. Track raw materials, set low-stock reorder thresholds, and log supplier procurement receipts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Low-Stock Alerts</h4>
                  <p className="text-[11px] text-slate-400">Automatic warnings when dairy, coffee beans, or meats reach minimum levels.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Unit Cost Tracking</h4>
                  <p className="text-[11px] text-slate-400">Monitor unit purchase price trends across suppliers to protect margins.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Supplier Directory</h4>
                  <p className="text-[11px] text-slate-400">Log vendor contact details, payment terms, and delivery schedules.</p>
                </div>
              </div>
            </div>
          )}

          {activeModuleTab === 'owner' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Utensils className="w-4 h-4" />
                  <span>Restaurant Owner OS & Control Plane</span>
                </div>
                <Badge variant="success">Management</Badge>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                The central nerve center for restaurant owners and general managers. View live orders, table floorplans, billing records, taxes, staff permissions, and business day summaries.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Live POS & Floorplan</h4>
                  <p className="text-[11px] text-slate-400">View real-time table statuses, create manual walk-in orders, and manage tables.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Billing & Taxes</h4>
                  <p className="text-[11px] text-slate-400">Configure GSTIN, tax rates, service charge, and UPI standee QR codes.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <h4 className="font-bold text-xs text-slate-200">Workspace & Terminals</h4>
                  <p className="text-[11px] text-slate-400">Toggle optional terminals (e.g. Bar or Waiter) with 1 click and zero data loss.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tailored Business Types */}
      <section id="business-types" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
            Adaptable Architecture
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Only Use What Your Business Actually Needs
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Dinely is not a one-size-fits-all rigid POS. Choose your business model and your workspace automatically configures the right terminals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Business Type 1: Restaurant */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#11131c] border border-slate-800 space-y-5 hover:border-indigo-500/50 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Full-Service Restaurant</h3>
                <p className="text-xs text-slate-400 mt-1">Dine-in cafes, bistros, fine dining & casual eateries.</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-mono uppercase text-slate-400 font-bold">Enabled Terminals:</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Kitchen KDS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Waiter Terminal</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Inventory OS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Owner Billing</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-semibold">+ Optional Bar</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onStartTrial({ businessType: 'RESTAURANT' })}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              Configure Restaurant Setup →
            </button>
          </div>

          {/* Business Type 2: Bar */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#11131c] border border-slate-800 space-y-5 hover:border-purple-500/50 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Wine className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Bar & Lounge</h3>
                <p className="text-xs text-slate-400 mt-1">Cocktail bars, taprooms, pubs & mixology lounges.</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-mono uppercase text-slate-400 font-bold">Enabled Terminals:</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold">Bar Terminal</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Kitchen KDS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Waiter Terminal</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Inventory OS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Owner Billing</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onStartTrial({ businessType: 'BAR' })}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              Configure Bar Setup →
            </button>
          </div>

          {/* Business Type 3: Food Cart */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#11131c] border border-slate-800 space-y-5 hover:border-amber-500/50 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Food Cart & Kiosk</h3>
                <p className="text-xs text-slate-400 mt-1">Food trucks, quick-service stalls, takeaway counters.</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <p className="text-[11px] font-mono uppercase text-slate-400 font-bold">Enabled Terminals:</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Kitchen KDS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Inventory OS</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">Owner Billing</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-200">+ Optional Counter</span>
                  <span className="text-[11px] px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300">No Bar clutter</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onStartTrial({ businessType: 'FOOD_CART' })}
              className="w-full mt-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              Configure Food Cart Setup →
            </button>
          </div>
        </div>
      </section>

      {/* Native Indian Billing, Taxes & UPI Section */}
      <section id="billing" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-5">
            <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              Native Indian Billing Engine
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Configurable GST, Custom Invoice Numbering & UPI QR
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Dinely includes complete tax management and instant payment reconciliation built specifically for Indian dining businesses.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Automated CGST & SGST Splitting</h4>
                  <p className="text-[11px] text-slate-400">Configure 5%, 12%, or 18% tax rates with compliant itemized breakdowns.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Merchant UPI ID & Custom Standee QR</h4>
                  <p className="text-[11px] text-slate-400">Enter your UPI VPA or upload your custom standee graphic for 1-click mobile checkout.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Check className="w-3 h-3" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Digital E-Bills & Invoices</h4>
                  <p className="text-[11px] text-slate-400">Customers can view, download, or save official tax invoices right on their smartphone.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Billing Preview Card */}
          <div className="p-6 rounded-2xl bg-[#11131c] border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-mono font-bold text-slate-300">Live Customer Bill Preview</span>
              <Badge variant="success">GST Compliant</Badge>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Table 04 • Session #1048</span>
                <span>2 Items</span>
              </div>
              <div className="flex justify-between text-slate-200 pt-1">
                <span>1x Paneer Butter Masala</span>
                <span>₹280.00</span>
              </div>
              <div className="flex justify-between text-slate-200">
                <span>2x Butter Naan</span>
                <span>₹120.00</span>
              </div>
              <div className="border-t border-slate-800/80 pt-2 space-y-1 text-slate-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹400.00</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST (2.5%)</span>
                  <span>₹10.00</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST (2.5%)</span>
                  <span>₹10.00</span>
                </div>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-white">
                <span>Total Amount Due</span>
                <span className="text-emerald-400">₹420.00</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <div className="text-[11px] font-medium text-slate-400">Pay via Restaurant UPI</div>
              <div className="inline-block p-2 rounded-lg bg-white">
                <QrCode className="w-16 h-16 text-slate-950" />
              </div>
              <div className="text-[10px] font-mono text-slate-400">7488933071@ybl</div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 md:px-8 max-w-4xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-12">
          <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
            Clear & Transparent
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Everything you need to know about setting up and running Dinely in your restaurant.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-[#11131c] border border-slate-800 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-900/50 transition-colors"
                >
                  <span className="font-bold text-xs sm:text-sm text-slate-100">{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-indigo-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* High-Impact Bottom CTA Banner */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 md:px-8 max-w-5xl mx-auto border-t border-slate-800/80 text-center relative">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-[#151828] to-[#10121d] border border-indigo-500/30 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-3">
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
              Get Started in Minutes
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight max-w-2xl mx-auto">
              Ready to Connect Your Entire Restaurant Operations?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
              Replace disconnected POS devices, paper tickets, and manual communication with one synchronized restaurant operating system.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onStartTrial()}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>Create Your Restaurant Workspace</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => setIsPortalModalOpen(true)}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white font-bold text-sm transition-all cursor-pointer"
            >
              Sign In to Existing Outlet
            </button>
          </div>
        </div>
      </section>

      {/* Clean Footer */}
      <footer className="py-8 border-t border-slate-900 text-center text-xs text-slate-400 space-y-3 px-4">
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <button onClick={() => scrollToSection('flow')} className="hover:text-slate-200 transition-colors cursor-pointer">How It Works</button>
          <button onClick={() => scrollToSection('modules')} className="hover:text-slate-200 transition-colors cursor-pointer">Product Modules</button>
          <button onClick={() => scrollToSection('business-types')} className="hover:text-slate-200 transition-colors cursor-pointer">Business Types</button>
          <button onClick={() => scrollToSection('billing')} className="hover:text-slate-200 transition-colors cursor-pointer">Billing & UPI</button>
          <button onClick={() => scrollToSection('faq')} className="hover:text-slate-200 transition-colors cursor-pointer">FAQ</button>
          <button onClick={() => setIsPortalModalOpen(true)} className="hover:text-slate-200 transition-colors cursor-pointer">Staff Login</button>
        </div>
        <p className="text-[11px] text-slate-400">
          © {new Date().getFullYear()} Dinely Cloud. Multi-Tenant Restaurant Operating System. All rights reserved.
        </p>
      </footer>

      {/* Sign In / Portal Selector Modal */}
      <Modal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        title="Sign In to Dinely"
        maxWidth="md"
      >
        <div className="space-y-4 p-1">
          <p className="text-xs text-slate-400">
            Select your assigned role or management portal to continue:
          </p>

          <div className="space-y-2">
            <button
              onClick={() => {
                setIsPortalModalOpen(false);
                if (onNavigate) onNavigate('/restaurant/login');
                else navigate('/restaurant/login');
              }}
              className="w-full p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-left space-y-1 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                <Utensils className="w-4 h-4 text-indigo-400" /> Restaurant Owner & Manager Portal
              </div>
              <div className="text-[11px] text-slate-400">Access your live floorplan, revenue analytics, menu, and billing setup.</div>
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Operational Staff Terminals
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  if (onNavigate) onNavigate('/waiter/login');
                  else navigate('/waiter/login');
                }}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 rounded-xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <PhoneCall className="w-3.5 h-3.5" /> Waiter OS
                </div>
                <div className="text-[10px] text-slate-400">Floor calls & table sessions</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  if (onNavigate) onNavigate('/kitchen/login');
                  else navigate('/kitchen/login');
                }}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 rounded-xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                  <ChefHat className="w-3.5 h-3.5" /> Kitchen KDS
                </div>
                <div className="text-[10px] text-slate-400">Live order prep queue</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  if (onNavigate) onNavigate('/bar/login');
                  else navigate('/bar/login');
                }}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <Wine className="w-3.5 h-3.5" /> Bar Terminal
                </div>
                <div className="text-[10px] text-slate-400">Cocktails & beverages</div>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  if (onNavigate) onNavigate('/inventory/login');
                  else navigate('/inventory/login');
                }}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/50 rounded-xl text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                  <Package className="w-3.5 h-3.5" /> Inventory OS
                </div>
                <div className="text-[10px] text-slate-400">Raw materials & stocks</div>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
