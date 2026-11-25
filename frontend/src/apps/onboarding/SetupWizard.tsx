import React, { useState, useEffect } from 'react';
import { api } from '../../packages/api/client';
import { signInWithGoogle, handleGoogleRedirectResult } from '../../packages/auth/firebase';
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
  QrCode,
} from 'lucide-react';
import { Restaurant, User, BusinessType } from '../../packages/types';

interface SetupWizardProps {
  initialOwnerData?: any;
  onFinishSetup: (setupData: any) => void;
  onNavigate?: (path: string) => void;
}

// 4 BUSINESS TYPES
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
  {
    id: 'WEDDING_ORDERING',
    name: 'Wedding Ordering Setup',
    icon: Sparkles,
    tagline: 'Banquets & Event Catering',
    desc: 'Provide wedding guests with table-specific QR codes for ordering food directly to the kitchen.',
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
  const [businessType, setBusinessType] = useState<BusinessType>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('type') || sp.get('businessType');
      if (t === 'WEDDING_ORDERING' || t === 'WEDDINGS' || t === 'wedding') return 'WEDDING_ORDERING';
    }
    return 'RESTAURANT';
  });

  // Existing Owner Restaurants (for Wedding Ordering association)
  const [ownerRestaurants, setOwnerRestaurants] = useState<Restaurant[]>([]);
  const [selectedCateringRestaurantId, setSelectedCateringRestaurantId] = useState<string>('');

  // Wedding Specific Setup Fields
  const [weddingName, setWeddingName] = useState('');
  const [weddingDate, setWeddingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [weddingVenueName, setWeddingVenueName] = useState('');
  const [weddingVenueCity, setWeddingVenueCity] = useState('');
  const [weddingGuestCount, setWeddingGuestCount] = useState<number>(120);
  const [weddingTableCount, setWeddingTableCount] = useState<number>(15);
  const [weddingCateringNotes, setWeddingCateringNotes] = useState('');

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
    } else if (type === 'WEDDING_ORDERING') {
      setEnableKitchen(true);
      setEnableWaiter(true);
      setEnableBar(true);
      setEnableInventory(true);
      setEnableBilling(true);
      setHasSeating(true);
      if (tablesCount === 0) setTablesCount(15);
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

  // Check user state and pending mobile redirect on mount
  useEffect(() => {
    let isMounted = true;
    const initUser = async () => {
      try {
        const redirectUser = await handleGoogleRedirectResult();
        if (redirectUser && isMounted) {
          setIsAuthInitializing(true);
          const authRes = await api.authenticateWithGoogle({
            googleUid: redirectUser.uid,
            email: redirectUser.email,
            name: redirectUser.displayName,
            photoURL: redirectUser.photoURL,
            idToken: redirectUser.idToken,
          });
          setCurrentUser(authRes.user);
          setIsAuthInitializing(false);
          await resolveOwnerState(authRes.user);
          return;
        }
      } catch (e) {
        console.warn('SetupWizard redirect result check:', e);
      }

      const user = api.getCurrentUser();
      if (isMounted) {
        setCurrentUser(user);
        if (user) {
          resolveOwnerState(user);
        }
      }
    };

    initUser();
    return () => {
      isMounted = false;
    };
  }, []);

  const resolveOwnerState = async (user: User) => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const isWeddingType = searchParams.get('type') === 'WEDDING_ORDERING' || searchParams.get('type') === 'WEDDINGS' || searchParams.get('type') === 'wedding';
      const isCreateMode = searchParams.get('mode') === 'create' || searchParams.get('new') === 'true' || window.location.hash.includes('create') || isWeddingType;
      
      if (isWeddingType) {
        setBusinessType('WEDDING_ORDERING');
      }

      const restaurants = await api.getOwnerRestaurants(user.email);
      setOwnerRestaurants(restaurants || []);
      if (restaurants && restaurants.length > 0 && !selectedCateringRestaurantId) {
        if (!isCreateMode) {
          setSelectedCateringRestaurantId(restaurants[0].id);
          if (!restaurantName) setRestaurantName(restaurants[0].name);
        } else {
          setSelectedCateringRestaurantId('NEW');
        }
      }

      if (isCreateMode) {
        const stepParam = parseInt(searchParams.get('step') || '', 10);
        if (stepParam >= 1 && stepParam <= 4) {
          setCurrentStep(stepParam);
        } else {
          setCurrentStep(1);
        }
        return;
      }

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
      const googleResult = await signInWithGoogle();
      if (!googleResult) {
        // Redirect flow initiated on mobile device
        return;
      }
      const authRes = await api.authenticateWithGoogle({
        googleUid: googleResult.uid,
        email: googleResult.email,
        name: googleResult.displayName,
        photoURL: googleResult.photoURL,
        idToken: googleResult.idToken,
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
      if (businessType === 'WEDDING_ORDERING' && ownerRestaurants.length > 0 && !selectedCateringRestaurantId) {
        setSelectedCateringRestaurantId(ownerRestaurants[0].id);
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (businessType === 'WEDDING_ORDERING') {
        const isExisting = selectedCateringRestaurantId && selectedCateringRestaurantId !== 'NEW';
        if (!weddingName.trim()) {
          setErrorMessage('Please enter the wedding or celebration event name (e.g. Julian & Clara\'s Reception).');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (!weddingDate) {
          setErrorMessage('Please select the wedding reception date.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (!weddingVenueName.trim()) {
          setErrorMessage('Please enter the banquet hall or reception venue name.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const phoneCheck = validatePhone(phone);
        if (!phoneCheck.valid) {
          setErrorMessage(phoneCheck.error || 'Please provide a valid owner contact phone number.');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (!isExisting) {
          if (!restaurantName.trim() && !weddingVenueName.trim()) {
            setErrorMessage('Please enter your catering kitchen / venue name.');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          if (!restaurantName.trim() && weddingVenueName.trim()) {
            setRestaurantName(weddingVenueName.trim());
          }
          if (!city.trim() && weddingVenueCity.trim()) {
            setCity(weddingVenueCity.trim());
          }
          if (!country.trim()) {
            setCountry('India');
          }
          if (!address.trim() && weddingVenueName.trim()) {
            setAddress(weddingVenueName.trim());
          }
        }
        setCurrentStep(3);
      } else {
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
      }
    } else if (currentStep === 3) {
      if (businessType !== 'WEDDING_ORDERING') {
        const anySelected = enableKitchen || enableWaiter || enableBar || enableInventory || enableBilling;
        if (!anySelected) {
          setErrorMessage('Please select at least one operational terminal for your business.');
          return;
        }
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

      // INTEGRATED WEDDING ORDERING SETUP SUBMISSION
      if (businessType === 'WEDDING_ORDERING') {
        const weddingBizName = weddingName.trim() || restaurantName.trim() || 'Wedding & Event Banquet';
        const venueAddress = [address, city, state, country, postalCode ? `PIN: ${postalCode}` : ''].filter(Boolean).join(', ') ||
          `${weddingVenueName.trim()}, ${weddingVenueCity.trim() || city.trim() || 'Bengaluru'}`;
        const finalTableCount = Math.max(1, weddingTableCount || 15);
        const cateringRestId = (selectedCateringRestaurantId && selectedCateringRestaurantId !== 'NEW') ? selectedCateringRestaurantId : undefined;

        // Provision the dedicated Wedding & Events business record
        const createdWeddingBiz = await api.createRestaurantForOwner({
          name: weddingBizName,
          businessType: 'WEDDING_EVENT' as any,
          hasBar: enableBar !== false,
          hasTables: true,
          hasKitchen: true,
          hasWaiter: true,
          tableCount: finalTableCount,
          address: venueAddress,
          phone: phone.trim(),
          email: user.email,
          ownerName: user.name || user.firstName || user.email.split('@')[0],
          ownerEmail: user.email,
          ownerUid: user.id || (user as any).uid || (user as any).googleUid,
          enabledModules: ['weddings', 'kitchen', 'bar', 'hookah', 'tables', 'billing'],
        });

        await api.submitRestaurantLaunch({
          id: createdWeddingBiz.id,
          restaurantName: weddingBizName,
          businessType: 'WEDDING_EVENT' as any,
          hasBar: enableBar !== false,
          hasTables: true,
          hasKitchen: true,
          hasWaiter: true,
          hasInventory: true,
          hasBilling: true,
          enabledModules: ['weddings', 'kitchen', 'bar', 'hookah', 'tables', 'billing'],
          address: venueAddress,
          locality,
          city: weddingVenueCity.trim() || city.trim() || 'Bengaluru',
          state,
          country: country.trim() || 'India',
          postalCode,
          latitude,
          longitude,
          placeId,
          phone: phone.trim(),
          email: user.email,
          tables: { indoor: finalTableCount, outdoor: 0, vip: 0 },
          totalTablesCount: finalTableCount,
        });

        // Submit the persistent wedding setup request for Platform Admin review
        await api.submitWeddingRequest({
          applicantName: user.name || user.firstName || user.email.split('@')[0],
          applicantEmail: user.email,
          applicantPhone: phone.trim(),
          weddingName: weddingName.trim() || weddingBizName,
          eventType: 'WEDDING',
          eventDate: weddingDate,
          venueName: weddingVenueName.trim() || weddingBizName,
          venueCity: weddingVenueCity.trim() || city.trim() || 'Bengaluru',
          estimatedGuestCount: Number(weddingGuestCount) || 120,
          cateringRestaurantId: cateringRestId || createdWeddingBiz.id,
          cateringNotes: weddingCateringNotes.trim(),
        });

        setIsSubmitting(false);
        await api.switchActiveRestaurant(createdWeddingBiz.id);
        api.setCurrentRestaurantId(createdWeddingBiz.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('dinely_active_restaurant_id', createdWeddingBiz.id);
          sessionStorage.setItem('dinely_active_restaurant_id', createdWeddingBiz.id);
          localStorage.setItem('dinely_wedding_workspace_id', createdWeddingBiz.id);
        }
        onFinishSetup(createdWeddingBiz);
        if (onNavigate) {
          onNavigate('/weddings/dashboard');
        } else if (typeof window !== 'undefined') {
          window.location.href = '/weddings/dashboard';
        }
        return;
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
      if (!isNoSeating) enabledModules.push('tables');

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
        ownerUid: user.id || (user as any).uid || (user as any).googleUid,
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
  const stepItems = [
    { num: 1, title: 'Business model', subtitle: 'Venue format & workflow' },
    { num: 2, title: businessType === 'WEDDING_ORDERING' ? 'Event & kitchen' : 'Venue details', subtitle: 'Name, address & capacity' },
    { num: 3, title: businessType === 'WEDDING_ORDERING' ? 'Architecture' : 'Terminals', subtitle: 'Operational stations' },
    { num: 4, title: 'Review & launch', subtitle: 'Confirm configuration' },
  ];

  const inputClass =
    'w-full px-3.5 py-2.5 bg-[#0b0d12] border border-[#232836] rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-400 transition-colors';

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 flex flex-col justify-between font-sans">
      {/* Top Header */}
      <header className="border-b border-[#1b1f29] bg-[#0a0c10] sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <DinelyLogo size="sm" />
            <span className="text-slate-700 text-sm hidden sm:inline">/</span>
            <span className="text-xs font-medium text-slate-400 hidden sm:inline">New Workspace</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400 hidden sm:inline">{currentUser.email}</span>
            <span className="text-xs font-medium text-slate-300 sm:hidden">
              Step {currentStep} of 4
            </span>
          </div>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 lg:gap-12 items-start">
          {/* Left Rail: Stepper & Live Summary */}
          <aside className="space-y-8 lg:sticky lg:top-24">
            <nav aria-label="Onboarding steps" className="space-y-1">
              {stepItems.map((s) => {
                const isActive = currentStep === s.num;
                const isDone = currentStep > s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    disabled={!isDone && !isActive}
                    onClick={() => {
                      if (isDone) setCurrentStep(s.num);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors ${
                      isActive
                        ? 'bg-[#141821] text-white'
                        : isDone
                        ? 'text-slate-300 hover:bg-[#101319] cursor-pointer'
                        : 'text-slate-600 cursor-default'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5 border ${
                        isActive
                          ? 'bg-white text-slate-950 border-white'
                          : isDone
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-transparent text-slate-600 border-[#232836]'
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3 stroke-[2.5]" /> : s.num}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${isActive ? 'text-white' : isDone ? 'text-slate-200' : 'text-slate-500'}`}>
                        {s.title}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{s.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Live Configuration Summary */}
            <div className="hidden lg:block pt-6 border-t border-[#1b1f29] space-y-3 text-xs">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Configuration</p>
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Format</dt>
                  <dd className="text-slate-200 font-medium text-right">
                    {BUSINESS_TYPES.find((b) => b.id === businessType)?.name}
                  </dd>
                </div>
                {restaurantName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Venue</dt>
                    <dd className="text-slate-200 font-medium truncate max-w-[140px] text-right">{restaurantName}</dd>
                  </div>
                )}
                {city && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">City</dt>
                    <dd className="text-slate-200 text-right">{city}</dd>
                  </div>
                )}
                {businessType !== 'WEDDING_ORDERING' && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Seating</dt>
                    <dd className="text-slate-200 text-right">
                      {businessType === 'FOOD_CART' && !hasSeating ? 'Counter pickup' : `${tablesCount} tables`}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>

          {/* Right Canvas: Focused Step Form */}
          <div className="bg-[#101319] border border-[#1d222d] p-6 sm:p-8 space-y-8 rounded-xl text-left">
            {/* Error Callout */}
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* STEP 1: BUSINESS TYPE */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Choose your venue format
                  </h1>
                  <p className="text-sm text-slate-400">
                    Select how your operation runs. We will pre-configure the matching POS and service terminals.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {BUSINESS_TYPES.map((bt) => {
                    const IconComp = bt.icon;
                    const isSelected = businessType === bt.id;
                    return (
                      <button
                        type="button"
                        key={bt.id}
                        onClick={() => applyBusinessTypeDefaults(bt.id)}
                        className={`p-5 rounded-xl border text-left transition-colors flex flex-col justify-between gap-4 cursor-pointer ${
                          isSelected
                            ? 'bg-[#161a24] border-white text-white'
                            : 'bg-[#0b0d12] border-[#1d222d] text-slate-400 hover:border-[#2e3545] hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div
                            className={`p-2 rounded-lg border ${
                              isSelected
                                ? 'bg-white text-slate-950 border-white'
                                : 'bg-[#12151d] border-[#232836] text-slate-400'
                            }`}
                          >
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-700'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-white">{bt.name}</h3>
                          <p className="text-xs text-slate-400 leading-relaxed">{bt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2: BUSINESS DETAILS & LOCATION (OR WEDDING ORDERING REQUIREMENTS) */}
            {currentStep === 2 && businessType === 'WEDDING_ORDERING' ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Banquet & catering setup
                  </h1>
                  <p className="text-sm text-slate-400">
                    Connect a catering kitchen and enter event details for guest table QR ordering.
                  </p>
                </div>

                {/* Fulfilling Restaurant / Kitchen Selection */}
                <div className="p-4 bg-[#0b0d12] rounded-xl border border-[#1d222d] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white">Fulfilling Catering Kitchen *</label>
                    <span className="text-[11px] text-slate-500">Required</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Select an existing restaurant or register a catering kitchen to receive banquet orders.
                  </p>

                  {ownerRestaurants.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      {ownerRestaurants.map((r) => {
                        const isChosen = selectedCateringRestaurantId === r.id;
                        return (
                          <div
                            key={r.id}
                            onClick={() => {
                              setSelectedCateringRestaurantId(r.id);
                              if (r.address) {
                                const parts = r.address.split(',');
                                if (!weddingVenueCity && parts.length > 1) {
                                  setWeddingVenueCity(parts[parts.length - 2].trim());
                                }
                              }
                            }}
                            className={`p-3.5 rounded-lg border cursor-pointer transition-colors flex items-center justify-between ${
                              isChosen
                                ? 'bg-[#161a24] border-white text-white'
                                : 'bg-[#101319] border-[#232836] text-slate-400 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg border ${isChosen ? 'bg-white text-slate-950 border-white' : 'bg-[#151922] border-[#232836] text-slate-400'}`}>
                                <UtensilsCrossed className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-white">{r.name}</h4>
                                <p className="text-[11px] text-slate-400 truncate max-w-sm">{r.address || 'Active Restaurant'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[11px] text-slate-400">
                                {r.isApproved || r.lifecycleStatus === 'LIVE' ? 'Active' : 'Pending'}
                              </span>
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isChosen ? 'border-white bg-white text-slate-950' : 'border-slate-700'
                              }`}>
                                {isChosen && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div
                        onClick={() => setSelectedCateringRestaurantId('NEW')}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between ${
                          selectedCateringRestaurantId === 'NEW'
                            ? 'bg-[#161a24] border-white text-white'
                            : 'bg-[#0b0d12] border-dashed border-[#232836] text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="text-xs font-medium">+ Register a new catering kitchen</span>
                        {selectedCateringRestaurantId === 'NEW' && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-[#121620] border border-[#232836] rounded-lg text-xs text-slate-300 space-y-1">
                      <p className="font-medium flex items-center gap-1.5 text-white">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" /> Catering kitchen required
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Enter your catering venue details below to configure the kitchen terminal for this event.
                      </p>
                    </div>
                  )}
                </div>

                {/* If registering new catering kitchen profile */}
                {(selectedCateringRestaurantId === 'NEW' || ownerRestaurants.length === 0) && (
                  <div className="space-y-4 p-4 bg-[#0b0d12] rounded-xl border border-[#1d222d]">
                    <h4 className="text-xs font-semibold text-white">Catering Kitchen Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">Kitchen / Restaurant Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Royal Banquet Caterers"
                          value={restaurantName}
                          onChange={(e) => setRestaurantName(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">Kitchen Phone *</label>
                        <input
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">Street Address *</label>
                        <input
                          type="text"
                          placeholder="123 Culinary Boulevard"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">City *</label>
                        <input
                          type="text"
                          placeholder="e.g. Bengaluru"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Wedding Event Parameters */}
                <div className="space-y-4 p-4 bg-[#0b0d12] rounded-xl border border-[#1d222d]">
                  <h4 className="text-xs font-semibold text-white">Event Details</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Event Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Julian & Clara's Reception"
                        value={weddingName}
                        onChange={(e) => setWeddingName(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Event Date *</label>
                      <input
                        type="date"
                        value={weddingDate}
                        onChange={(e) => setWeddingDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Banquet Venue / Hall *</label>
                      <input
                        type="text"
                        placeholder="e.g. The Grand Glasshouse Atrium"
                        value={weddingVenueName}
                        onChange={(e) => setWeddingVenueName(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Venue City / Area *</label>
                      <input
                        type="text"
                        placeholder="e.g. Bengaluru, Karnataka"
                        value={weddingVenueCity}
                        onChange={(e) => setWeddingVenueCity(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Estimated Guest Count</label>
                      <input
                        type="number"
                        min={10}
                        max={2000}
                        value={weddingGuestCount}
                        onChange={(e) => setWeddingGuestCount(Math.max(1, parseInt(e.target.value) || 100))}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Banquet Tables Count *</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={weddingTableCount}
                        onChange={(e) => setWeddingTableCount(Math.max(1, parseInt(e.target.value) || 10))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Catering & Dietary Notes</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. 3-course plated service, craft mocktail bar, allergen-aware kitchen."
                      value={weddingCateringNotes}
                      onChange={(e) => setWeddingCateringNotes(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  {ownerRestaurants.length > 0 && selectedCateringRestaurantId !== 'NEW' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Owner Contact Phone *</label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : currentStep === 2 ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Venue details & capacity
                  </h1>
                  <p className="text-sm text-slate-400">
                    Enter your venue name, address, and table count to generate your floorplan and QR codes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Venue Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Lumiere Bistro"
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Contact Phone *</label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

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
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">City *</label>
                      <input
                        type="text"
                        placeholder="e.g. Bengaluru"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Country *</label>
                      <input
                        type="text"
                        placeholder="e.g. India"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  {/* Seating / Table Configuration */}
                  {businessType === 'FOOD_CART' ? (
                    <div className="p-4 bg-[#0b0d12] rounded-xl border border-[#1d222d] space-y-3">
                      <label className="text-xs font-medium text-slate-300 block">Seating & Ordering Mode *</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => { setHasSeating(true); setEnableWaiter(true); if (tablesCount === 0) setTablesCount(5); }}
                          className={`p-3.5 rounded-lg border text-xs font-medium transition-colors text-left space-y-1 cursor-pointer ${
                            hasSeating ? 'bg-[#161a24] border-white text-white' : 'bg-[#101319] border-[#232836] text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>Tables Available</span>
                            {hasSeating && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal">Individual QR ordering per table</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setHasSeating(false); setEnableWaiter(false); setTablesCount(0); }}
                          className={`p-3.5 rounded-lg border text-xs font-medium transition-colors text-left space-y-1 cursor-pointer ${
                            !hasSeating ? 'bg-[#161a24] border-white text-white' : 'bg-[#101319] border-[#232836] text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>Counter Pickup Only</span>
                            {!hasSeating && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal">Single standee QR with token numbers</p>
                        </button>
                      </div>

                      {hasSeating && (
                        <div className="pt-3 flex items-center justify-between border-t border-[#1d222d]">
                          <label className="text-xs font-medium text-white">Table Count</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={tablesCount}
                            onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-24 px-3 py-1.5 bg-[#101319] border border-[#232836] rounded-lg text-center font-semibold text-white text-sm focus:outline-none focus:border-slate-400"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-[#0b0d12] rounded-xl border border-[#1d222d] flex items-center justify-between gap-4">
                      <div>
                        <label className="text-xs font-medium text-white block">Dining Tables Count *</label>
                        <p className="text-xs text-slate-400 mt-0.5">Number of tables to pre-generate with unique QR codes.</p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={tablesCount}
                        onChange={(e) => setTablesCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 px-3 py-2 bg-[#101319] border border-[#232836] rounded-lg text-center font-semibold text-white text-sm focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* STEP 3: CHOOSE YOUR DINELY TERMINALS / WEDDING ARCHITECTURE */}
            {currentStep === 3 && businessType === 'WEDDING_ORDERING' ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Banquet workflow summary
                  </h1>
                  <p className="text-sm text-slate-400">
                    These capabilities will be provisioned for your wedding & event workspace.
                  </p>
                </div>

                <div className="divide-y divide-[#1d222d] border border-[#1d222d] rounded-xl bg-[#0b0d12]">
                  <div className="p-4 flex items-start gap-3.5">
                    <ChefHat className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <span className="font-medium text-white text-sm">Direct Kitchen KDS Routing</span>
                      <p className="text-xs text-slate-400">
                        Guest orders from banquet tables route straight to your catering kitchen display with table numbers and dietary notes.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 flex items-start gap-3.5">
                    <QrCode className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <span className="font-medium text-white text-sm">Table-Specific Banquet QR Codes</span>
                      <p className="text-xs text-slate-400">
                        Printable QR cards generated per table so guests scan and order without downloading an app.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 flex items-start gap-3.5">
                    <UtensilsCrossed className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <span className="font-medium text-white text-sm">Custom Banquet Menu</span>
                      <p className="text-xs text-slate-400">
                        Reuse your full restaurant catalog or curate a dedicated event menu with course pacing.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : currentStep === 3 ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Select operational terminals
                  </h1>
                  <p className="text-sm text-slate-400">
                    Enable the stations your team needs. You can adjust these anytime in settings.
                  </p>
                </div>

                <div className="divide-y divide-[#1d222d] border border-[#1d222d] rounded-xl bg-[#0b0d12] overflow-hidden">
                  {/* 1. Kitchen KDS */}
                  <label className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-[#121620] transition-colors">
                    <div className="flex items-start gap-3.5">
                      <ChefHat className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white text-sm">Kitchen Display (KDS)</span>
                          <span className="text-[11px] text-slate-400">• Recommended</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">Live food tickets, prep timers, and order bump board.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableKitchen}
                      onChange={() => setEnableKitchen(!enableKitchen)}
                      className="w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 2. Waiter Terminal */}
                  <label className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-[#121620] transition-colors">
                    <div className="flex items-start gap-3.5">
                      <PhoneCall className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-white text-sm block">Waiter Terminal</span>
                        <p className="text-xs text-slate-400 mt-0.5">Floor service requests, table sessions, and runner dispatch.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableWaiter}
                      onChange={() => setEnableWaiter(!enableWaiter)}
                      className="w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 3. Bar Terminal */}
                  {businessType !== 'FOOD_CART' && (
                    <label className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-[#121620] transition-colors">
                      <div className="flex items-start gap-3.5">
                        <Wine className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium text-white text-sm block">Bar & Beverage Terminal</span>
                          <p className="text-xs text-slate-400 mt-0.5">Dedicated drink queue, mixology prep, and bar pass.</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={enableBar}
                        onChange={() => setEnableBar(!enableBar)}
                        className="w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                      />
                    </label>
                  )}

                  {/* 4. Inventory Terminal */}
                  <label className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-[#121620] transition-colors">
                    <div className="flex items-start gap-3.5">
                      <Package className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-white text-sm block">Inventory Management</span>
                        <p className="text-xs text-slate-400 mt-0.5">Raw material stock levels, recipe depletion, and low-stock alerts.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableInventory}
                      onChange={() => setEnableInventory(!enableInventory)}
                      className="w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                    />
                  </label>

                  {/* 5. Billing & POS */}
                  <label className="p-4 cursor-pointer flex items-center justify-between gap-4 hover:bg-[#121620] transition-colors">
                    <div className="flex items-start gap-3.5">
                      <Receipt className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-white text-sm block">Billing, GST & UPI Engine</span>
                        <p className="text-xs text-slate-400 mt-0.5">Tax invoices, dynamic UPI QR checkout, and daily settlement.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableBilling}
                      onChange={() => setEnableBilling(!enableBilling)}
                      className="w-4 h-4 rounded accent-white cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {/* STEP 4: REVIEW & CREATE WORKSPACE */}
            {currentStep === 4 && businessType === 'WEDDING_ORDERING' ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Review wedding setup
                  </h1>
                  <p className="text-sm text-slate-400">
                    Confirm your event details and catering kitchen before submitting.
                  </p>
                </div>

                <div className="border border-[#1d222d] rounded-xl bg-[#0b0d12] divide-y divide-[#1d222d] text-xs">
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Event Name</span>
                    <span className="font-medium text-white text-right">{weddingName || 'Wedding Reception'}</span>
                  </div>
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Event Date</span>
                    <span className="font-medium text-white text-right">{weddingDate || 'Scheduled date'}</span>
                  </div>
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Scale & Capacity</span>
                    <span className="font-medium text-white text-right">{weddingGuestCount} Guests • {weddingTableCount} Tables</span>
                  </div>
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Banquet Venue</span>
                    <span className="font-medium text-white text-right">{weddingVenueName || 'Venue hall'}, {weddingVenueCity}</span>
                  </div>
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Catering Kitchen</span>
                    <span className="font-medium text-white text-right">
                      {selectedCateringRestaurantId === 'NEW'
                        ? `${restaurantName} (New)`
                        : (ownerRestaurants.find((r) => r.id === selectedCateringRestaurantId)?.name || 'Existing Kitchen')}
                    </span>
                  </div>
                  {weddingCateringNotes && (
                    <div className="p-4 space-y-1">
                      <span className="text-slate-400 block">Catering Notes</span>
                      <p className="text-slate-200">{weddingCateringNotes}</p>
                    </div>
                  )}
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-slate-400">Owner Account</span>
                    <span className="text-slate-200">{currentUser.email}</span>
                  </div>
                </div>
              </div>
            ) : currentStep === 4 ? (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                    Review & create workspace
                  </h1>
                  <p className="text-sm text-slate-400">
                    Confirm your venue details before creating your live workspace.
                  </p>
                </div>

                <div className="border border-[#1d222d] rounded-xl bg-[#0b0d12] divide-y divide-[#1d222d] text-xs">
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Venue Name</span>
                    <span className="font-medium text-white text-sm">{restaurantName}</span>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Business Model</span>
                    <span className="font-medium text-white">
                      {BUSINESS_TYPES.find((b) => b.id === businessType)?.name || businessType}
                    </span>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Location</span>
                    <span className="text-slate-200">{city}, {country}</span>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Capacity</span>
                    <span className="font-medium text-white">
                      {businessType === 'FOOD_CART' && !hasSeating ? 'Counter Pickup' : `${tablesCount} Tables`}
                    </span>
                  </div>
                  <div className="p-4 space-y-2">
                    <span className="text-slate-400 block">Enabled Modules</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Owner Dashboard</span>
                      {enableKitchen && <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Kitchen KDS</span>}
                      {enableWaiter && (businessType !== 'FOOD_CART' || hasSeating) && <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Waiter Terminal</span>}
                      {enableBar && businessType !== 'FOOD_CART' && <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Bar Terminal</span>}
                      {enableInventory && <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Inventory</span>}
                      {enableBilling && <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#161a24] border border-[#232836] text-slate-200">Billing & UPI</span>}
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-slate-400">Owner Account</span>
                    <span className="text-slate-200">{currentUser.email}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Navigation Controls */}
            <div className="flex items-center justify-between pt-5 border-t border-[#1d222d]">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border border-[#232836] hover:border-slate-500 bg-[#141821] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-5 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-950 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-lg bg-white hover:bg-slate-200 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  <span>
                    {businessType === 'WEDDING_ORDERING'
                      ? (isSubmitting ? 'Submitting...' : 'Submit Wedding Request')
                      : (isSubmitting ? 'Creating workspace...' : 'Create Workspace')}
                  </span>
                  {!isSubmitting && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-[#1b1f29] py-5 px-4 text-center text-xs text-slate-600">
        Dinely
      </footer>
    </div>
  );
};

export default SetupWizard;

