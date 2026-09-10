import React from 'react';
import {
  QrCode,
  ChefHat,
  Users,
  Wine,
  Package,
  Receipt,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';

export const ProductSection: React.FC = () => {
  const features = [
    {
      icon: QrCode,
      title: 'QR Ordering',
      tag: 'Customer Experience',
      description:
        'Table QR menus that open instantly in any mobile browser. Zero app downloads, instant category browsing, dietary tags, and seamless digital ordering.',
    },
    {
      icon: ChefHat,
      title: 'Kitchen Display (KDS)',
      tag: 'Back of House',
      description:
        'Live ticket station routing, dish-level preparation timers, station-specific filters, and color-coded urgency states for chefs.',
    },
    {
      icon: Users,
      title: 'Waiter Terminal',
      tag: 'Floor Operations',
      description:
        'Floor-wide table statuses, instant waiter call notifications, plate pass handoffs, and rapid on-table order placement.',
    },
    {
      icon: Wine,
      title: 'Bar & Beverage',
      tag: 'Cocktails & Taps',
      description:
        'Dedicated drink queues, mixology ticket routing, speed-batching coordination, and beverage-specific dish routing.',
    },
    {
      icon: Package,
      title: 'Real-time Inventory',
      tag: 'Stock & Par Levels',
      description:
        'Recipe-linked ingredient tracking with automatic stock deductions as kitchen orders are prepared. Real-time low-stock alerts.',
    },
    {
      icon: Receipt,
      title: 'Billing & UPI Engine',
      tag: 'Cash & Digital',
      description:
        'Automated GST compliant invoices, split billing, multi-tender payment modes, and dynamic on-table UPI QR payment settlement.',
    },
    {
      icon: BarChart3,
      title: 'Operational Analytics',
      tag: 'Owner Insights',
      description:
        'Live revenue dashboards, table turnaround velocities, hourly order volume curves, and highest-grossing menu items.',
    },
    {
      icon: ShieldCheck,
      title: 'Staff & Role Security',
      tag: 'Access Governance',
      description:
        'Role-tailored interfaces for owners, managers, chefs, bartenders, and floor staff with multi-tenant domain isolation.',
    },
  ];

  return (
    <section id="product" className="relative w-full py-24 sm:py-32 scroll-mt-20 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="text-[11.5px] font-mono tracking-wider uppercase text-amber-400 font-semibold mb-3">
            CONNECTED OPERATING SYSTEM
          </div>
          <h2 className="text-[2rem] sm:text-[2.75rem] font-semibold text-white tracking-[-0.025em] leading-[1.12]">
            Everything your restaurant needs.
            <br />
            Nothing disconnected.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-white/70 leading-relaxed">
            Dinely brings restaurant operations into one unified system. Every role operates through a dedicated, synchronized interface without paper tickets or third-party middleware.
          </p>
        </div>

        {/* Feature Grid: 8 Modules */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/80 group-hover:text-amber-400 transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
                      {f.tag}
                    </span>
                  </div>

                  <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                    {f.title}
                  </h3>

                  <p className="text-[13px] text-white/65 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
