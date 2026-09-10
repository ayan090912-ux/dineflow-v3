import React from 'react';
import { Utensils, Coffee, Wine, Store, Flame } from 'lucide-react';

export const SolutionsSection: React.FC = () => {
  const venues = [
    {
      icon: Utensils,
      type: 'Restaurants',
      headline: 'Keep tables, ordering and service moving together.',
      description:
        'Coordinate multiple dining courses, floor service requests, and table settlement without miscommunication between the dining room and kitchen line.',
      modules: ['Table QR Menus', 'Waiter Terminal', 'Kitchen KDS', 'GST & Split Billing'],
    },
    {
      icon: Coffee,
      type: 'Cafés',
      headline: 'Keep fast-moving counter and table orders organized.',
      description:
        'Handle rapid morning rushes and afternoon laptop sessions with high-throughput order entry, instant barista ticketing, and table-side ordering.',
      modules: ['Express QR Order', 'Barista Queue', 'Instant UPI Pay', 'Inventory Par Levels'],
    },
    {
      icon: Wine,
      type: 'Bars & Lounges',
      headline: 'Route drink orders directly to the bar while keeping the floor in sync.',
      description:
        'Floor servers and table guests order directly into dedicated drink queues so mixologists and bartenders can batch cocktails without delay.',
      modules: ['Bar Terminal', 'Drink Queue', 'Speed Batching', 'Table Tabs'],
    },
    {
      icon: Store,
      type: 'Food Counters & QSR',
      headline: 'Zero-friction order-and-collect workflow.',
      description:
        'Accelerate counter throughput with instant mobile QR ordering, automatic order tokening, and real-time station display screens.',
      modules: ['Counter POS', 'Token Display', 'Kitchen Routing', 'Quick Pay'],
    },
    {
      icon: Flame,
      type: 'Cloud Kitchens',
      headline: 'Manage multi-brand prep from a single centralized kitchen dispatch board.',
      description:
        'Consolidate multiple brand menus into a single unified prep station screen. Keep station cooks focused on dishes rather than separate tablets.',
      modules: ['Unified KDS', 'Station Routing', 'Recipe Stocking', 'Dispatch Log'],
    },
  ];

  return (
    <section id="solutions" className="relative w-full py-24 sm:py-32 scroll-mt-20 border-t border-white/[0.06] bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-mono tracking-wider uppercase text-emerald-400 font-semibold mb-3">
            TAILORED FOR YOUR OPERATION
          </div>
          <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
            Built for how your venue actually operates.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
            Different food service businesses run on different rhythms. Dinely enables only the operational modules your specific concept needs.
          </p>
        </div>

        {/* Venues Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {venues.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.type}
                className="rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/85 shrink-0">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[16px] font-semibold text-white tracking-tight">
                      {v.type}
                    </span>
                  </div>

                  <h3 className="text-[14px] font-medium text-white/90 leading-snug mb-2.5">
                    &ldquo;{v.headline}&rdquo;
                  </h3>

                  <p className="text-[13px] text-white/65 leading-relaxed mb-6">
                    {v.description}
                  </p>
                </div>

                {/* Enabled Modules Pill List */}
                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-white/40 mb-2">
                    Key Modules
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {v.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono text-white/75 border border-white/[0.06]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
