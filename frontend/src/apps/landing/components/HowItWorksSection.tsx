import React from 'react';
import { ArrowRight, Sparkles, QrCode, Monitor, CheckCircle2 } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      number: '01',
      icon: Sparkles,
      title: 'Create your restaurant',
      description:
        'Register your workspace in minutes with your brand identity, currency, tax rules, and custom dinely.food sub-domain.',
    },
    {
      number: '02',
      icon: QrCode,
      title: 'Set up your menu and tables',
      description:
        'Upload your dishes with photos, pricing, and dietary badges. Generate crisp, downloadable table QR codes ready for table acrylics.',
    },
    {
      number: '03',
      icon: Monitor,
      title: 'Connect your restaurant operations',
      description:
        'Launch specialized kitchen displays, waiter terminals, and bar screens on any tablet, phone, or computer with zero software installations.',
    },
    {
      number: '04',
      icon: CheckCircle2,
      title: 'Go live and start serving',
      description:
        'Guests scan and order from their phones, orders stream directly to station screens, and staff coordinates service with real-time sync.',
    },
  ];

  return (
    <section id="how-it-works" className="relative w-full py-24 sm:py-32 scroll-mt-20 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-mono tracking-wider uppercase text-blue-400 font-semibold mb-3">
            SIMPLE 4-STEP ONBOARDING
          </div>
          <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
            How Dinely powers your venue from setup to service.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
            Get your restaurant up and running with connected digital ordering in less than 15 minutes. No hardware contracts, proprietary terminals, or complicated network setups.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[2rem] font-mono font-bold text-white/25">
                      {step.number}
                    </span>
                    <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/80">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                  </div>

                  <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                    {step.title}
                  </h3>

                  <p className="text-[13px] text-white/65 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-time Architecture Flow Banner */}
        <div className="mt-12 rounded-2xl p-6 sm:p-8 border border-white/[0.08] bg-white/[0.02] backdrop-blur-md">
          <div className="text-[11px] font-mono uppercase tracking-wider text-white/40 mb-4 text-center sm:text-left">
            Unified Dining Architecture
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
              <div className="text-[11px] font-mono text-white/50">01 / CREATION</div>
              <div className="text-[14px] font-semibold text-white mt-0.5">Owner Workspace</div>
              <div className="text-[11.5px] text-white/50">Setup &amp; configuration</div>
            </div>

            <ArrowRight className="h-4 w-4 text-white/30 shrink-0 rotate-90 sm:rotate-0" />

            <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
              <div className="text-[11px] font-mono text-emerald-400">02 / PLATFORM</div>
              <div className="text-[14px] font-semibold text-white mt-0.5">Dinely Cloud Engine</div>
              <div className="text-[11.5px] text-white/50">Subdomain &amp; WebSocket bus</div>
            </div>

            <ArrowRight className="h-4 w-4 text-white/30 shrink-0 rotate-90 sm:rotate-0" />

            <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
              <div className="text-[11px] font-mono text-white/50">03 / GUEST</div>
              <div className="text-[14px] font-semibold text-white mt-0.5">Customer QR Menu</div>
              <div className="text-[11.5px] text-white/50">Ordering &amp; UPI payment</div>
            </div>

            <ArrowRight className="h-4 w-4 text-white/30 shrink-0 rotate-90 sm:rotate-0" />

            <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] w-full">
              <div className="text-[11px] font-mono text-white/50">04 / DISPATCH</div>
              <div className="text-[14px] font-semibold text-white mt-0.5">Operations Terminals</div>
              <div className="text-[11.5px] text-white/50">Kitchen &bull; Waiter &bull; Bar</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
