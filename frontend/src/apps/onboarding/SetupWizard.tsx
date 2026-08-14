import React, { useState } from 'react';
import { api } from '../../packages/api/client';
import {
  Button,
  Card,
  Input,
  Badge,
  DinelyLogo,
} from '../../packages/ui';
import {
  Building,
  MapPin,
  UtensilsCrossed,
  Wine,
  Truck,
  Coffee,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
  Store,
  Grid,
  Image as ImageIcon,
  Mail,
  Phone,
  User as UserIcon,
  Lock,
} from 'lucide-react';

interface SetupWizardProps {
  initialOwnerData?: any;
  onFinishSetup: (setupData: any) => void;
}

const BUSINESS_TYPES = [
  {
    id: 'RESTAURANT',
    name: 'Fine Dining & Bistro',
    icon: UtensilsCrossed,
    desc: 'Full-service dining with table service, waiter workflow & kitchen KDS.',
  },
  {
    id: 'BAR',
    name: 'Bar & Lounge',
    icon: Wine,
    desc: 'Craft cocktail bar, mixology order routing & drink prep queue.',
  },
  {
    id: 'CAFE',
    name: 'Cafe & Bakery',
    icon: Coffee,
    desc: 'Fast-casual coffee house, pastries, counter QR & table service.',
  },
  {
    id: 'FOOD_TRUCK',
    name: 'Food Truck / Quick Service',
    icon: Truck,
    desc: 'Express mobile food truck or counter ordering service.',
  },
];

const DEFAULT_LOGOS = [
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=200&auto=format&fit=crop&q=80',
];

