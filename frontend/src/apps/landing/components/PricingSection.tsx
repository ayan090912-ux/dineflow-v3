import React from 'react';
import { Check, ArrowRight } from 'lucide-react';

interface PricingSectionProps {
  onStartTrial: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onStartTrial }) => {
  const plans = [
    {
      name: 'Single Station',
      tagline: 'Ideal for cafés, food trucks, and counter concepts starting digital ordering.',
      badge: 'Quick Launch',
      features: [
        'Branded dinely.food tenant subdomain',
        'Mobile browser table QR menus',
        'Waiter & floor terminal screen',
        'Basic kitchen order display (KDS)',
        'UPI QR & cash bill settlement',
        'Full menu & modifier catalog',
      ],
      ctaText: 'Start your restaurant',
      primary: false,
    },
    {
      name: 'Full Venue Operations',
      tagline: 'Built for busy restaurants, gastropubs, and dining rooms with station routing.',
      badge: 'Most Popular',
      features: [
        'Everything in Single Station',
        'Multi-station KDS with dish timers',
        'Dedicated Bar & Beverage terminal',
        'Real-time recipe inventory deduction',
        'Configurable GST & invoice sequences',
        'Live floor map & table turnaround metrics',
        'Multi-user role permissions (Owner, Chef, Waiter, Bar)',
      ],
      ctaText: 'Start your restaurant',
      primary: true,
    },
    {
      name: 'Multi-Location & Groups',
      tagline: 'Designed for restaurant franchises and multi-outlet hospitality brands.',
      badge: 'Enterprise Scalability',
      features: [
        'Everything in Full Venue Operations',
        'Multi-outlet workspace selector',
        'Centralized brand menu sync',
        'Cross-location consolidated analytics',
        'Dedicated database connection pool',
        'Custom domain support (*.yourdomain.com)',
        'Priority SLA & migration onboarding',
      ],
      ctaText: 'Talk to us',
      primary: false,
      isContact: true,
    },
  ];

  return (
    <section id="pricing" className="relative w-full py-24 sm:py-32 scroll-mt-20 border-t border-white/[0.06] bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3">
            TRANSPARENT VALUE
          </div>
          <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
            Plans built around your restaurant.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
            Choose the setup that fits your operation. Enable only the modules you need and scale as your dining traffic expands.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-7 flex flex-col justify-between transition-all duration-200 ${
                plan.primary
                  ? 'border border-amber-500/30 bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-2xl shadow-black/80 relative'
                  : 'border border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[18px] font-semibold text-white tracking-tight">
                    {plan.name}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono font-medium ${
                      plan.primary
                        ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                        : 'bg-white/[0.06] text-white/60 border border-white/[0.08]'
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>

                <p className="text-[13px] text-white/65 leading-relaxed mb-6">
                  {plan.tagline}
                </p>

                {/* Feature Checklist */}
                <div className="space-y-2.5 pt-4 border-t border-white/[0.06] mb-8">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5 text-[13px] text-white/80">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              {plan.isContact ? (
                <a
                  href="mailto:contact@dinely.food?subject=Dinely%20Enterprise%20Inquiry"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-center text-[13.5px] font-medium text-white/85 hover:text-white transition-colors bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] cursor-pointer"
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onStartTrial}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-center text-[13.5px] font-medium text-white transition-all cursor-pointer border ${
                    plan.primary
                      ? 'border-white/[0.2] shadow-lg shadow-black/50 hover:opacity-95'
                      : 'border-white/[0.12] hover:bg-white/[0.08]'
                  }`}
                  style={{
                    background: plan.primary
                      ? 'linear-gradient(to bottom, #2E2E2E, #111111)'
                      : 'linear-gradient(to bottom, #222222, #0E0E0E)',
                  }}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
