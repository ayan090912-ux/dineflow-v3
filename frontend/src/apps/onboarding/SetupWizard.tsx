import React, { useState, useEffect } from 'react';
import { api } from '../../packages/api/client';
import { signInWithGooglePopup } from '../../packages/auth/firebase';
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
  Mail,
  User as UserIcon,
  Globe,
  Lock,
  ArrowRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Restaurant, User } from '../../packages/types';

interface SetupWizardProps {
  initialOwnerData?: any;
  onFinishSetup: (setupData: any) => void;
  onNavigate?: (path: string) => void;
}

const BUSINESS_TYPES = [
  {
    id: 'RESTAURANT',
    name: 'Restaurant',
    icon: UtensilsCrossed,
    desc: 'Full-service dining, bistro, or casual eatery.',
  },
  {
    id: 'CAFE',
    name: 'Cafe',
    icon: Coffee,
    desc: 'Coffee house, espresso bar, or bakery cafe.',
  },
  {
    id: 'BAR',
    name: 'Bar',
    icon: Wine,
    desc: 'Cocktail bar, pub, brewery, or lounge.',
  },
  {
    id: 'CLOUD_KITCHEN',
    name: 'Cloud Kitchen',
    icon: Truck,
    desc: 'Delivery-only virtual kitchen or ghost kitchen.',
  },
  {
    id: 'BAKERY',
    name: 'Bakery',
    icon: Coffee,
    desc: 'Artisanal bakery, pastry shop, or dessert parlor.',
  },
  {
    id: 'OTHER',
    name: 'Other',
    icon: Store,
    desc: 'Specialty food venue or event outlet.',
  },
];