export const SetupWizard: React.FC<SetupWizardProps> = ({
  initialOwnerData,
  onFinishSetup,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 1: Account Info (If not prefilled)
  const [ownerName, setOwnerName] = useState(initialOwnerData?.ownerName || initialOwnerData?.name || '');
  const [ownerEmail, setOwnerEmail] = useState(initialOwnerData?.ownerEmail || initialOwnerData?.email || '');
  const [ownerPassword, setOwnerPassword] = useState(initialOwnerData?.password || '');

  // Step 2: Restaurant / Business Information
  const [restaurantName, setRestaurantName] = useState(initialOwnerData?.restaurantName || '');
  const [businessType, setBusinessType] = useState<string>('RESTAURANT');
  const [address, setAddress] = useState(initialOwnerData?.address || '');
  const [city, setCity] = useState(initialOwnerData?.city || '');
  const [contactEmail, setContactEmail] = useState(initialOwnerData?.ownerEmail || initialOwnerData?.email || '');
  const [contactNumber, setContactNumber] = useState(initialOwnerData?.phone || '');
  const [logo, setLogo] = useState(DEFAULT_LOGOS[0]);

  // Step 3: Seating & Floorplan Capacity
  const [totalTablesCount, setTotalTablesCount] = useState<number>(10);
  const [indoorTablesCount, setIndoorTablesCount] = useState<number>(8);
  const [outdoorTablesCount, setOutdoorTablesCount] = useState<number>(2);

  const handleNextStep = () => {
    setErrorMessage('');
    if (currentStep === 1) {
      if (!ownerName || !ownerEmail) {
        setErrorMessage('Please enter your full name and owner email address.');
        return;
      }
      if (!api.getCurrentUser() && !ownerPassword) {
        setErrorMessage('Please choose a password for your owner account.');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!restaurantName || !address || !city || !contactEmail || !contactNumber) {
        setErrorMessage('Please complete all required restaurant business details.');
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    setErrorMessage('');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmitApplication = async () => {
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      // 1. Ensure user account is registered/persisted if new
      let currentUser = api.getCurrentUser();
      if (!currentUser) {
        const authRes = await api.registerOwner({
          name: ownerName,
          email: ownerEmail,
          phone: contactNumber,
          password: ownerPassword || 'owner123',
        });
        currentUser = authRes.user;
      }

      // 2. Create or update restaurant application
      let existingRest = await api.getRestaurantDetails();
      if (!existingRest) {
        existingRest = await api.createRestaurantForOwner({
          name: restaurantName,
          businessType: businessType as any,
          address: `${address}, ${city}`,
          phone: contactNumber,
          email: contactEmail,
          ownerName: ownerName,
          ownerEmail: ownerEmail,
          theme: { logo },
        });
      }

      // 3. Submit application for Platform Admin Review with table counts
      const updatedRest = await api.submitRestaurantLaunch({
        id: existingRest.id,
        restaurantName,
        businessType,
        address: `${address}, ${city}`,
        city,
        phone: contactNumber,
        email: contactEmail,
        theme: { logo },
        tables: {
          indoor: indoorTablesCount,
          outdoor: outdoorTablesCount,
          vip: 0,
        },
        totalTablesCount: Math.max(totalTablesCount, indoorTablesCount + outdoorTablesCount),
      });

      setIsSubmitting(false);
      onFinishSetup(updatedRest);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to submit restaurant application. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative font-sans overflow-x-hidden">
      {/* Background Glow Effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Top Header Navbar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-3 px-4 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-xl z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <DinelyLogo size="sm" />
          <Badge variant="brand" className="text-[10px]">Setup Wizard</Badge>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Step <span className="text-rose-400 font-bold">{currentStep}</span> of 3
        </div>
      </header>

      {/* Main Form Content */}
      <main className="max-w-3xl w-full mx-auto my-8 relative z-10">
        <Card className="bg-slate-900/90 border-slate-800/90 p-6 sm:p-10 backdrop-blur-xl shadow-2xl space-y-8 rounded-3xl">
          {/* Wizard Step Progress Tracker */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className={currentStep >= 1 ? 'text-rose-400' : 'text-slate-500'}>1. Account Information</span>
              <span className={currentStep >= 2 ? 'text-rose-400' : 'text-slate-500'}>2. Business & Venue Details</span>
              <span className={currentStep >= 3 ? 'text-rose-400' : 'text-slate-500'}>3. Tables & Capacity</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
              <div
                className="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* Error Message Callout */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-shake">
              <span className="font-bold">Error:</span> {errorMessage}
            </div>
          )}

          {/* STEP 1: OWNER ACCOUNT INFORMATION */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 1</Badge>
                <h2 className="text-2xl font-black text-white tracking-tight">Owner Account Details</h2>
                <p className="text-xs text-slate-400">Verify your primary restaurant administrator account information.</p>
              </div>

              <div className="space-y-4">
                <Input
                  label="Restaurant Owner Name *"
                  placeholder="e.g. Rahul Sharma"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  icon={<UserIcon className="w-4 h-4 text-slate-500" />}
                  required
                />
                <Input
                  label="Owner Email Address *"
                  type="email"
                  placeholder="rahul@restaurant.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  icon={<Mail className="w-4 h-4 text-slate-500" />}
                  required
                />
                {!initialOwnerData?.password && (
                  <Input
                    label="Account Password *"
                    type="password"
                    placeholder="••••••••••••"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    icon={<Lock className="w-4 h-4 text-slate-500" />}
                  />
                )}
              </div>
            </div>
          )}

          {/* STEP 2: RESTAURANT & BUSINESS DETAILS */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 2</Badge>
                <h2 className="text-2xl font-black text-white tracking-tight">Restaurant & Business Information</h2>
                <p className="text-xs text-slate-400">Enter venue details for official Dinely Platform Admin verification.</p>
              </div>

              <div className="space-y-5">
                <Input
                  label="Restaurant Name *"
                  placeholder="e.g. Lumiere Bistro & Lounge"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  icon={<Store className="w-4 h-4 text-slate-500" />}
                  required
                />

                {/* Business Category Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">Select Restaurant Type *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {BUSINESS_TYPES.map((bt) => {
                      const IconComp = bt.icon;
                      const isSelected = businessType === bt.id;
                      return (
                        <div
                          key={bt.id}
                          onClick={() => setBusinessType(bt.id)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-rose-500/10 border-rose-500 text-white shadow-md shadow-rose-950/30'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <div className={`p-2 rounded-xl border shrink-0 ${isSelected ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">{bt.name}</div>
                            <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{bt.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Address & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Street Address *"
                    placeholder="e.g. 45 Hill Road, Bandra West"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    icon={<MapPin className="w-4 h-4 text-slate-500" />}
                    required
                  />
                  <Input
                    label="City *"
                    placeholder="e.g. Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    icon={<Building className="w-4 h-4 text-slate-500" />}
                    required
                  />
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Contact Email *"
                    type="email"
                    placeholder="contact@lumierebistro.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    icon={<Mail className="w-4 h-4 text-slate-500" />}
                    required
                  />
                  <Input
                    label="Contact Phone Number *"
                    placeholder="+91 98765 43210"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    icon={<Phone className="w-4 h-4 text-slate-500" />}
                    required
                  />
                </div>

                {/* Optional Restaurant Logo Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">Restaurant Logo (Optional)</label>
                  <div className="flex items-center gap-3">
                    {DEFAULT_LOGOS.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt="logo option"
                        onClick={() => setLogo(img)}
                        className={`w-12 h-12 rounded-2xl object-cover cursor-pointer border-2 transition-all ${
                          logo === img ? 'border-rose-500 scale-105 shadow-md shadow-rose-950/40' : 'border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: TABLES & SEATING CAPACITY */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 3</Badge>
                <h2 className="text-2xl font-black text-white tracking-tight">Tables & Dining Capacity</h2>
                <p className="text-xs text-slate-400">Specify your venue's table count. Tables will be automatically created upon admin approval.</p>
              </div>

              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  <span className="font-bold text-white block mb-0.5">Automated Floorplan Generation</span>
                  Upon approval by Platform Admin, Dinely will generate <span className="font-bold text-rose-400">{totalTablesCount} tables</span> with table-specific QR codes ready for immediate customer dining.
                </p>
              </div>

              <div className="space-y-5">
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <Grid className="w-4 h-4 text-rose-400" /> Total Dining Tables *
                      </div>
                      <div className="text-[11px] text-slate-400">Total physical tables at your outlet.</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={totalTablesCount}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setTotalTablesCount(val);
                        setIndoorTablesCount(Math.min(val, indoorTablesCount));
                        setOutdoorTablesCount(Math.max(0, val - indoorTablesCount));
                      }}
                      className="w-20 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-bold text-rose-400 text-sm focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-white">Indoor Main Floor Tables</div>
                    <div className="text-[11px] text-slate-400">Main dining hall seating count.</div>
                    <input
                      type="number"
                      min={0}
                      max={totalTablesCount}
                      value={indoorTablesCount}
                      onChange={(e) => setIndoorTablesCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-bold text-white text-sm focus:outline-none focus:border-rose-500 mt-1"
                    />
                  </div>

                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-white">Outdoor / Patio Tables</div>
                    <div className="text-[11px] text-slate-400">Terrace or outdoor seating count.</div>
                    <input
                      type="number"
                      min={0}
                      max={totalTablesCount}
                      value={outdoorTablesCount}
                      onChange={(e) => setOutdoorTablesCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-bold text-white text-sm focus:outline-none focus:border-rose-500 mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Control Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {currentStep > 1 ? (
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="text-xs border-slate-800 text-slate-300 hover:bg-slate-800"
                icon={<ChevronLeft className="w-4 h-4 mr-1" />}
              >
                Back
              </Button>
            ) : <div />}

            {currentStep < 3 ? (
              <Button
                variant="brand"
                onClick={handleNextStep}
                className="text-xs font-bold px-6 py-2.5 shadow-lg shadow-rose-950/40"
                icon={<ChevronRight className="w-4 h-4 ml-1" />}
              >
                Continue to Next Step
              </Button>
            ) : (
              <Button
                variant="brand"
                onClick={handleSubmitApplication}
                isLoading={isSubmitting}
                className="text-xs font-bold px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-xl shadow-rose-950/50"
                icon={isSubmitting ? undefined : <Sparkles className="w-4 h-4 ml-1" />}
              >
                Submit Restaurant Application →
              </Button>
            )}
          </div>
        </Card>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-slate-500 py-2">
        Protected by Dinely Tenant Isolation Engine • Multi-outlet SaaS Compliance
      </footer>
    </div>
  );
};
