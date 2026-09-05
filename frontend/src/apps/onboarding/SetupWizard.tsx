import React, { useState, useEffect } from 'react';
import { api } from '../../packages/api/client';
import { signInWithGooglePopup } from '../../packages/auth/firebase';
import {
  Button,
  Card,
  Input,
  Badge,
  DinelyLogo,
  AddressAutocomplete,
} from '../../packages/ui';
import { StructuredAddress } from '../../packages/utils/addressGeocoding';
import {
  Building,
  MapPin,
  UtensilsCrossed,
  Wine,
  Truck,
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
  ChefHat,
  PhoneCall,
  Package,
  Receipt,
  LayoutDashboard,
  Check,
} from 'lucide-react';
import { Restaurant, User, BusinessType } from '../../packages/types';

interface SetupWizardProps {
  initialOwnerData?: any;
  onFinishSetup: (setupData: any) => void;
  onNavigate?: (path: string) => void;
}

// STRICTLY 3 BUSINESS TYPES
const BUSINESS_TYPES: Array<{
  id: BusinessType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  desc: string;
}> = [
  {
    id: 'RESTAURANT',
    name: 'Restaurant',
    icon: UtensilsCrossed,
    tagline: 'Full-Service & Casual Dining',
    desc: 'Bistros, fine dining, cafes, diners, and full-service eateries with table service.',
  },
  {
    id: 'BAR',
    name: 'Bar',
    icon: Wine,
    tagline: 'Bar, Lounge & Mixology',
    desc: 'Cocktail bars, pubs, breweries, wine lounges, and nightlife beverage venues.',
  },
  {
    id: 'FOOD_CART',
    name: 'Food Cart',
    icon: Truck,
    tagline: 'Kiosk, Stall & Food Truck',
    desc: 'Mobile food carts, fast counter kiosks, street food stalls, and quick-pickup stands.',
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

  // 4-Step Onboarding State
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 1: Business Type
  const [businessType, setBusinessType] = useState<BusinessType>('RESTAURANT');

  // Step 2: Business Details & Location
  const [restaurantName, setRestaurantName] = useState(initialOwnerData?.restaurantName || '');
  const [phone, setPhone] = useState(initialOwnerData?.phone || '');
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState(initialOwnerData?.address || '');
  const [postalCode, setPostalCode] = useState('');
  const [locality, setLocality] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [selectedLocationObj, setSelectedLocationObj] = useState<StructuredAddress | null>(null);
  const [hasSeating, setHasSeating] = useState<boolean>(true);
  const [tablesCount, setTablesCount] = useState<number>(10);

  const validatePhone = (rawPhone: string) => {
    const digits = (rawPhone || '').replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      return { valid: false, error: 'Please enter a valid owner phone number with at least 10 digits.' };
    }
    const isRepeating = /^(\d)\1+$/.test(digits);
    const isSequential = '01234567890123456789'.includes(digits) || '98765432109876543210'.includes(digits);
    if (isRepeating || isSequential || digits === '1234567890' || digits === '0000000000' || digits === '9999999999') {
      return { valid: false, error: 'Please provide an authentic, reachable phone number.' };
    }
    return { valid: true, error: null };
  };

  // Step 3: Terminal Selection State
  const [enableKitchen, setEnableKitchen] = useState<boolean>(true);
  const [enableWaiter, setEnableWaiter] = useState<boolean>(true);
  const [enableBar, setEnableBar] = useState<boolean>(false);
  const [enableInventory, setEnableInventory] = useState<boolean>(true);
  const [enableBilling, setEnableBilling] = useState<boolean>(true);

  // Auto-set terminal defaults when business type changes
  const applyBusinessTypeDefaults = (type: BusinessType) => {
    setBusinessType(type);
    if (type === 'FOOD_CART') {
      setEnableKitchen(true);
      setEnableInventory(true);
      setEnableBilling(true);
      setEnableWaiter(hasSeating);
      setEnableBar(false); // Bar is NEVER enabled for Food Cart
      if (!hasSeating) setTablesCount(0);
    } else if (type === 'BAR') {
      setEnableBar(true);
      setEnableKitchen(true);
      setEnableWaiter(true);
      setEnableInventory(true);
      setEnableBilling(true);
      setHasSeating(true);
      if (tablesCount === 0) setTablesCount(10);
    } else {
      // RESTAURANT
      setEnableKitchen(true);
      setEnableWaiter(true);
      setEnableBar(false);
      setEnableInventory(true);
      setEnableBilling(true);
      setHasSeating(true);
      if (tablesCount === 0) setTablesCount(10);
    }
  };

  const handleSelectAddress = (loc: StructuredAddress) => {
    setAddress(loc.fullAddress);
    if (loc.city) setCity(loc.city);
    if (loc.state) setState(loc.state);
    if (loc.country) setCountry(loc.country);
    if (loc.postalCode) setPostalCode(loc.postalCode);
    if (loc.locality) setLocality(loc.locality);
    if (loc.latitude !== null) setLatitude(loc.latitude);
    if (loc.longitude !== null) setLongitude(loc.longitude);
    if (loc.placeId) setPlaceId(loc.placeId);
    setSelectedLocationObj(loc);
  };

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

      const searchParams = new URLSearchParams(window.location.search);
      const isCreateMode = searchParams.get('mode') === 'create' || searchParams.get('new') === 'true' || window.location.hash.includes('create');

      if (!isCreateMode && authRes.hasRestaurant && authRes.restaurant) {
        if (authRes.restaurant.isApproved || authRes.restaurant.lifecycleStatus === 'APPROVED' || authRes.restaurant.lifecycleStatus === 'ACTIVE') {
          if (onNavigate) onNavigate('/workspace');
          return;
        } else {
          if (onNavigate) onNavigate('/restaurant/pending-approval');
          return;
        }
      }

      setCurrentStep(1);
    } catch (err: any) {
      setIsAuthInitializing(false);
      setAuthError(err.message || 'Google Authentication failed. Please try again.');
    }
  };

  const handleNextStep = () => {
    setErrorMessage('');
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!restaurantName.trim()) {
        setErrorMessage('Please enter your business / restaurant name.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        setErrorMessage(phoneCheck.error || 'Please provide a valid owner contact phone number.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!country.trim() || !city.trim() || !address.trim()) {
        setErrorMessage('Please enter country, city, and street address.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const isNoSeating = businessType === 'FOOD_CART' && !hasSeating;
      if (!isNoSeating && (!tablesCount || tablesCount < 1)) {
        setErrorMessage('Please enter at least 1 table for your venue.');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const anySelected = enableKitchen || enableWaiter || enableBar || enableInventory || enableBilling;
      if (!anySelected) {
        setErrorMessage('Please select at least one operational terminal for your business.');
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
      let user = api.getCurrentUser() || currentUser;
      if (!user) {
        api.restoreSession();
        user = api.getCurrentUser();
      }
      if (!user) {
        throw new Error('Owner account session not found. Please authenticate with Google first.');
      }

      const phoneCheck = validatePhone(phone);
      if (!phoneCheck.valid) {
        throw new Error(phoneCheck.error || 'Please provide a valid owner phone number.');
      }

      const fullAddress = [address, city, state, country, postalCode ? `PIN: ${postalCode}` : ''].filter(Boolean).join(', ');
      const isNoSeating = businessType === 'FOOD_CART' && !hasSeating;
      const finalTablesCount = isNoSeating ? 0 : tablesCount;

      // Construct enabled modules array
      const enabledModules: string[] = [];
      if (enableKitchen) enabledModules.push('kitchen');
      if (enableWaiter && !isNoSeating) enabledModules.push('waiter');
      if (enableBar && businessType !== 'FOOD_CART') enabledModules.push('bar');
      if (enableInventory) enabledModules.push('inventory');
      if (enableBilling) enabledModules.push('billing');

      // 1. Create new restaurant record with real owner identity
      const newRest = await api.createRestaurantForOwner({
        name: restaurantName.trim(),
        businessType: businessType,
        hasBar: enableBar && businessType !== 'FOOD_CART',
        hasTables: !isNoSeating,
        hasKitchen: enableKitchen,
        hasWaiter: enableWaiter && !isNoSeating,
        address: fullAddress,
        phone: phone.trim(),
        email: user.email,
        ownerName: user.name || user.firstName || user.email.split('@')[0],
        ownerEmail: user.email,
      });

      // 2. Submit application for Platform Admin Approval
      const updatedRest = await api.submitRestaurantLaunch({
        id: newRest.id,
        restaurantName: restaurantName.trim(),
        businessType,
        hasBar: enableBar && businessType !== 'FOOD_CART',
        hasTables: !isNoSeating,
        hasKitchen: enableKitchen,
        hasWaiter: enableWaiter && !isNoSeating,
        hasInventory: enableInventory,
        hasBilling: enableBilling,
        enabledModules,
        address: fullAddress,
        locality,
        city,
        state,
        country,
        postalCode,
        latitude,
        longitude,
        placeId,
        phone: phone.trim(),
        email: user.email,
        tables: {
          indoor: isNoSeating ? 0 : Math.ceil(finalTablesCount * 0.8),
          outdoor: isNoSeating ? 0 : Math.floor(finalTablesCount * 0.2),
          vip: 0,
        },
        totalTablesCount: finalTablesCount,
      });

      // 3. Save workspace modules
      await api.updateWorkspaceModules(newRest.id, enabledModules, {
        hasKitchen: enableKitchen,
        hasWaiter: enableWaiter && !isNoSeating,
        hasBar: enableBar && businessType !== 'FOOD_CART',
        hasInventory: enableInventory,
        hasBilling: enableBilling,
        hasTables: !isNoSeating,
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
              Create your business on Dinely
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              First, let's create or connect your owner account to start configuring your custom workspace.
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
          <Badge variant="brand" className="text-[10px]">Workspace Setup</Badge>
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
              <span className={currentStep >= 1 ? 'text-rose-400' : 'text-slate-500'}>1. Business Type</span>
              <span className={currentStep >= 2 ? 'text-rose-400' : 'text-slate-500'}>2. Details & Tables</span>
              <span className={currentStep >= 3 ? 'text-rose-400' : 'text-slate-500'}>3. Choose Terminals</span>
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

          {/* STEP 1: BUSINESS TYPE (ONLY 3 CARDS) */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 1 — Business Type</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  What type of business do you run?
                </h2>
                <p className="text-xs text-slate-400">
                  Select your venue model. Dinely will configure your recommended operational terminals.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {BUSINESS_TYPES.map((bt) => {
                  const IconComp = bt.icon;
                  const isSelected = businessType === bt.id;
                  return (
                    <div
                      key={bt.id}
                      onClick={() => applyBusinessTypeDefaults(bt.id)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-start gap-4 ${
                        isSelected
                          ? 'bg-rose-500/10 border-rose-500 text-white shadow-xl shadow-rose-950/30 ring-1 ring-rose-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className={`p-3.5 rounded-2xl border shrink-0 ${isSelected ? 'bg-rose-500 text-white border-rose-400 shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                        <IconComp className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-bold text-white tracking-tight">{bt.name}</h3>
                          <Badge variant={isSelected ? 'brand' : 'outline'} className="text-[10px] uppercase font-mono">
                            {bt.tagline}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{bt.desc}</p>
                      </div>
                      <div className="pt-1 shrink-0">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-700'}`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: BUSINESS DETAILS & LOCATION */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 2 — Venue Information & Location</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Tell us about your business
                </h2>
                <p className="text-xs text-slate-400">Provide official venue name, location, and customer dining capacity.</p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Business / Venue Name *"
                    placeholder="e.g. Lumiere Bistro or Cafe.Co"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    icon={<Store className="w-4 h-4 text-slate-500" />}
                    required
                  />
                  <Input
                    label="Owner Contact Phone Number *"
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    icon={<PhoneCall className="w-4 h-4 text-slate-500" />}
                    required
                  />
                </div>

                {/* Verified Owner Identity Banner */}
                {currentUser && (
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-slate-400">Authenticated Owner Account:</span>
                      <strong className="text-white font-mono">{currentUser.email}</strong>
                    </div>
                    <Badge variant="success" className="text-[10px] font-mono">VERIFIED</Badge>
                  </div>
                )}

                <AddressAutocomplete
                  value={address}
                  onSelectAddress={handleSelectAddress}
                  onChangeText={(txt) => setAddress(txt)}
                  selectedLocation={
                    selectedLocationObj ||
                    (city ? {
                      fullAddress: address,
                      locality,
                      city,
                      state,
                      country,
                      postalCode,
                      latitude,
                      longitude,
                      placeId,
                    } : null)
                  }
                />

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
                    label="Country *"
                    placeholder="e.g. India"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    icon={<Globe className="w-4 h-4 text-slate-500" />}
                    required
                  />
                </div>

                {/* Seating / Table Configuration */}
                {businessType === 'FOOD_CART' ? (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <label className="text-xs font-bold text-slate-300 block">Do you have customer dining tables at your Food Cart? *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setHasSeating(true); setEnableWaiter(true); if (tablesCount === 0) setTablesCount(5); }}
                        className={`p-3.5 rounded-xl border text-xs font-bold transition-all text-left space-y-1 cursor-pointer ${
                          hasSeating ? 'bg-rose-500/10 border-rose-500 text-white shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>Yes, Seating Available</span>
                          {hasSeating && <CheckCircle2 className="w-4 h-4 text-rose-400" />}
                        </div>
                        <p className="text-[10px] text-slate-500 font-normal">Customer tables configured with QR ordering</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setHasSeating(false); setEnableWaiter(false); setTablesCount(0); }}
                        className={`p-3.5 rounded-xl border text-xs font-bold transition-all text-left space-y-1 cursor-pointer ${
                          !hasSeating ? 'bg-amber-500/10 border-amber-500 text-white shadow-md' : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>No Seating — Counter Pickup</span>
                          {!hasSeating && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                        </div>
                        <p className="text-[10px] text-slate-500 font-normal">Single Standee QR + Digital Token Bills</p>
                      </button>
                    </div>

                    {hasSeating && (
                      <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                        <label className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Grid className="w-4 h-4 text-rose-400" /> Number of Tables
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={tablesCount}
                          onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-center font-bold text-rose-400 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-white flex items-center gap-2">
                        <Grid className="w-4 h-4 text-rose-400" /> Number of Dining Tables *
                      </label>
                      <p className="text-[11px] text-slate-400">Total dining tables available for QR menu & waiter dispatch.</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={tablesCount}
                      onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-black text-rose-400 text-base focus:outline-none focus:border-rose-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: CHOOSE YOUR DINELY TERMINALS */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 3 — Workspace Configuration</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Choose the tools your business needs
                </h2>
                <p className="text-xs text-slate-400">
                  Select which operational terminals will be generated for your {businessType.toLowerCase()} workspace. You can adjust this later in settings.
                </p>
              </div>

              <div className="space-y-3">
                {/* 1. Kitchen KDS */}
                <div
                  onClick={() => setEnableKitchen(!enableKitchen)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableKitchen ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl border ${enableKitchen ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">Kitchen Display System (KDS)</span>
                        <Badge variant="warning" className="text-[9px]">Recommended</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Manage incoming food orders, prep queues, and chef station timing.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableKitchen}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-amber-500 accent-amber-500 mt-1 cursor-pointer"
                  />
                </div>

                {/* 2. Waiter Terminal */}
                <div
                  onClick={() => setEnableWaiter(!enableWaiter)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableWaiter ? 'bg-emerald-500/10 border-emerald-500/60 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl border ${enableWaiter ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <PhoneCall className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">Waiter Terminal OS</span>
                        {businessType === 'FOOD_CART' && <Badge variant="outline" className="text-[9px]">Optional</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Manage table requests, water/bill calls, order delivery, and table turnover.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableWaiter}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-emerald-500 accent-emerald-500 mt-1 cursor-pointer"
                  />
                </div>

                {/* 3. Bar Terminal (ONLY FOR RESTAURANT AND BAR; NOT OFFERED FOR FOOD CART) */}
                {businessType !== 'FOOD_CART' && (
                  <div
                    onClick={() => setEnableBar(!enableBar)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      enableBar ? 'bg-purple-500/10 border-purple-500/60 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-400 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl border ${enableBar ? 'bg-purple-500 text-white border-purple-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                        <Wine className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">Bar Terminal KDS</span>
                          {businessType === 'BAR' && <Badge variant="brand" className="text-[9px]">Essential</Badge>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">Dedicated mixology terminal for drink queues, cocktail prep, and beverage dispensing.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableBar}
                      onChange={() => {}}
                      className="w-5 h-5 rounded text-purple-500 accent-purple-500 mt-1 cursor-pointer"
                    />
                  </div>
                )}

                {/* 4. Inventory Terminal */}
                <div
                  onClick={() => setEnableInventory(!enableInventory)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableInventory ? 'bg-rose-500/10 border-rose-500/60 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl border ${enableInventory ? 'bg-rose-500 text-white border-rose-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">Inventory & Stock OS</span>
                        <Badge variant="brand" className="text-[9px]">Included</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Track raw ingredients, recipe consumption, low stock alerts, and supplier orders.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableInventory}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-rose-500 accent-rose-500 mt-1 cursor-pointer"
                  />
                </div>

                {/* 5. Billing & POS */}
                <div
                  onClick={() => setEnableBilling(!enableBilling)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableBilling ? 'bg-sky-500/10 border-sky-500/60 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl border ${enableBilling ? 'bg-sky-500 text-white border-sky-400' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">Billing, POS & Tax Engine</span>
                        <Badge variant="success" className="text-[9px]">Essential</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">Digital POS receipts, custom UPI QR payments, GST invoices, and settlement logs.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableBilling}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-sky-500 accent-sky-500 mt-1 cursor-pointer"
                  />
                </div>

                {/* 6. Owner Dashboard (Auto-included) */}
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      <LayoutDashboard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Owner Executive Dashboard</span>
                        <span className="text-[10px] font-mono text-indigo-400 font-bold bg-indigo-500/20 px-2 py-0.5 rounded-full">ALWAYS ACTIVE</span>
                      </div>
                      <p className="text-slate-400 mt-0.5">Central commercial intelligence, menu pricing, theme, and staff management.</p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & CREATE WORKSPACE */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-1">
                <Badge variant="brand" className="mb-1">Step 4 — Review & Workspace Generation</Badge>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Review your Dinely configuration
                </h2>
                <p className="text-xs text-slate-400">Confirm your customized setup before launching your workspace.</p>
              </div>

              {/* Review Summary Card */}
              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-5">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Venue Name</span>
                    <span className="font-bold text-white text-base">{restaurantName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Business Model</span>
                    <span className="font-bold text-rose-400 text-base">{businessType}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Location</span>
                    <span className="font-bold text-slate-200">{city}, {country}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Capacity</span>
                    <span className="font-bold text-rose-400">{businessType === 'FOOD_CART' && !hasSeating ? 'Counter Token Pickup' : `${tablesCount} Tables`}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Generated Workspace Modules:</span>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="brand">Owner OS (Dashboard)</Badge>
                    {enableKitchen && <Badge variant="warning">Kitchen KDS</Badge>}
                    {enableWaiter && (businessType !== 'FOOD_CART' || hasSeating) && <Badge variant="success">Waiter Terminal</Badge>}
                    {enableBar && businessType !== 'FOOD_CART' && <Badge variant="brand">Bar Terminal</Badge>}
                    {enableInventory && <Badge variant="brand">Inventory OS</Badge>}
                    {enableBilling && <Badge variant="info">Billing & POS</Badge>}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Authenticated Owner:</span>
                  <span className="font-mono text-white font-bold">{currentUser.name} ({currentUser.email})</span>
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
                Create Workspace & Submit →
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
