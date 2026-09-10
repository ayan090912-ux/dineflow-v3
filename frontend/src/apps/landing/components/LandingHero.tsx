import React from 'react';
import {
  ArrowRight,
  ChevronDown,
  Store,
  Smartphone,
  QrCode,
  ClipboardList,
  ChefHat,
  Receipt,
} from 'lucide-react';

interface LandingHeroProps {
  onStartTrial: () => void;
  onSeeHowItWorks: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onStartTrial,
  onSeeHowItWorks,
}) => {
  return (
    <section className="relative min-h-[calc(100vh-80px)] w-full flex flex-col justify-between overflow-hidden select-none pb-16 lg:pb-24 pt-4 sm:pt-8">
      {/* Background Video with Atmosphere */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        <source
          src="https://cdn.pixabay.com/video/2022/11/30/141046-776768279_large.mp4"
          type="video/mp4"
        />
        <source
          src="https://cdn.pixabay.com/video/2015/10/27/1192-143842659_large.mp4"
          type="video/mp4"
        />
      </video>

      {/* Readability Scrim (Preserves video clarity while ensuring text contrast) */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to top, rgba(11,13,17,0.92) 0%, rgba(11,13,17,0.55) 50%, rgba(11,13,17,0.25) 100%)',
        }}
      />

      {/* Foreground Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 w-full my-auto">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-12 lg:gap-10 pt-8 sm:pt-12">
          {/* Left Column: Headline, Copy, Primary CTAs */}
          <div className="max-w-xl">
            <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.6rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              Your restaurant,
              <br />
              completely connected.
            </h1>

            <p className="mt-5 text-[15px] sm:text-[16px] leading-relaxed text-white/80 max-w-lg">
              Create your restaurant on Dinely and run ordering, Kitchen, Waiter, Bar, Inventory and Billing from one connected platform.
            </p>

            {/* Primary & Secondary CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                type="button"
                onClick={onStartTrial}
                className="group inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-xl shadow-black/60 border border-white/[0.14]"
                style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
              >
                <span>Create your restaurant</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>

              <button
                type="button"
                onClick={onSeeHowItWorks}
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-medium text-white/85 transition-all duration-200 hover:text-white hover:bg-white/[0.08] cursor-pointer bg-white/[0.04] backdrop-blur-md border border-white/[0.10]"
              >
                <span>See how it works</span>
                <ChevronDown className="h-4 w-4 text-white/60" />
              </button>
            </div>
          </div>

          {/* Right Column: Hero Product Preview Cards */}
          <div className="flex flex-col sm:flex-row gap-4 lg:gap-5 w-full lg:w-auto shrink-0">
            {/* Card 1: YOUR RESTAURANT Preview */}
            <div
              className="w-full sm:w-[270px] rounded-2xl p-4.5 border border-white/[0.12] backdrop-blur-2xl flex flex-col justify-between shadow-2xl shadow-black/70"
              style={{
                background: 'linear-gradient(135deg, rgba(25,28,34,0.75) 0%, rgba(14,16,20,0.85) 100%)',
              }}
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase text-white/50 mb-3">
                  <span>YOUR RESTAURANT</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    New Workspace
                  </span>
                </div>

                <div className="text-[14px] font-semibold text-white mb-2">
                  Create your restaurant
                </div>

                {/* Tenant Workspace Box */}
                <div className="rounded-xl bg-white/[0.05] p-3 border border-white/[0.08] mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-white/[0.08] flex items-center justify-center text-white/80 shrink-0">
                      <Store className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">
                        Your Restaurant
                      </div>
                      <div className="text-[11px] text-white/45 font-mono truncate">
                        yourbrand.dinely.food
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations Checklist */}
                <div className="space-y-1.5 text-[11.5px] text-white/70">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-white/45">&rarr; Your menu</span>
                    <span className="font-mono text-[10.5px] text-white/80">Digital catalog</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-white/45">&rarr; Your tables &amp; QR</span>
                    <span className="font-mono text-[10.5px] text-white/80">Auto-generated</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-white/45">&rarr; Your orders</span>
                    <span className="font-mono text-[10.5px] text-emerald-400">Live tickets</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-white/45">&rarr; Your team</span>
                    <span className="font-mono text-[10.5px] text-white/80">Kitchen &bull; Bar</span>
                  </div>
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-white/45">&rarr; Your operations</span>
                    <span className="font-mono text-[10.5px] text-white/80">Billing &amp; stock</span>
                  </div>
                </div>
              </div>

              {/* Progress Flow Footer */}
              <div className="mt-4 pt-3 border-t border-white/[0.08]">
                <div className="text-[9.5px] font-mono tracking-wide text-white/40 uppercase">
                  CREATE &rarr; CUSTOMIZE &rarr; <span className="text-emerald-400 font-semibold">GO LIVE</span> &rarr; OPERATE
                </div>
                <div className="text-[11px] text-white/50 mt-1">
                  Your own digital restaurant workspace.
                </div>
              </div>
            </div>

            {/* Card 2: OPERATIONS (Everything Connected) Preview */}
            <div
              className="w-full sm:w-[270px] rounded-2xl p-4.5 border border-white/[0.12] backdrop-blur-2xl flex flex-col justify-between shadow-2xl shadow-black/70"
              style={{
                background: 'linear-gradient(135deg, rgba(25,28,34,0.75) 0%, rgba(14,16,20,0.85) 100%)',
              }}
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase text-white/50 mb-3">
                  <span>OPERATIONS</span>
                  <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-white/60 font-mono">
                    Real-time
                  </span>
                </div>

                <div className="text-[14px] font-semibold text-white mb-2.5">
                  Everything connected
                </div>

                {/* Real-time Flow Nodes */}
                <div className="space-y-1.5">
                  {/* Step 1: Customer */}
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-[12px] font-medium text-white/85">Customer</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/40">At table</span>
                  </div>

                  <div className="text-center text-white/30 text-[10px] leading-none py-0.5">|</div>

                  {/* Step 2: QR Menu */}
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-[12px] font-medium text-white/85">QR Menu</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/40">Instant browse</span>
                  </div>

                  <div className="text-center text-white/30 text-[10px] leading-none py-0.5">|</div>

                  {/* Step 3: Order */}
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-[12px] font-medium text-white/85">Order</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">Live ticket</span>
                  </div>

                  <div className="text-center text-white/30 text-[10px] leading-none py-0.5">|</div>

                  {/* Step 4: Kitchen / Waiter / Bar */}
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <ChefHat className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-[12px] font-medium text-white/85">Kitchen / Waiter / Bar</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/40">Stations</span>
                  </div>

                  <div className="text-center text-white/30 text-[10px] leading-none py-0.5">|</div>

                  {/* Step 5: Billing */}
                  <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-3.5 w-3.5 text-white/60" />
                      <span className="text-[12px] font-medium text-white/85">Billing</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/40">Settled</span>
                  </div>
                </div>
              </div>

              {/* Operations Footer */}
              <div className="mt-4 pt-3 border-t border-white/[0.08]">
                <div className="text-[11px] text-white/50">
                  One connected flow from table to terminal.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
