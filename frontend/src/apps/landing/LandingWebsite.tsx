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
  Sun,
  Moon,
  Search,
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
  const [heroEmail, setHeroEmail] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const [showcaseTab, setShowcaseTab] = useState<'pos' | 'waiter' | 'kds' | 'bar' | 'customer'>('pos');
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  const currentUser = api.getCurrentUser();

  const faqs = [
    {
      q: 'How does joining Dinely Cloud work?',
      a: 'Simply authenticate with Google, configure your restaurant through our 4-step wizard (basics, location, tables, review), and click "Submit for Approval". Once our platform admin team approves your setup, your restaurant workspace goes live instantly!',
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
    <div className="min-h-screen bg-[#121316] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* selfh.st Inspired Clean Navigation Header */}
      <header className="sticky top-0 z-40 bg-[#121316]/90 backdrop-blur-md border-b border-slate-800/60 px-4 md:px-8 py-3 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xl font-black tracking-tight text-white font-mono">
              dinely<span className="text-blue-500">.cloud</span>
            </span>
          </div>
        </div>

        {/* Grouped Pill Navigation Container */}
        <nav className="hidden md:flex items-center gap-6 rounded-full bg-[#18191c] border border-slate-800/80 px-6 py-2 text-xs font-medium text-slate-300 shadow-lg">
          <button
            onClick={() => setActiveTab('home')}
            className={`hover:text-white transition-colors cursor-pointer ${activeTab === 'home' ? 'text-blue-400 font-bold' : ''}`}
          >
            Content ▾
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`hover:text-white transition-colors cursor-pointer ${activeTab === 'features' ? 'text-blue-400 font-bold' : ''}`}
          >
            Apps
          </button>
          <button
            onClick={() => setActiveTab('showcase')}
            className={`hover:text-white transition-colors cursor-pointer ${activeTab === 'showcase' ? 'text-blue-400 font-bold' : ''}`}
          >
            Showcase
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`hover:text-white transition-colors cursor-pointer ${activeTab === 'faq' ? 'text-blue-400 font-bold' : ''}`}
          >
            FAQ
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`hover:text-white transition-colors cursor-pointer ${activeTab === 'contact' ? 'text-blue-400 font-bold' : ''}`}
          >
            Submit Content
          </button>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPortalModalOpen(true)}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#18191c] transition-colors cursor-pointer"
            title="Search portals"
          >
            <Search className="w-4 h-4" />
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (currentUser?.role === 'PLATFORM_ADMIN') onOpenApp('platform');
                  else if (currentUser?.role === 'WAITER') onOpenApp('waiter');
                  else onOpenApp('restaurant');
                }}
                className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2 transition-all shadow-md shadow-blue-950/40 cursor-pointer"
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
                className="text-xs font-bold text-slate-300 hover:text-white px-4 py-2 rounded-full border border-slate-800 hover:border-slate-700 bg-[#18191c] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Log In</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => onStartTrial()}
                className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2 transition-all shadow-lg shadow-blue-950/40 cursor-pointer"
              >
                Subscribe
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {activeTab === 'home' && (
        <main className="flex-1">
          {/* selfh.st Style High-Impact Hero Section */}
          <section className="pt-20 pb-16 px-4 md:px-8 max-w-5xl mx-auto text-center space-y-8">
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
              Next-gen restaurant <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500 bg-clip-text text-transparent">content + OS</span> delivered straight to your venue
            </h1>

            <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Join 30,000+ readers discovering the latest in self-hosted dining software, QR table ordering, Kitchen KDS, and Waiter terminals every Friday
            </p>

            {/* Signature selfh.st Hero Action Pill Input Bar */}
            <div className="w-full max-w-xl mx-auto rounded-full bg-[#18191c] border border-slate-800/90 p-1.5 pl-6 flex items-center shadow-2xl focus-within:border-blue-500 transition-all">
              <input
                type="email"
                placeholder="enter your email address..."
                value={heroEmail}
                onChange={(e) => setHeroEmail(e.target.value)}
                className="bg-transparent text-white font-medium text-xs flex-1 outline-none placeholder:text-slate-500"
              />
              <button
                onClick={() => onStartTrial({ email: heroEmail })}
                className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-7 py-3 shadow-lg shadow-blue-950/50 transition-all shrink-0 cursor-pointer flex items-center gap-2"
              >
                <span>Subscribe</span>
              </button>
            </div>

            {/* Sub-headline Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-mono pt-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>256-bit Isolated Multi-Tenant Architecture</span>
              </div>
              <div>•</div>
              <div>No Credit Card Required</div>
              <div>•</div>
              <div>3-Minute Instant Setup</div>
            </div>
          </section>

          {/* selfh.st Content Section: LATEST CONTENT */}
          <section className="py-12 px-4 md:px-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h2 className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                LATEST CONTENT
              </h2>
              <button
                onClick={() => setActiveTab('showcase')}
                className="text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                Show all &gt;
              </button>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div
                onClick={() => onOpenApp('restaurant')}
                className="bg-[#18191c] border border-slate-800/70 rounded-3xl p-6 hover:border-slate-700 transition-all cursor-pointer group space-y-4 shadow-xl"
              >
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 w-fit text-blue-400 group-hover:scale-110 transition-transform">
                  <Utensils className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-mono text-blue-400 font-bold uppercase">POS Module</div>
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                    POS Terminal OS & Table Floorplan
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Full-service cashier terminal, real-time table floorplan layout, guest ordering, and bill settlement.
                  </p>
                </div>
                <div className="pt-2 text-xs text-blue-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Launch Terminal &rarr;
                </div>
              </div>

              {/* Card 2 */}
              <div
                onClick={() => onOpenApp('waiter')}
                className="bg-[#18191c] border border-slate-800/70 rounded-3xl p-6 hover:border-slate-700 transition-all cursor-pointer group space-y-4 shadow-xl"
              >
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 w-fit text-amber-400 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-mono text-amber-400 font-bold uppercase">Handheld Module</div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                    Waiter Terminal OS
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Mobile handheld order taker, floor table status sync, and instant customer service call notifications.
                  </p>
                </div>
                <div className="pt-2 text-xs text-amber-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Launch Handheld &rarr;
                </div>
              </div>

              {/* Card 3 */}
              <div
                onClick={() => onOpenApp('customer')}
                className="bg-[#18191c] border border-slate-800/70 rounded-3xl p-6 hover:border-slate-700 transition-all cursor-pointer group space-y-4 shadow-xl"
              >
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 w-fit text-emerald-400 group-hover:scale-110 transition-transform">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-mono text-emerald-400 font-bold uppercase">Customer Module</div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Customer QR Mobile App
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    App-less scan & order mobile experience, digital menu with dietary tags, and live order tracking.
                  </p>
                </div>
                <div className="pt-2 text-xs text-emerald-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Scan & Order &rarr;
                </div>
              </div>
            </div>
          </section>

          {/* selfh.st Section: AFFILIATES AND OFFERS / SHOWCASE */}
          <section className="py-12 px-4 md:px-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h2 className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                FEATURED TERMINALS & SYSTEM ARCHITECTURE
              </h2>
              <button
                onClick={() => onStartTrial()}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                Create Restaurant &gt;
              </button>
            </div>

            <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <Badge variant="brand">REAL-TIME WEBSOCKET ENGINE</Badge>
                  <h3 className="text-2xl font-black text-white leading-tight">
                    Instant Multi-Terminal Order & Kitchen Ticket Dispatch
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    When a guest scans a table QR code and submits an order, Dinely instantly routes drinks to the Bar Terminal, food items to the Kitchen KDS, and updates floor waiters in real time.
                  </p>
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={() => onStartTrial()}
                      className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-2.5 shadow-lg shadow-blue-950/40 cursor-pointer"
                    >
                      Start Free Trial
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[#121316] border border-slate-800/80 rounded-2xl space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2 text-[11px]">
                    <span>SYSTEM DISPATCH METRICS</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 100% OPERATIONAL
                    </span>
                  </div>
                  <div className="space-y-2 text-slate-300 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Routing Latency:</span>
                      <span className="text-white font-bold">&lt; 14ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Database Engine:</span>
                      <span className="text-white font-bold">Isolated Tenant Store</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Table QR Generator:</span>
                      <span className="text-white font-bold">Automated Instantiation</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Role Isolation:</span>
                      <span className="text-white font-bold">Enforced (RBAC)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Features View */}
      {activeTab === 'features' && (
        <main className="flex-1 py-12 px-4 md:px-8 max-w-6xl mx-auto space-y-8">
          <div className="border-b border-slate-800/80 pb-4 space-y-1">
            <h1 className="text-2xl font-black text-white">All Platform Features & Terminals</h1>
            <p className="text-xs text-slate-400">Explore the complete suit of self-hosted restaurant modules.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 space-y-3">
              <Utensils className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-bold text-white">POS Terminal OS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cashier checkout, table floorplan management, splitting bills, order modifications, and end-of-day daily closing summaries.
              </p>
            </div>
            <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 space-y-3">
              <ChefHat className="w-6 h-6 text-amber-400" />
              <h3 className="text-lg font-bold text-white">Kitchen Display System (KDS)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dedicated station for kitchen chefs with prep countdown timers, order bumping, ingredient alerts, and ready notifications.
              </p>
            </div>
            <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 space-y-3">
              <Wine className="w-6 h-6 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Bar Terminal KDS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drink prep terminal for bartenders to fulfill cocktail, beverage, and wine orders directly from customer table QR scans.
              </p>
            </div>
            <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 space-y-3">
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
        <main className="flex-1 py-12 px-4 md:px-8 max-w-4xl mx-auto space-y-6">
          <div className="border-b border-slate-800/80 pb-4 space-y-1 text-center">
            <h1 className="text-2xl font-black text-white">Frequently Asked Questions</h1>
            <p className="text-xs text-slate-400">Everything you need to know about joining Dinely Cloud.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-[#18191c] border border-slate-800/80 rounded-2xl p-5 space-y-2"
              >
                <h3 className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{faq.q}</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Contact View */}
      {activeTab === 'contact' && (
        <main className="flex-1 py-12 px-4 md:px-8 max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-white">Submit Content & Inquiries</h1>
            <p className="text-xs text-slate-400">Reach out to the Dinely platform architecture team.</p>
          </div>

          <div className="bg-[#18191c] border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
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
                    className="w-full p-3.5 bg-[#121316] border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-3 shadow-lg shadow-blue-950/50 cursor-pointer"
                >
                  Submit Inquiry
                </button>
              </form>
            )}
          </div>
        </main>
      )}

      {/* Clean selfh.st Style Footer */}
      <footer className="border-t border-slate-800/60 py-8 px-4 md:px-8 bg-[#121316]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="font-mono text-slate-300 font-bold">dinely.cloud</span>
            <span>&copy; {new Date().getFullYear()} Dinely Cloud Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 mt-4 sm:mt-0 font-medium">
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('features')}>Content</span>
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('showcase')}>Apps</span>
            <span className="hover:text-slate-300 cursor-pointer" onClick={() => setActiveTab('faq')}>FAQ</span>
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
                className="p-3 bg-[#121316] hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
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
                className="p-3 bg-[#121316] hover:bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
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
                className="p-3 bg-[#121316] hover:bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-2xl text-left space-y-1.5 transition-all group cursor-pointer"
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
                className="p-3.5 bg-[#121316] hover:bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-2xl text-left space-y-1 transition-all cursor-pointer"
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
                className="p-3.5 bg-[#121316] hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left space-y-1 transition-all cursor-pointer"
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