export const SetupWizard: React.FC<SetupWizardProps> = ({
  initialOwnerData,
  onFinishSetup,
  onNavigate,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => api.getCurrentUser());
  const [isAuthInitializing, setIsAuthInitializing] = useState(false);
  const [authError, setAuthError] = useState('');

  // Setup Wizard Form State (persisted safely in Step 1 for new onboarding)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 1: Basic Information
  const [restaurantName, setRestaurantName] = useState(initialOwnerData?.restaurantName || '');
  const [businessType, setBusinessType] = useState<string>('RESTAURANT');

  // Step 2: Location
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState(initialOwnerData?.address || '');
  const [postalCode, setPostalCode] = useState('');

  // Step 3: Tables
  const [tablesCount, setTablesCount] = useState<number>(10);

  // Check user state on mount
  useEffect(() => {
    const user = api.getCurrentUser();
    setCurrentUser(user);
    if (user) {
      resolveOwnerState(user);
    }
  }, []);

  const resolveOwnerState = async (user: User) => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const isCreateMode = searchParams.get('mode') === 'create' || searchParams.get('new') === 'true' || window.location.hash.includes('create');
      
      // If user explicitly clicked "Create a new restaurant", do NOT auto-redirect to existing restaurant
      if (isCreateMode) {
        setCurrentStep(1);
        return;
      }

      const restaurants = await api.getOwnerRestaurants(user.email);
      if (restaurants.length > 0) {
        const activeRest = restaurants.find((r) => r.isApproved || r.lifecycleStatus === 'APPROVED' || r.lifecycleStatus === 'LIVE' || r.lifecycleStatus === 'ACTIVE');
        const pendingRest = restaurants.find((r) => r.lifecycleStatus === 'PENDING_APPROVAL' || (!r.isApproved && r.lifecycleStatus !== 'REJECTED'));
        
        if (activeRest && onNavigate) {
          await api.switchActiveRestaurant(activeRest.id);
          onNavigate('/workspace');
          return;
        }
        if (pendingRest && onNavigate) {
          await api.switchActiveRestaurant(pendingRest.id);
          onNavigate('/restaurant/pending-approval');
          return;
        }
      }
    } catch (e) {
      console.error('Failed to resolve owner state:', e);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setIsAuthInitializing(true);
    try {
      const googleResult = await signInWithGooglePopup();
      const authRes = await api.authenticateWithGoogle({
        googleUid: googleResult.uid,
        email: googleResult.email,
        name: googleResult.displayName,
        photoURL: googleResult.photoURL,
      });

      const user = authRes.user;
      setCurrentUser(user);
      setIsAuthInitializing(false);

      // Check existing owner state
      if (authRes.hasRestaurant && authRes.restaurant) {
        if (authRes.restaurant.isApproved || authRes.restaurant.lifecycleStatus === 'APPROVED' || authRes.restaurant.lifecycleStatus === 'ACTIVE') {
          if (onNavigate) onNavigate('/workspace');
          return;
        } else {
          if (onNavigate) onNavigate('/restaurant/pending-approval');
          return;
        }
      }

      // If new or no restaurants, proceed to Step 1 Basics
      setCurrentStep(1);
    } catch (err: any) {
      setIsAuthInitializing(false);
      setAuthError(err.message || 'Google Authentication failed. Please try again.');
    }
  };

  const handleNextStep = () => {
    setErrorMessage('');
    if (currentStep === 1) {
      if (!restaurantName.trim()) {
        setErrorMessage("Please enter your restaurant's name.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!country.trim() || !city.trim() || !address.trim()) {
        setErrorMessage('Please enter country, city, and street address.');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      if (!tablesCount || tablesCount < 1) {
        setErrorMessage('Please enter at least 1 table for your restaurant.');
        return;
      }
      setCurrentStep(4);
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
      let user = currentUser || api.getCurrentUser();
      if (!user) {
        throw new Error('Owner account session not found. Please authenticate with Google first.');
      }

      const fullAddress = [address, city, state, country, postalCode ? `PIN: ${postalCode}` : ''].filter(Boolean).join(', ');

      // 1. Create new restaurant record
      const newRest = await api.createRestaurantForOwner({
        name: restaurantName,
        businessType: businessType as any,
        address: fullAddress,
        phone: user.phone || '+91 98765 43210',
        email: user.email,
        ownerName: user.name,
        ownerEmail: user.email,
      });

      // 2. Submit application for Platform Admin Approval with table count
      const updatedRest = await api.submitRestaurantLaunch({
        id: newRest.id,
        restaurantName,
        businessType,
        address: fullAddress,
        city,
        state,
        country,
        phone: user.phone || '+91 98765 43210',
        email: user.email,
        tables: {
          indoor: Math.ceil(tablesCount * 0.8),
          outdoor: Math.floor(tablesCount * 0.2),
          vip: 0,
        },
        totalTablesCount: tablesCount,
      });

      setIsSubmitting(false);
      onFinishSetup(updatedRest);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to submit restaurant application. Please try again.');
    }
  };

  // STEP 0: UNAUTHENTICATED VIEW — GOOGLE AUTHENTICATION FIRST
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative font-sans overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

        <div className="w-full max-w-md space-y-6 relative z-10 text-center">
          <DinelyLogo size="md" className="justify-center mb-2" />

          <div className="space-y-2">
            <Badge variant="brand" className="mb-1">Owner Onboarding</Badge>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Create your restaurant on Dinely
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              First, let's create or connect your owner account to start setting up your venue.
            </p>
          </div>

          <Card className="bg-slate-900/90 border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6 rounded-3xl text-left">
            {authError && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-xs text-rose-300 flex items-start gap-2.5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-4">
              <Button
                variant="brand"
                onClick={handleGoogleSignIn}
                isLoading={isAuthInitializing}
                className="w-full py-3.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-950 shadow-xl flex items-center justify-center gap-3 border border-slate-200"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </Button>

              <div className="pt-2 text-center border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => { if (onNavigate) onNavigate('/restaurant/login'); }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                >
                  Log in with existing password credentials →
                </button>
              </div>
            </div>
          </Card>

          <footer className="text-[11px] text-slate-500">
            Protected by Dinely Firebase Authentication Engine
          </footer>
        </div>
      </div>
    );
  }

  // STEP 1 - 4: AUTHENTICATED RESTAURANT SETUP WIZARD
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 relative font-sans overflow-x-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Top Header Navbar */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between py-3 px-4 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-xl z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <DinelyLogo size="sm" />
          <Badge variant="brand" className="text-[10px]">Restaurant Setup</Badge>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400 hidden sm:inline">Owner: <strong className="text-white">{currentUser.name || currentUser.email}</strong></span>
          <div className="text-slate-400 font-mono">
            Step <span className="text-rose-400 font-bold">{currentStep}</span> of 4
          </div>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="max-w-2xl w-full mx-auto my-8 relative z-10">
        <Card className="bg-slate-900/90 border-slate-800/90 p-6 sm:p-10 backdrop-blur-xl shadow-2xl space-y-8 rounded-3xl">
          {/* Progress Tracker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className={currentStep >= 1 ? 'text-rose-400' : 'text-slate-500'}>1. Basics</span>
              <span className={currentStep >= 2 ? 'text-rose-400' : 'text-slate-500'}>2. Location</span>
              <span className={currentStep >= 3 ? 'text-rose-400' : 'text-slate-500'}>3. Capacity</span>
              <span className={currentStep >= 4 ? 'text-rose-400' : 'text-slate-500'}>4. Review</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
              <div
                className="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Error Callout */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium animate-shake">
              <span className="font-bold">Error:</span> {errorMessage}
            </div>
          )}

          {/* STEP 1: BASIC INFORMATION */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 1 — Basic Information</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  What's your restaurant called?
                </h2>
                <p className="text-xs text-slate-400">Enter your official venue name and select your restaurant category.</p>
              </div>

              <div className="space-y-5">
                <Input
                  label="Restaurant Name *"
                  placeholder="e.g. Lumiere Bistro or Cafe.Co"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  icon={<Store className="w-4 h-4 text-slate-500" />}
                  required
                />

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">Select Restaurant Type *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {BUSINESS_TYPES.map((bt) => {
                      const IconComp = bt.icon;
                      const isSelected = businessType === bt.id;
                      return (
                        <div
                          key={bt.id}
                          onClick={() => setBusinessType(bt.id)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                            isSelected
                              ? 'bg-rose-500/10 border-rose-500 text-white shadow-md shadow-rose-950/30'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <div className={`p-2.5 rounded-xl border w-fit ${isSelected ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">{bt.name}</div>
                            <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{bt.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: LOCATION */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 2 — Location</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Where is your restaurant located?
                </h2>
                <p className="text-xs text-slate-400">Provide official address details for venue verification.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Country *"
                    placeholder="e.g. India"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    icon={<Globe className="w-4 h-4 text-slate-500" />}
                    required
                  />
                  <Input
                    label="State / Region"
                    placeholder="e.g. West Bengal"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="City *"
                    placeholder="e.g. Kolkata"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    icon={<Building className="w-4 h-4 text-slate-500" />}
                    required
                  />
                  <Input
                    label="Postal / PIN Code"
                    placeholder="e.g. 700016"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>

                <Input
                  label="Full Street Address *"
                  placeholder="e.g. 45 Park Street, Block B"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  icon={<MapPin className="w-4 h-4 text-slate-500" />}
                  required
                />
              </div>
            </div>
          )}

          {/* STEP 3: TABLES */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 3 — Seating & Tables</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  How many tables does your restaurant have?
                </h2>
                <p className="text-xs text-slate-400">Specify total seating tables for automated QR code generation.</p>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <Grid className="w-4 h-4 text-rose-400" /> Number of Tables *
                    </label>
                    <p className="text-xs text-slate-400">Total dining tables available at your outlet.</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={tablesCount}
                    onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-center font-black text-rose-400 text-base focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-start gap-3 text-xs text-slate-300">
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block mb-0.5">Automated Table Instantiation</span>
                  Upon approval by Platform Admin, Dinely will automatically create <span className="font-bold text-rose-400">{tablesCount} tables</span> in the database with table-specific QR codes.
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 4 — Review</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Review your restaurant application
                </h2>
                <p className="text-xs text-slate-400">Verify your venue configuration before submitting for Dinely Admin review.</p>
              </div>

              {/* Review Summary Card */}
              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Restaurant Name</span>
                    <span className="font-bold text-white text-base">{restaurantName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Type</span>
                    <span className="font-bold text-rose-400 text-base">{businessType}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Location</span>
                    <span className="font-bold text-slate-200">{city}, {country}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Dining Tables</span>
                    <span className="font-bold text-rose-400">{tablesCount} Tables</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Owner Account</span>
                    <span className="font-bold text-white">{currentUser.name}</span>
                    <span className="text-slate-400 text-[11px] block">{currentUser.email}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
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

            {currentStep < 4 ? (
              <Button
                variant="brand"
                onClick={handleNextStep}
                className="text-xs font-bold px-6 py-2.5 shadow-lg shadow-rose-950/40"
                icon={<ChevronRight className="w-4 h-4 ml-1" />}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="brand"
                onClick={handleSubmitApplication}
                isLoading={isSubmitting}
                className="text-xs font-bold px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-xl shadow-rose-950/50"
                icon={isSubmitting ? undefined : <Sparkles className="w-4 h-4 ml-1" />}
              >
                Submit for approval →
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
