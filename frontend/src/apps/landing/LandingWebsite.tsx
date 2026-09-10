import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  ChefHat,
  Receipt,
  Store,
  ArrowRight,
  ChevronDown,
  Smartphone,
  ClipboardList,
  Menu,
  X,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { DinelyLogo } from '../../packages/ui';

interface LandingWebsiteProps {
  onStartTrial: (ownerData?: any) => void;
  onLogin: () => void;
  onOpenApp: (app: 'restaurant' | 'waiter' | 'customer' | 'platform') => void;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  currentUser?: any;
}

// ─── Animated entrance wrapper ───
function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(18px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
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

  const [localUser, setLocalUser] = useState<any>(() => propUser || api.getCurrentUser());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setLocalUser(propUser !== undefined ? propUser : api.getCurrentUser());
  }, [propUser]);

  const currentUser = propUser !== undefined ? propUser : localUser;

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'Product', href: '#product' },
    { label: 'Solutions', href: '#solutions' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
  ];

  return (
    <section className="relative h-screen w-full overflow-hidden select-none" role="banner">
      {/* ─── Background Video ─── */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        {/* Cinematic restaurant atmosphere — Pixabay free stock */}
        <source
          src="https://cdn.pixabay.com/video/2022/11/30/141046-776768279_large.mp4"
          type="video/mp4"
        />
        <source
          src="https://cdn.pixabay.com/video/2015/10/27/1192-143842659_large.mp4"
          type="video/mp4"
        />
      </video>

      {/* ─── Subtle readability scrim (bottom half only, preserves video) ─── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.08) 100%)',
        }}
      />

      {/* ─── Foreground Content ─── */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* ═══════════ NAVIGATION ═══════════ */}
        <FadeUp delay={100}>
          <header className="flex w-full items-center justify-between px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
            {/* Brand */}
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center cursor-pointer bg-transparent border-none text-white"
              aria-label="Dinely Home"
            >
              <DinelyLogo size="md" />
            </button>

            {/* Desktop Nav (hidden below md) */}
            <nav className="hidden items-center gap-3 md:flex" aria-label="Primary navigation">
              {/* Glass pill cluster */}
              <div className="flex items-center gap-0.5 rounded-full bg-white/[0.08] px-1.5 py-1.5 backdrop-blur-xl border border-white/[0.06]">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              {/* Auth Actions */}
              {currentUser ? (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentUser?.role === 'WAITER') onOpenApp('waiter');
                      else onOpenApp('restaurant');
                    }}
                    className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
                    style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                  >
                    My Workspace
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-2">
                  <button
                    type="button"
                    onClick={() => onLogin()}
                    className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white cursor-pointer bg-transparent border-none"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartTrial()}
                    className="rounded-full px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer border-none"
                    style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
                  >
                    Create your restaurant
                  </button>
                </div>
              )}
            </nav>

            {/* Mobile Hamburger (md:hidden) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.06] md:hidden cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              <Menu
                className={`absolute h-5 w-5 text-white transition-all duration-300 ${
                  mobileMenuOpen ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
                }`}
              />
              <X
                className={`absolute h-5 w-5 text-white transition-all duration-300 ${
                  mobileMenuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
                }`}
              />
            </button>
          </header>
        </FadeUp>

        {/* ═══════════ MOBILE DRAWER ═══════════ */}
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-md transition-opacity duration-300 md:hidden ${
            mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <aside
          className={`fixed right-0 top-0 z-40 flex h-full w-72 flex-col bg-black/90 backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden border-l border-white/[0.06] ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-1 px-6 pt-24">
            {navLinks.map((link, idx) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-3.5 text-[15px] font-medium text-white/70 transition-all hover:bg-white/[0.06] hover:text-white"
                style={{
                  transitionDuration: '400ms',
                  transitionDelay: mobileMenuOpen ? `${(idx + 1) * 60}ms` : '0ms',
                  opacity: mobileMenuOpen ? 1 : 0,
                  transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(24px)',
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Drawer bottom CTA */}
          <div
            className="mt-auto px-6 pb-10"
            style={{
              transitionDuration: '400ms',
              transitionDelay: mobileMenuOpen ? '320ms' : '0ms',
              opacity: mobileMenuOpen ? 1 : 0,
              transform: mobileMenuOpen ? 'translateY(0)' : 'translateY(16px)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onStartTrial();
              }}
              className="w-full rounded-full py-3 text-center text-[13px] font-medium text-white transition-opacity hover:opacity-90 cursor-pointer border-none"
              style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
            >
              Create your restaurant
            </button>
          </div>
        </aside>

        {/* ═══════════ HERO CONTENT — pinned to bottom ═══════════ */}
        <main className="mt-auto flex flex-col gap-6 px-5 pb-8 sm:gap-8 sm:px-8 sm:pb-12 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:pb-12">
          {/* ── LEFT: Headline + Supporting Text + Dominant Primary CTA ── */}
          <FadeUp delay={250} className="max-w-xl">
            <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em] text-white sm:text-[2.75rem] lg:text-[3.25rem]">
              Your restaurant,
              <br />
              completely connected.
            </h1>

            <p className="mt-4 text-[14px] leading-relaxed text-white/70 sm:mt-5 sm:text-[15px] max-w-md">
              Create your restaurant on Dinely and run ordering, Kitchen, Waiter, Bar, Inventory and Billing from one connected platform.
            </p>

            {/* Dominant Primary CTA + Secondary CTA */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-3.5">
              <button
                type="button"
                onClick={() => onStartTrial()}
                className="group inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-black/50 border border-white/[0.12]"
                style={{ background: 'linear-gradient(to bottom, #2E2E2E, #111111)' }}
              >
                <span>Create your restaurant</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[13px] font-medium text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] backdrop-blur-xl transition-colors cursor-pointer"
              >
                <span>See how it works</span>
                <ChevronDown className="h-3.5 w-3.5 text-white/50" />
              </button>
            </div>
          </FadeUp>

          {/* ── RIGHT: Two Glass Product Cards (hidden on mobile to fit viewport) ── */}
          <FadeUp delay={450} className="hidden sm:flex flex-col gap-4 sm:flex-row lg:w-auto lg:gap-4 lg:shrink-0">
            {/* ───── CARD 1: YOUR RESTAURANT ───── */}
            <div className="rounded-2xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.08] p-5 sm:w-72 flex flex-col justify-between transition-all duration-300 hover:border-white/[0.14] hover:-translate-y-0.5 shadow-2xl shadow-black/40">
              <div>
                {/* Header tag & title */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                    YOUR RESTAURANT
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    New Workspace
                  </span>
                </div>

                <p className="text-[14px] font-semibold text-white tracking-tight">
                  Create your restaurant
                </p>

                {/* Elegant workspace product illustration */}
                <div className="mt-3.5 rounded-xl bg-black/30 border border-white/[0.07] p-3 space-y-2.5">
                  {/* Restaurant profile setup */}
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/[0.06]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08] border border-white/[0.08] text-white/80 shrink-0">
                      <Store className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-white truncate">
                          Your Restaurant
                        </span>
                      </div>
                      <p className="text-[10px] text-white/40 truncate">
                        yourbrand.dinely.food
                      </p>
                    </div>
                  </div>

                  {/* Progressive setup checklist */}
                  <div className="space-y-1.5 pt-0.5">
                    {[
                      { step: 'Your menu', hint: 'Digital catalog' },
                      { step: 'Your tables & QR', hint: 'Auto-generated' },
                      { step: 'Your orders', hint: 'Live tickets' },
                      { step: 'Your team', hint: 'Kitchen • Bar' },
                      { step: 'Your operations', hint: 'Billing & stock' },
                    ].map((item) => (
                      <div
                        key={item.step}
                        className="flex items-center justify-between text-[11px] text-white/70"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="text-white/30 text-[10px]">→</span>
                          <span>{item.step}</span>
                        </span>
                        <span className="text-[10px] text-white/35 font-mono">{item.hint}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workflow lifecycle indicator: CREATE → CUSTOMIZE → GO LIVE → OPERATE */}
                <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 text-[9px] font-medium tracking-wider text-white/45 uppercase">
                  <span className="text-white font-semibold">Create</span>
                  <span className="text-white/20">→</span>
                  <span className="text-white/60">Customize</span>
                  <span className="text-white/20">→</span>
                  <span className="text-emerald-400 font-medium">Go Live</span>
                  <span className="text-white/20">→</span>
                  <span className="text-white/60">Operate</span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-white/40 leading-snug">
                Your own digital restaurant workspace.
              </p>
            </div>

            {/* ───── CARD 2: Everything connected ───── */}
            <div className="rounded-2xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.08] p-5 sm:w-72 flex flex-col justify-between transition-all duration-300 hover:border-white/[0.14] hover:-translate-y-0.5 shadow-2xl shadow-black/40">
              <div>
                {/* Header tag & title */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                    OPERATIONS
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/60">
                    Real-time
                  </span>
                </div>

                <p className="text-[14px] font-semibold text-white tracking-tight">
                  Everything connected
                </p>

                {/* Compact vertical flow */}
                <div className="mt-3.5 space-y-0">
                  {/* 1. Customer */}
                  <div className="flex items-center justify-between rounded-lg bg-black/25 border border-white/[0.05] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/80">
                        <Smartphone className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11.5px] font-medium text-white/90">Customer</span>
                    </div>
                    <span className="text-[10px] text-white/40">At table</span>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <div className="h-2 w-[1px] bg-white/20" />
                  </div>

                  {/* 2. QR Menu */}
                  <div className="flex items-center justify-between rounded-lg bg-black/25 border border-white/[0.05] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/80">
                        <QrCode className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11.5px] font-medium text-white/90">QR Menu</span>
                    </div>
                    <span className="text-[10px] text-white/40">Instant browse</span>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <div className="h-2 w-[1px] bg-white/20" />
                  </div>

                  {/* 3. Order */}
                  <div className="flex items-center justify-between rounded-lg bg-black/25 border border-white/[0.05] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/80">
                        <ClipboardList className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11.5px] font-medium text-white/90">Order</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">Live ticket</span>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <div className="h-2 w-[1px] bg-white/20" />
                  </div>

                  {/* 4. Kitchen / Waiter / Bar */}
                  <div className="flex items-center justify-between rounded-lg bg-black/25 border border-white/[0.05] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/80">
                        <ChefHat className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11.5px] font-medium text-white/90">Kitchen / Waiter / Bar</span>
                    </div>
                    <span className="text-[10px] text-white/40">Stations</span>
                  </div>

                  <div className="flex justify-center py-0.5">
                    <div className="h-2 w-[1px] bg-white/20" />
                  </div>

                  {/* 5. Billing */}
                  <div className="flex items-center justify-between rounded-lg bg-black/25 border border-white/[0.05] px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/80">
                        <Receipt className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[11.5px] font-medium text-white/90">Billing</span>
                    </div>
                    <span className="text-[10px] text-white/40">Settled</span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-white/40 leading-snug">
                One connected flow from table to terminal.
              </p>
            </div>
          </FadeUp>
        </main>
      </div>
    </section>
  );
};
