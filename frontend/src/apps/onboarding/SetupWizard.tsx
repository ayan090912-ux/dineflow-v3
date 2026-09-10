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

  // 4-Step Onboarding State with URL search params synchronization
  const getInitialStep = () => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const s = parseInt(searchParams.get('step') || '1', 10);
      if (s >= 1 && s <= 4) return s;
    }
    return 1;
  };

  const [currentStep, setCurrentStepState] = useState<number>(getInitialStep);

  const setCurrentStep = (step: number) => {
    const valid = Math.max(1, Math.min(step, 4));
    setCurrentStepState(valid);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('step', String(valid));
      window.history.replaceState({}, '', url.toString());
    }
  };
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
        const stepParam = parseInt(searchParams.get('step') || '', 10);
        if (stepParam >= 1 && stepParam <= 4) {
          setCurrentStep(stepParam);
        } else {
          setCurrentStep(1);
        }
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
        tableCount: finalTablesCount,
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
      <div className="min-h-screen bg-[#0b0d11] text-[#f3f4f6] flex flex-col justify-center items-center p-4 sm:p-6 relative font-sans">
        <div className="w-full max-w-md space-y-6 relative z-10 text-center">
          <div className="flex items-center justify-center mb-4 text-white">
            <DinelyLogo size="md" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
              Onboard your restaurant
            </h1>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Connect your owner account to begin configuring your digital workspace.
            </p>
          </div>

          <div className="bg-[#12151b] border border-[#1e232e] p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 text-left">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthInitializing}
                className="w-full py-3 text-xs font-semibold bg-[#1a1e27] hover:bg-[#222734] text-white rounded-lg flex items-center justify-center gap-3 border border-[#2d3545] hover:border-slate-500 transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="pt-2 text-center border-t border-[#1e232e]">
                <button
                  type="button"
                  onClick={() => { if (onNavigate) onNavigate('/restaurant/login'); }}
                  className="text-xs text-[#f97316] hover:underline font-semibold cursor-pointer"
                >
                  Log in with existing password credentials →
                </button>
              </div>
            </div>
          </div>

          <footer className="text-xs text-slate-500">
            Dinely Multi-Tenant Restaurant Operating System
          </footer>
        </div>
      </div>
    );
  }

  // STEP 1 - 4: AUTHENTICATED RESTAURANT SETUP WIZARD
  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#f3f4f6] flex flex-col justify-between font-sans">
      {/* Top Header Navbar */}
      <header className="border-b border-[#1e232e] bg-[#0b0d11]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-white">
            <DinelyLogo size="sm" />
            <span className="text-slate-600 text-sm hidden sm:inline">•</span>
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">Venue Onboarding</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400 hidden sm:inline font-mono">{currentUser.email}</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1a1e27] text-[#f97316] border border-[#2d3545]">
              Step {currentStep} of 4
            </span>
          </div>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="max-w-3xl w-full mx-auto my-10 px-4 sm:px-6 flex-1">
        <div className="bg-[#12151b] border border-[#1e232e] p-6 sm:p-10 shadow-xl space-y-8 rounded-2xl text-left">
          {/* Progress Tracker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span className={currentStep >= 1 ? 'text-white' : 'text-slate-600'}>1. Business Model</span>
              <span className={currentStep >= 2 ? 'text-white' : 'text-slate-600'}>2. Venue Details</span>
              <span className={currentStep >= 3 ? 'text-white' : 'text-slate-600'}>3. Stations</span>
              <span className={currentStep >= 4 ? 'text-white' : 'text-slate-600'}>4. Launch</span>
            </div>
            <div className="h-1.5 w-full bg-[#1a1e27] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#f97316] transition-all duration-300 ease-out"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Error Callout */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* STEP 1: BUSINESS TYPE (ONLY 3 CARDS) */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  What type of venue do you operate?
                </h2>
                <p className="text-xs text-slate-400">
                  Select your operational model. Dinely configures the ideal terminal suite for your workflow.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {BUSINESS_TYPES.map((bt) => {
                  const IconComp = bt.icon;
                  const isSelected = businessType === bt.id;
                  return (
                    <div
                      key={bt.id}
                      onClick={() => applyBusinessTypeDefaults(bt.id)}
                      className={`p-4 sm:p-5 rounded-xl border cursor-pointer transition-all flex items-start gap-4 ${
                        isSelected
                          ? 'bg-[#1a1e27] border-[#f97316] text-white shadow-sm'
                          : 'bg-[#0b0d11] border-[#1e232e] text-slate-400 hover:border-[#2d3545] hover:text-slate-200'
                      }`}
                    >
                      <div className={`p-2.5 rounded-lg border shrink-0 ${isSelected ? 'bg-[#f97316] text-[#0b0d11] border-[#f97316]' : 'bg-[#12151b] border-[#2d3545] text-slate-400'}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white tracking-tight font-display">{bt.name}</h3>
                          <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                            isSelected ? 'bg-[#f97316]/10 text-[#f97316] border-[#f97316]/30' : 'bg-[#12151b] text-slate-500 border-[#1e232e]'
                          }`}>
                            {bt.tagline}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{bt.desc}</p>
                      </div>
                      <div className="pt-1 shrink-0">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-[#f97316] bg-[#f97316] text-[#0b0d11]' : 'border-slate-700'}`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
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
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  Venue details & floorplan
                </h2>
                <p className="text-xs text-slate-400">Provide official venue name, location, and guest dining capacity.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Venue Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Lumiere Bistro"
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Contact Phone *</label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                </div>

                {/* Verified Owner Identity */}
                {currentUser && (
                  <div className="p-3 bg-[#0b0d11] rounded-lg border border-[#1e232e] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-slate-400">Authenticated Owner:</span>
                      <strong className="text-white font-mono">{currentUser.email}</strong>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400">VERIFIED</span>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">City *</label>
                    <input
                      type="text"
                      placeholder="e.g. Bengaluru"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Country *</label>
                    <input
                      type="text"
                      placeholder="e.g. India"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                </div>

                {/* Seating / Table Configuration */}
                {businessType === 'FOOD_CART' ? (
                  <div className="p-4 bg-[#0b0d11] rounded-xl border border-[#1e232e] space-y-3">
                    <label className="text-xs font-semibold text-slate-300 block">Customer Seating Mode *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setHasSeating(true); setEnableWaiter(true); if (tablesCount === 0) setTablesCount(5); }}
                        className={`p-3 rounded-lg border text-xs font-semibold transition-all text-left space-y-1 cursor-pointer ${
                          hasSeating ? 'bg-[#1a1e27] border-[#f97316] text-white' : 'bg-[#12151b] border-[#2d3545] text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>Tables Available</span>
                          {hasSeating && <CheckCircle2 className="w-3.5 h-3.5 text-[#f97316]" />}
                        </div>
                        <p className="text-[10px] text-slate-500 font-normal">Customer tables with individual QR ordering</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setHasSeating(false); setEnableWaiter(false); setTablesCount(0); }}
                        className={`p-3 rounded-lg border text-xs font-semibold transition-all text-left space-y-1 cursor-pointer ${
                          !hasSeating ? 'bg-[#1a1e27] border-[#f97316] text-white' : 'bg-[#12151b] border-[#2d3545] text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>Counter Pickup Only</span>
                          {!hasSeating && <CheckCircle2 className="w-3.5 h-3.5 text-[#f97316]" />}
                        </div>
                        <p className="text-[10px] text-slate-500 font-normal">Single Standee QR with token numbering</p>
                      </button>
                    </div>

                    {hasSeating && (
                      <div className="pt-2 flex items-center justify-between border-t border-[#1e232e]">
                        <label className="text-xs font-medium text-white flex items-center gap-1.5">
                          <Grid className="w-3.5 h-3.5 text-[#f97316]" /> Table Count
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={tablesCount}
                          onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-3 py-1 bg-[#12151b] border border-[#2d3545] rounded-lg text-center font-bold text-[#f97316] text-sm"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-[#0b0d11] rounded-xl border border-[#1e232e] flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Grid className="w-3.5 h-3.5 text-[#f97316]" /> Dining Tables Count *
                      </label>
                      <p className="text-[11px] text-slate-400">Total dining tables for QR menus and floor ordering.</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={tablesCount}
                      onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-3 py-1.5 bg-[#12151b] border border-[#2d3545] rounded-lg text-center font-bold text-[#f97316] text-base focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: CHOOSE YOUR DINELY TERMINALS */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  Operational modules
                </h2>
                <p className="text-xs text-slate-400">
                  Select which terminals should be generated for your {businessType.toLowerCase()} workspace.
                </p>
              </div>

              <div className="space-y-2.5">
                {/* 1. Kitchen KDS */}
                <div
                  onClick={() => setEnableKitchen(!enableKitchen)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableKitchen ? 'bg-[#1a1e27] border-[#2d3545] text-white' : 'bg-[#0b0d11] border-[#1e232e] text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${enableKitchen ? 'bg-[#12151b] text-[#f97316] border-[#2d3545]' : 'bg-[#12151b] border-[#1e232e] text-slate-500'}`}>
                      <ChefHat className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-xs">Kitchen Display System (KDS)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#f97316]/10 text-[#f97316]">Recommended</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Live food tickets, station timers, and cook bump board.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableKitchen}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-[#f97316] accent-[#f97316] mt-1 cursor-pointer"
                  />
                </div>

                {/* 2. Waiter Terminal */}
                <div
                  onClick={() => setEnableWaiter(!enableWaiter)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableWaiter ? 'bg-[#1a1e27] border-[#2d3545] text-white' : 'bg-[#0b0d11] border-[#1e232e] text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${enableWaiter ? 'bg-[#12151b] text-[#10b981] border-[#2d3545]' : 'bg-[#12151b] border-[#1e232e] text-slate-500'}`}>
                      <PhoneCall className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-xs">Waiter Terminal OS</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Floor service alerts, water/bill calls, and active dining tables.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableWaiter}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-[#10b981] accent-[#10b981] mt-1 cursor-pointer"
                  />
                </div>

                {/* 3. Bar Terminal */}
                {businessType !== 'FOOD_CART' && (
                  <div
                    onClick={() => setEnableBar(!enableBar)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      enableBar ? 'bg-[#1a1e27] border-[#2d3545] text-white' : 'bg-[#0b0d11] border-[#1e232e] text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg border ${enableBar ? 'bg-[#12151b] text-purple-400 border-[#2d3545]' : 'bg-[#12151b] border-[#1e232e] text-slate-500'}`}>
                        <Wine className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs">Bar & Mixology Terminal</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Dedicated beverage queue, cocktail batching, and drink orders.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableBar}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-purple-400 accent-purple-400 mt-1 cursor-pointer"
                    />
                  </div>
                )}

                {/* 4. Inventory Terminal */}
                <div
                  onClick={() => setEnableInventory(!enableInventory)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableInventory ? 'bg-[#1a1e27] border-[#2d3545] text-white' : 'bg-[#0b0d11] border-[#1e232e] text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${enableInventory ? 'bg-[#12151b] text-rose-400 border-[#2d3545]' : 'bg-[#12151b] border-[#1e232e] text-slate-500'}`}>
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-xs">Inventory Management</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Raw materials, recipe depletion, and low stock warnings.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableInventory}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-rose-400 accent-rose-400 mt-1 cursor-pointer"
                  />
                </div>

                {/* 5. Billing & POS */}
                <div
                  onClick={() => setEnableBilling(!enableBilling)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    enableBilling ? 'bg-[#1a1e27] border-[#2d3545] text-white' : 'bg-[#0b0d11] border-[#1e232e] text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${enableBilling ? 'bg-[#12151b] text-sky-400 border-[#2d3545]' : 'bg-[#12151b] border-[#1e232e] text-slate-500'}`}>
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-xs">Billing, GST & UPI Engine</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400">Essential</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Digital receipts, UPI QR standees, and tax invoices.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableBilling}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-sky-400 accent-sky-400 mt-1 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & CREATE WORKSPACE */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  Review & launch workspace
                </h2>
                <p className="text-xs text-slate-400">Confirm your venue parameters before generating the live tenant.</p>
              </div>

              {/* Review Summary Card */}
              <div className="p-5 bg-[#0b0d11] rounded-xl border border-[#1e232e] space-y-4 text-left">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Venue Name</span>
                    <span className="font-bold text-white text-sm">{restaurantName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Business Model</span>
                    <span className="font-semibold text-[#f97316] text-sm">{businessType}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Location</span>
                    <span className="text-slate-300">{city}, {country}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Capacity</span>
                    <span className="font-semibold text-white">{businessType === 'FOOD_CART' && !hasSeating ? 'Counter Pickup' : `${tablesCount} Tables`}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1e232e] space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block">Enabled Modules:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Owner OS</span>
                    {enableKitchen && <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Kitchen KDS</span>}
                    {enableWaiter && (businessType !== 'FOOD_CART' || hasSeating) && <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Waiter Terminal</span>}
                    {enableBar && businessType !== 'FOOD_CART' && <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Bar Terminal</span>}
                    {enableInventory && <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Inventory OS</span>}
                    {enableBilling && <span className="text-[11px] px-2 py-0.5 rounded bg-[#1a1e27] border border-[#2d3545] text-white">Billing & UPI</span>}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1e232e] text-xs text-slate-400 flex items-center justify-between">
                  <span>Owner Account:</span>
                  <span className="font-mono text-white">{currentUser.email}</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1e232e]">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg border border-[#2d3545] hover:border-slate-500 bg-[#1a1e27] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : <div />}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitApplication}
                disabled={isSubmitting}
                className="px-8 py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <span>{isSubmitting ? 'Submitting Application...' : 'Create Workspace & Submit'}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-[#1e232e] py-6 px-4 text-center text-xs text-slate-600">
        Dinely Restaurant Operating System • Enterprise Multi-Tenant Architecture
      </footer>
    </div>
  );
};

export default SetupWizard;

