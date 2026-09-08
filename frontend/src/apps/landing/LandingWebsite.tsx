import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  QrCode,
  ChefHat,
  Wine,
  PhoneCall,
  Receipt,
  Store,
  ArrowRight,
  Check,
  ChevronDown,
  ShieldCheck,
  Laptop,
  Clock,
  LogOut,
  IndianRupee,
  Layers,
  Sparkles,
  Smartphone,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { Button, Card, Badge, Modal, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';

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

  const [activeJourneyStep, setActiveJourneyStep] = useState<number>(0);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [localUser, setLocalUser] = useState<any>(() => propUser || api.getCurrentUser());

  useEffect(() => {
    setLocalUser(propUser !== undefined ? propUser : api.getCurrentUser());
  }, [propUser]);

  const currentUser = propUser !== undefined ? propUser : localUser;

  const journeySteps = [
    {
      id: 'table',
      step: '01',
      title: 'Guest Scans QR',
      subtitle: 'Instant Digital Menu',
      description: 'Guests seat themselves and scan a discreet table QR code. The branded menu opens instantly in mobile browser with zero app download, zero signup, and clear dietary tags.',
      icon: QrCode,
      tag: 'Table Service',
      preview: {
        headline: 'Table 04 • Lumière Bistro',
        badge: 'Live Guest Session',
        highlight: 'Guest ordered 1x Truffle Risotto, 2x Rosemary Naan, 1x Negroni',
        time: 'Just now',
        status: 'Transmitted to Stations',
      },
    },
    {
      id: 'dispatch',
      step: '02',
      title: 'Instant Station Routing',
      subtitle: 'Kitchen KDS & Bar Sync',
      description: 'Orders split automatically in under 2 seconds. Food tickets route to kitchen cook stations with preparation timers, while handcrafted cocktails route to the bar queue.',
      icon: ChefHat,
      tag: 'Kitchen & Bar',
      preview: {
        headline: 'Ticket #1048 • Kitchen KDS',
        badge: 'Timer: 03:42',
        highlight: 'Station 1: Risotto (In Prep) • Bar Queue: Negroni (Batched)',
        time: '12s elapsed',
        status: 'Cook Station Active',
      },
    },
    {
      id: 'waiter',
      step: '03',
      title: 'Floor Coordination',
      subtitle: 'Waiter Terminal Chimes',
      description: 'When guests tap for water, cutlery, or service, floor staff receive high-priority alerts with exact table numbers. No waving hands, no missed tables.',
      icon: PhoneCall,
      tag: 'Floor Staff',
      preview: {
        headline: 'Table 04 • Service Alert',
        badge: 'Staff Dispatched',
        highlight: 'Table 04 requested: Still Water & Napkins',
        time: 'Response < 45s',
        status: 'Assigned to Rohan S.',
      },
    },
    {
      id: 'billing',
      step: '04',
      title: 'Automated Billing & UPI',
      subtitle: 'Instant Digital Receipt',
      description: 'Itemized invoices with automated CGST/SGST and custom VPA QR codes generate automatically. Guests can pay from their phone and download an official tax invoice.',
      icon: Receipt,
      tag: 'Owner Billing',
      preview: {
        headline: 'Invoice #DIN-8842',
        badge: 'GST Compliant',
        highlight: 'Subtotal ₹520.00 • CGST ₹13.00 • SGST ₹13.00 • Total ₹546.00',
        time: 'Paid via UPI QR',
        status: 'Settled & Reconciled',
      },
    },
  ];

  const businessTypes = [
    {
      id: 'RESTAURANT',
      title: 'Full-Service & Casual Dining',
      badge: 'Tables & Floorplan',
      desc: 'Bistros, cafes, and multi-room restaurants with dining tables, waiter service, and kitchen display integration.',
      features: ['Table session management', 'Waiter call dispatch', 'Kitchen KDS station routing', 'Itemized GST billing'],
      icon: UtensilsCrossed,
    },
    {
      id: 'BAR',
      title: 'Bar & Mixology Lounge',
      badge: 'Beverage Queue',
      desc: 'Cocktail lounges, wine bars, and taprooms prioritizing high-speed drink queues and glassware specifications.',
      features: ['Dedicated bar terminal', 'Batch mixology queue', 'Bottle & pour catalog', 'Fast tab settlement'],
      icon: Wine,
    },
    {
      id: 'FOOD_CART',
      title: 'Food Cart & Quick Counter',
      badge: 'Fast Pickup',
      desc: 'Stalls, food trucks, and takeaway kiosks that require streamlined counter pickup without bar or table complexity.',
      features: ['Counter order numbering', 'Single-station KDS', 'Simplified quick menu', 'Direct UPI QR standee'],
      icon: Store,
    },
  ];

  const faqs = [
    {
      q: 'What is Dinely and how is it different from a basic QR menu or desktop POS?',
      a: 'Most restaurant tools are isolated islands: a PDF QR menu that cannot take orders, or a legacy desktop POS that does not talk to the kitchen. Dinely is one synchronized operating system. When a guest scans a QR code, food tickets route to the kitchen, beverages route to the bar, waiter service requests chime floor tablets, and the owner dashboard updates revenue in real time.',
    },
    {
      q: 'Do I need expensive POS hardware or proprietary tablets?',
      a: 'No. Dinely runs in any modern browser. You can use standard iPads, Android tablets, smartphones, touch POS terminals, or existing kitchen displays. Guests scan table QR codes on their own smartphones with zero app downloads.',
    },
    {
      q: 'How does UPI QR payment work for Indian restaurants?',
      a: 'You enter your Merchant UPI ID (VPA) or upload your standee QR code in the owner billing settings. When a guest requests their check, Dinely dynamically renders their itemized bill with an automated UPI QR code for instant payment via GPay, PhonePe, Paytm, or BHIM.',
    },
    {
      q: 'Can Dinely handle multi-venue or multi-branch restaurant owners?',
      a: 'Yes. Dinely is natively multi-tenant. A single owner account can manage multiple restaurant locations, switch between outlets with one click, and isolate menus, staff, tables, and financial records independently.',
    },
    {
      q: 'How fast do updates happen between the customer and staff terminals?',
      a: 'Under 2 seconds. Dinely uses persistent WebSocket connections. When an order is placed or a service request is triggered, staff displays update immediately with zero manual page refreshing.',
    },
    {
      q: 'How do I get started?',
      a: 'Click "Start Free Trial", configure your restaurant name and venue type (Restaurant, Bar, or Food Cart), set up your tables, and your live restaurant workspace is generated immediately.',
    },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#f3f4f6] flex flex-col font-sans selection:bg-[#f97316] selection:text-[#0b0d11]">
      {/* Editorial Navigation Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#1e232e] bg-[#0b0d11]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Mark */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-8 h-8 rounded-lg bg-[#f97316] flex items-center justify-center text-[#0b0d11] font-bold text-sm shadow-sm">
              D
            </div>
            <span className="text-base font-bold tracking-tight text-white font-display">
              dinely<span className="text-[#f97316]">.food</span>
            </span>
          </div>

          {/* Clean Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-300">
            <button
              onClick={() => scrollToSection('journey')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('venues')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Venue Types
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

          {/* Primary Action Controls */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentUser?.role === 'WAITER') onOpenApp('waiter');
                    else onOpenApp('restaurant');
                  }}
                  className="bg-[#1a1e27] hover:bg-[#222734] border border-[#2d3545] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  My Workspace
                </button>
                <button
                  onClick={async () => {
                    await api.logout();
                    setLocalUser(null);
                    if (onLogout) onLogout();
                    else window.location.reload();
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-[#1a1e27] transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setIsPortalModalOpen(true)}
                  className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 transition-colors cursor-pointer"
                >
                  Sign In
                </button>

                <button
                  onClick={() => onStartTrial()}
                  className="bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 sm:pt-28 pb-16 px-4 sm:px-6 max-w-5xl mx-auto w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2d3545] bg-[#12151b] text-xs font-medium text-slate-300">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" />
          <span>Real-time restaurant operating system</span>
        </div>

        <div className="space-y-5">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1] font-display max-w-4xl mx-auto">
            One system for the whole restaurant.
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed font-normal">
            Dinely connects table QR menus, staff terminals, kitchen displays, and billing into one synchronized operating system. No proprietary hardware. No paper tickets.
          </p>
        </div>

        {/* Primary Call to Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onStartTrial()}
            className="w-full sm:w-auto px-7 py-3 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={() => scrollToSection('journey')}
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#12151b] hover:bg-[#1a1e27] border border-[#2d3545] text-slate-200 font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>See How It Works</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* 4 Core Pillars */}
        <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-3 text-left max-w-4xl mx-auto">
          <div className="p-4 rounded-xl border border-[#1e232e] bg-[#12151b] space-y-1">
            <p className="text-xs font-semibold text-white">Browser Native</p>
            <p className="text-xs text-slate-400">Runs on any iPad, phone, or existing POS touchscreen.</p>
          </div>
          <div className="p-4 rounded-xl border border-[#1e232e] bg-[#12151b] space-y-1">
            <p className="text-xs font-semibold text-white">&lt; 2s Synchronization</p>
            <p className="text-xs text-slate-400">Live WebSockets keep floor and kitchen in sync.</p>
          </div>
          <div className="p-4 rounded-xl border border-[#1e232e] bg-[#12151b] space-y-1">
            <p className="text-xs font-semibold text-white">GST & UPI Engine</p>
            <p className="text-xs text-slate-400">Automated tax invoices and direct merchant UPI codes.</p>
          </div>
          <div className="p-4 rounded-xl border border-[#1e232e] bg-[#12151b] space-y-1">
            <p className="text-xs font-semibold text-white">Multi-Tenant</p>
            <p className="text-xs text-slate-400">Manage multiple restaurants under one owner account.</p>
          </div>
        </div>
      </section>

      {/* Visual Storytelling: The Restaurant Journey */}
      <section id="journey" className="py-20 border-t border-[#1e232e] bg-[#0d0f14]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#f97316]">
              Visual Product Walkthrough
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight font-display">
              How an order moves through Dinely
            </h2>
            <p className="text-sm text-slate-400">
              From the moment a customer sits down to the final settled payment, every step happens automatically.
            </p>
          </div>

          {/* Interactive Step Switcher */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-[#1e232e] pb-4">
            {journeySteps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = activeJourneyStep === idx;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveJourneyStep(idx)}
                  className={`text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? 'border-[#f97316] bg-[#12151b]'
                      : 'border-transparent hover:border-[#2d3545] bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-[#f97316]' : 'text-slate-500'}`}>
                      {s.step}
                    </span>
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#f97316]' : 'text-slate-400'}`} />
                  </div>
                  <p className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {s.title}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Live Demonstration Container */}
          {(() => {
            const current = journeySteps[activeJourneyStep];
            const StepIcon = current.icon;
            return (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center bg-[#12151b] border border-[#1e232e] rounded-2xl p-6 sm:p-8">
                <div className="md:col-span-6 space-y-4 text-left">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1a1e27] border border-[#2d3545] text-[11px] font-mono font-medium text-slate-300">
                    <StepIcon className="w-3.5 h-3.5 text-[#f97316]" />
                    <span>{current.tag}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white font-display">
                    {current.subtitle}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {current.description}
                  </p>
                  <div className="pt-2 flex items-center gap-4 text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-[#10b981]" /> Zero paper delays
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-[#10b981]" /> Real-time status sync
                    </span>
                  </div>
                </div>

                {/* High-Fidelity UI Snippet Metaphor */}
                <div className="md:col-span-6">
                  <div className="rounded-xl border border-[#2d3545] bg-[#0b0d11] p-5 space-y-4 shadow-lg text-left">
                    <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                        <span className="text-xs font-mono font-bold text-white">
                          {current.preview.headline}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1a1e27] text-[#f97316] border border-[#2d3545]">
                        {current.preview.badge}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#12151b] border border-[#1e232e] space-y-2">
                      <p className="text-xs text-slate-200 font-medium">
                        {current.preview.highlight}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
                        <span>Status: {current.preview.status}</span>
                        <span>{current.preview.time}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>Dinely Connected Protocol</span>
                      <span className="text-[#10b981] font-mono">Sync Verified</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Tailored Venue Archetypes */}
      <section id="venues" className="py-20 border-t border-[#1e232e] max-w-5xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center space-y-3 mb-12 max-w-2xl mx-auto">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#f97316]">
            Architected For Your Workflow
          </p>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight font-display">
            Built for how restaurants actually operate
          </h2>
          <p className="text-sm text-slate-400">
            A cocktail bar should not look like a food truck. Dinely adapts modules to your exact service model.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {businessTypes.map((b) => {
            const BIcon = b.icon;
            return (
              <div
                key={b.id}
                className="p-6 rounded-2xl border border-[#1e232e] bg-[#12151b] flex flex-col justify-between space-y-6 text-left"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-[#1a1e27] border border-[#2d3545] flex items-center justify-center text-[#f97316]">
                      <BIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#1a1e27] text-slate-300 border border-[#2d3545]">
                      {b.badge}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-base font-bold text-white font-display">
                      {b.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {b.desc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#1e232e] space-y-2">
                    {b.features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                        <Check className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onStartTrial({ businessType: b.id })}
                  className="w-full py-2.5 rounded-lg border border-[#2d3545] hover:border-[#f97316] bg-[#1a1e27] text-xs font-semibold text-white transition-colors cursor-pointer text-center"
                >
                  Configure This Setup →
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Indian & Global Billing Section */}
      <section id="billing" className="py-20 border-t border-[#1e232e] bg-[#0d0f14]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-6 space-y-6 text-left">
              <div className="space-y-2">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#10b981]">
                  Financial Compliance
                </p>
                <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight font-display">
                  Configurable GST, Custom Invoicing & UPI QR
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Avoid checkout bottlenecks. Dinely generates itemized digital bills with automated CGST/SGST splitting and one-tap UPI payments for Indian dining venues.
                </p>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Itemized CGST & SGST Splitting:</strong> Compliant tax calculations with custom tax rates (5%, 12%, 18%).
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Dynamic UPI VPA Standees:</strong> Guests scan the bill on their phone and complete payment directly via GPay, PhonePe, or Paytm.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Official Tax Invoice Export:</strong> Customers can view and download GST-compliant digital receipts anytime.
                  </div>
                </div>
              </div>
            </div>

            {/* Bill Preview Card */}
            <div className="md:col-span-6">
              <div className="p-6 rounded-2xl border border-[#2d3545] bg-[#12151b] space-y-4 shadow-xl text-left">
                <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                  <div>
                    <p className="text-xs font-mono font-bold text-white">TAX INVOICE #DIN-1048</p>
                    <p className="text-[11px] text-slate-500 font-mono">GSTIN: 27AABCL1234F1Z9</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 font-bold">
                    PAID • UPI
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono text-slate-300">
                  <div className="flex justify-between">
                    <span>1x Paneer Butter Masala</span>
                    <span>₹280.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2x Garlic Butter Naan</span>
                    <span>₹120.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1x Mango Lassi</span>
                    <span>₹90.00</span>
                  </div>
                  <div className="border-t border-[#1e232e] pt-2 space-y-1 text-slate-400 text-[11px]">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>₹490.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CGST (2.5%)</span>
                      <span>₹12.25</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST (2.5%)</span>
                      <span>₹12.25</span>
                    </div>
                    <div className="flex justify-between text-sm text-white font-bold pt-1 border-t border-[#1e232e]">
                      <span>Grand Total</span>
                      <span className="text-[#f97316]">₹514.50</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-20 border-t border-[#1e232e] max-w-3xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center space-y-3 mb-10">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#f97316]">
            Questions & Answers
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3 text-left">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="border border-[#1e232e] rounded-xl bg-[#12151b] overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 flex items-center justify-between gap-4 text-xs font-semibold text-white text-left cursor-pointer hover:bg-[#1a1e27] transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-[#f97316]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs text-slate-400 leading-relaxed border-t border-[#1e232e]">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="py-16 border-t border-[#1e232e] bg-[#0d0f14] text-center px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold text-white tracking-tight font-display">
            Ready to streamline your restaurant?
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Create your restaurant in under 3 minutes. No contract, no hardware purchase required.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onStartTrial()}
              className="px-8 py-3.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-sm transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Clean Minimalist Footer */}
      <footer className="border-t border-[#1e232e] py-8 px-4 sm:px-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300 font-display">dinely.food</span>
            <span>•</span>
            <span>Connected Restaurant Operating System</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsPortalModalOpen(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Staff & Terminal Login
            </button>
            <button
              onClick={() => navigate('/admin/login')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Platform Console
            </button>
          </div>
        </div>
      </footer>

      {/* Staff & Owner Portal Modal */}
      {isPortalModalOpen && (
        <Modal
          isOpen={isPortalModalOpen}
          onClose={() => setIsPortalModalOpen(false)}
          title="Access Dinely Workspace"
        >
          <div className="space-y-4 text-left">
            <p className="text-xs text-slate-400">
              Select your role or portal to sign in to your restaurant operating system:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  onLogin();
                }}
                className="p-4 rounded-xl border border-[#2d3545] bg-[#12151b] hover:border-[#f97316] text-left transition-all cursor-pointer space-y-1"
              >
                <p className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Restaurant Owner</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#f97316]" />
                </p>
                <p className="text-[11px] text-slate-400">Manage venues, menus, staff, tables & billing</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  navigate('/waiter/login');
                }}
                className="p-4 rounded-xl border border-[#2d3545] bg-[#12151b] hover:border-[#f97316] text-left transition-all cursor-pointer space-y-1"
              >
                <p className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Waiter Terminal</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#f97316]" />
                </p>
                <p className="text-[11px] text-slate-400">Floor service requests & active dining tables</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  navigate('/kitchen/login');
                }}
                className="p-4 rounded-xl border border-[#2d3545] bg-[#12151b] hover:border-[#f97316] text-left transition-all cursor-pointer space-y-1"
              >
                <p className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Kitchen KDS</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#f97316]" />
                </p>
                <p className="text-[11px] text-slate-400">Live order tickets, timers & cook bump board</p>
              </button>

              <button
                onClick={() => {
                  setIsPortalModalOpen(false);
                  navigate('/bar/login');
                }}
                className="p-4 rounded-xl border border-[#2d3545] bg-[#12151b] hover:border-[#f97316] text-left transition-all cursor-pointer space-y-1"
              >
                <p className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Bar Terminal</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#f97316]" />
                </p>
                <p className="text-[11px] text-slate-400">Cocktails, mixology queue & pour orders</p>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
