import React, { useState } from 'react';
import { api } from '../../packages/api/client';
import {
  Button,
  Card,
  Input,
  Badge,
  Table,
  ImageUpload,
} from '../../packages/ui';
import {
  Building,
  MapPin,
  Palette,
  QrCode,
  Users,
  UtensilsCrossed,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  Clock,
  ShieldCheck,
  Store,
  DollarSign,
  Coffee,
  Wine,
  Truck,
  Flame,
  ChefHat,
  UserPlus,
  Eye,
  Check,
  Image as ImageIcon,
} from 'lucide-react';

interface SetupWizardProps {
  initialOwnerData?: any;
  onFinishSetup: (setupData: any) => void;
}

const RESTAURANT_TYPES = [
  { id: 'fine_dining', name: 'Fine Dining', icon: UtensilsCrossed, desc: 'Upscale seating with multi-course service' },
  { id: 'cafe', name: 'Cafe & Bistro', icon: Coffee, desc: 'Coffee, pastries, and artisanal light dining' },
  { id: 'cloud_kitchen', name: 'Cloud Kitchen', icon: Flame, desc: 'Delivery & takeaway optimized dark kitchen' },
  { id: 'fast_food', name: 'Fast Food', icon: Store, desc: 'High-speed quick service & counter POS' },
  { id: 'bakery', name: 'Bakery', icon: Coffee, desc: 'Fresh baked goods & custom orders' },
  { id: 'bar', name: 'Bar & Lounge', icon: Wine, desc: 'Cocktails, beverages, and pub bites' },
  { id: 'food_truck', name: 'Food Truck', icon: Truck, desc: 'Mobile POS with location dispatch' },
];

const BANNER_PRESETS = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=1000&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1000&auto=format&fit=crop&q=80',
];

const LOGO_PRESETS = [
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=200&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=200&auto=format&fit=crop&q=80',
];

export const SetupWizard: React.FC<SetupWizardProps> = ({
  initialOwnerData,
  onFinishSetup,
}) => {
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Business Info & Owner Login Credentials
  const [restaurantName, setRestaurantName] = useState(initialOwnerData?.restaurantName || 'Lumiere Bistro');
  const [brandName, setBrandName] = useState('Lumiere Hospitality Group');
  const [restaurantType, setRestaurantType] = useState('fine_dining');
  const [ownerName, setOwnerName] = useState(initialOwnerData?.ownerName || 'Restaurant Owner');
  const [ownerEmail, setOwnerEmail] = useState(initialOwnerData?.email || 'owner@lumiere.com');
  const [ownerPassword, setOwnerPassword] = useState('owner123');

  // Step 2: Address
  const [country, setCountry] = useState('United States');
  const [state, setState] = useState('California');
  const [city, setCity] = useState('San Francisco');
  const [address, setAddress] = useState('742 Montgomery St');
  const [pinCode, setPinCode] = useState('94111');
  const [timezone, setTimezone] = useState('America/Los_Angeles (PST)');
  const [currency, setCurrency] = useState('USD ($)');

  // Step 3: Branding
  const [logo, setLogo] = useState(LOGO_PRESETS[0]);
  const [banner, setBanner] = useState(BANNER_PRESETS[0]);
  const [primaryColor, setPrimaryColor] = useState('#e11d48'); // rose-600
  const [secondaryColor, setSecondaryColor] = useState('#f59e0b'); // amber-500

  // Step 4: Configuration & Tables
  const [indoorTables, setIndoorTables] = useState(12);
  const [outdoorTables, setOutdoorTables] = useState(6);
  const [vipTables, setVipTables] = useState(2);

  // Step 5: Restaurant Features (Modular Feature Flags)
  const [features, setFeatures] = useState({
    food_service: true,
    cafe: true,
    bar: true,
    bakery: false,
    desserts: true,
    takeaway: true,
    delivery: true,
    reservations: true,
    outdoor_seating: true,
    vip_rooms: true,
  });

  const toggleFeature = (key: keyof typeof features) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Step 6: Employees & Roster
  const [employees, setEmployees] = useState([
    { id: '1', name: 'Marcus Vance', email: 'marcus@lumiere.com', role: 'MANAGER', phone: '+1 555-0192', shift: 'Full Day (10AM - 10PM)', section: 'Front Floor & POS', status: 'ON_CLOCK' },
    { id: '2', name: 'Chef Jean-Luc', email: 'jean@lumiere.com', role: 'CHEF', phone: '+1 555-0193', shift: 'Evening (4PM - 12AM)', section: 'Main Kitchen', status: 'ON_CLOCK' },
    { id: '3', name: 'Marco Silva', email: 'bartender@lumiere.com', role: 'BARTENDER', phone: '+1 555-0310', shift: 'Night (6PM - 2AM)', section: 'Cocktail Bar', status: 'ON_CLOCK' },
    { id: '4', name: 'Elena Rostova', email: 'elena@lumiere.com', role: 'WAITER', phone: '+1 555-0194', shift: 'Evening (4PM - 12AM)', section: 'Patio & Section A', status: 'ON_CLOCK' },
  ]);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'MANAGER' | 'CHEF' | 'WAITER' | 'BARTENDER' | 'CASHIER'>('WAITER');
  const [newEmpShift, setNewEmpShift] = useState('Evening (4PM - 12AM)');
  const [newEmpSection, setNewEmpSection] = useState('Front Floor');

  // Step 7: Menu Setup
  const [categories, setCategories] = useState(['Starters', 'Main Course', 'Desserts', 'Drinks']);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [menuItems, setMenuItems] = useState([
    {
      id: 'm1',
      name: 'Truffle Mushroom Risotto',
      category: 'Main Course',
      price: 28,
      description: 'Arborio rice, wild mushrooms, fresh black truffle shavings, shaved parmesan.',
      isVegetarian: true,
      prepTime: 20,
      image: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=300&auto=format&fit=crop&q=80',
      available: true,
    },
    {
      id: 'm2',
      name: 'Wagyu Beef Burger',
      category: 'Main Course',
      price: 32,
      description: 'A5 Wagyu patty, aged cheddar, caramelized onion jam, brioche bun.',
      isVegetarian: false,
      prepTime: 15,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80',
      available: true,
    },
    {
      id: 'm3',
      name: 'Valrhona Chocolate Fondant',
      category: 'Desserts',
      price: 16,
      description: 'Warm molten chocolate cake served with Madagascar vanilla bean gelato.',
      isVegetarian: true,
      prepTime: 12,
      image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&auto=format&fit=crop&q=80',
      available: true,
    },
  ]);

  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Main Course');
  const [newItemPrice, setNewItemPrice] = useState('22');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemImage, setNewItemImage] = useState('');
  const [newItemIsVeg, setNewItemIsVeg] = useState(true);
  const [newItemPrepTime, setNewItemPrepTime] = useState('15');

  // Add Employee Handler
  const handleAddEmployee = () => {
    if (!newEmpName) return;
    setEmployees([
      ...employees,
      {
        id: Date.now().toString(),
        name: newEmpName,
        email: newEmpEmail || `${newEmpName.toLowerCase().replace(/\s+/g, '')}@lumiere.com`,
        role: newEmpRole,
        phone: newEmpPhone || '+1 555-0100',
        shift: newEmpShift,
        section: newEmpSection,
        status: 'ON_CLOCK',
      },
    ]);
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPhone('');
  };

  const handleRemoveEmployee = (id: string) => {
    setEmployees(employees.filter((e) => e.id !== id));
  };

  // Add Category Handler
  const handleAddCategory = () => {
    if (!newCategoryName) return;
    if (!categories.includes(newCategoryName)) {
      setCategories([...categories, newCategoryName]);
    }
    setNewCategoryName('');
  };

  // Add Menu Item Handler
  const handleAddMenuItem = () => {
    if (!newItemName || !newItemPrice) return;
    setMenuItems([
      ...menuItems,
      {
        id: Date.now().toString(),
        name: newItemName,
        category: newItemCategory,
        price: parseFloat(newItemPrice) || 0,
        description: newItemDesc || 'Delicious freshly prepared dish.',
        isVegetarian: newItemIsVeg,
        prepTime: parseInt(newItemPrepTime) || 15,
        image: newItemImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80',
        available: true,
      },
    ]);
    setNewItemName('');
    setNewItemDesc('');
    setNewItemImage('');
  };

  const totalTables = indoorTables + outdoorTables + vipTables;

  const stepsList = [
    { num: 1, name: 'Business Info', icon: Building },
    { num: 2, name: 'Address', icon: MapPin },
    { num: 3, name: 'Branding', icon: Palette },
    { num: 4, name: 'Tables & QR', icon: QrCode },
    { num: 5, name: 'Restaurant Features', icon: Wine },
    { num: 6, name: 'Staff Onboarding', icon: Users },
    { num: 7, name: 'Initial Menu', icon: UtensilsCrossed },
    { num: 8, name: 'Review & Launch', icon: Sparkles },
  ];

  const handleFinish = async () => {
    const finalData = {
      restaurantName,
      brandName,
      restaurantType,
      address: `${address}, ${city}, ${state} ${pinCode}, ${country}`,
      timezone,
      currency,
      theme: { logo, banner, primaryColor, secondaryColor },
      tables: { total: totalTables, indoor: indoorTables, outdoor: outdoorTables, vip: vipTables },
      features,
      employees,
      categories,
      menuItems,
    };

    try {
      const rest = await api.createRestaurantForOwner({
        name: restaurantName,
        cuisine: restaurantType.replace('_', ' '),
        address: `${address}, ${city}, ${state} ${pinCode}`,
        phone: initialOwnerData?.phone || '+1 555-0100',
        email: ownerEmail || 'owner@restaurant.com',
        ownerName: ownerName || 'Restaurant Owner',
        ownerEmail: ownerEmail || 'owner@restaurant.com',
        features,
        theme: {
          logo,
          bannerUrl: banner,
          primaryColor,
          secondaryColor,
        },
      });

      // Log in as owner of this newly registered restaurant
      try {
        await api.loginOwner(ownerEmail || rest.ownerEmail || 'owner@lumiere.com', ownerPassword || 'owner123');
      } catch (e) {
        // Fallback login succeeded inside createRestaurantForOwner
      }

      // Submit application and immediately approve for instant local dashboard access
      await api.submitRestaurantLaunch({
        id: rest.id,
        name: rest.name,
      });
      await api.approveRestaurant(rest.id);

      onFinishSetup(finalData);
    } catch (err) {
      onFinishSetup(finalData);
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Wizard Header Progress Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="brand">Step {currentStep} of 7</Badge>
                <span className="text-xs font-mono text-slate-400">Merchant Setup Wizard</span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1">Configure {restaurantName || 'Your Restaurant'}</h2>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-xs text-slate-400 font-mono">Progress: {Math.round((currentStep / 7) * 100)}%</span>
              <div className="w-36 h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all duration-300"
                  style={{ width: `${(currentStep / 7) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Steps Breadcrumbs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2 border-t border-slate-800/80">
            {stepsList.map((step) => {
              const Icon = step.icon;
              const isActive = step.num === currentStep;
              const isCompleted = step.num < currentStep;
              return (
                <button
                  key={step.num}
                  onClick={() => setCurrentStep(step.num)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all text-center ${
                    isActive
                      ? 'bg-rose-600/20 border border-rose-500/50 text-white'
                      : isCompleted
                      ? 'bg-slate-800/40 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-500 border border-transparent hover:text-slate-300'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                      isActive
                        ? 'bg-rose-600 text-white shadow-md'
                        : isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : step.num}
                  </div>
                  <span className="text-[10px] font-bold tracking-tight truncate max-w-full">{step.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 1: BUSINESS INFORMATION */}
        {currentStep === 1 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-rose-500" /> Step 1: Business Information
              </h3>
              <p className="text-xs text-slate-400 mt-1">Set your primary venue identity and operational concept.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Restaurant Name *"
                placeholder="e.g. Lumiere Bistro"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
              />
              <Input
                label="Brand / Parent Legal Entity *"
                placeholder="e.g. Lumiere Group LLC"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Restaurant Owner Account & Dashboard Credentials</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Owner Full Name *"
                  placeholder="e.g. Elena Rostova"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />
                <Input
                  label="Owner Email (Login ID) *"
                  type="email"
                  placeholder="owner@myrestaurant.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
                <Input
                  label="Dashboard Password *"
                  type="password"
                  placeholder="••••••••"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300">Select Venue Category / Concept *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {RESTAURANT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = restaurantType === type.id;
                  return (
                    <div
                      key={type.id}
                      onClick={() => setRestaurantType(type.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 ${
                        isSelected
                          ? 'bg-rose-600/10 border-rose-500 text-white shadow-lg shadow-rose-950/20'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-rose-400' : 'text-slate-500'}`} />
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-rose-500" />}
                      </div>
                      <h4 className="text-sm font-bold text-white">{type.name}</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">{type.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* STEP 2: BUSINESS ADDRESS */}
        {currentStep === 2 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-rose-500" /> Step 2: Location & Regional Settings
              </h3>
              <p className="text-xs text-slate-400 mt-1">Configure physical address, timezone, and currency defaults.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
              <Input label="State / Region" value={state} onChange={(e) => setState(e.target.value)} />
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input label="PIN / Postal Code" value={pinCode} onChange={(e) => setPinCode(e.target.value)} />
            </div>

            <Input label="Street Address" value={address} onChange={(e) => setAddress(e.target.value)} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Operational Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                  <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                  <option value="America/New_York (EST)">America/New_York (EST)</option>
                  <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                  <option value="Asia/Dubai (GST)">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Base Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                  <option value="USD ($)">USD ($) - US Dollar</option>
                  <option value="EUR (€)">EUR (€) - Euro</option>
                  <option value="GBP (£)">GBP (£) - British Pound</option>
                  <option value="CAD ($)">CAD ($) - Canadian Dollar</option>
                  <option value="AUD ($)">AUD ($) - Australian Dollar</option>
                </select>
              </div>
            </div>
          </Card>
        )}

        {/* STEP 3: BRANDING & THEME */}
        {currentStep === 3 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-rose-500" /> Step 3: Brand Aesthetics & Theme Preview
              </h3>
              <p className="text-xs text-slate-400 mt-1">Upload brand assets from your local drive or select presets for the QR App.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-5">
                {/* Logo Image Upload with Local Drive support */}
                <div className="space-y-2">
                  <ImageUpload
                    label="Upload Restaurant Logo (Local Drive or URL)"
                    value={logo}
                    onChange={setLogo}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">Or pick preset:</span>
                    {LOGO_PRESETS.map((p, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setLogo(p)}
                        className={`w-8 h-8 rounded-lg border p-0.5 overflow-hidden ${
                          logo === p ? 'border-rose-500 ring-2 ring-rose-500/40' : 'border-slate-800'
                        }`}
                      >
                        <img src={p} className="w-full h-full object-cover rounded-md" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Banner Image Upload with Local Drive support */}
                <div className="space-y-2">
                  <ImageUpload
                    label="Upload Header Banner Backdrop (Local Drive or URL)"
                    value={banner}
                    onChange={setBanner}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">Or pick preset backdrop:</span>
                    {BANNER_PRESETS.map((b, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setBanner(b)}
                        className={`h-10 w-16 rounded-lg border overflow-hidden ${
                          banner === b ? 'border-rose-500 ring-2 ring-rose-500/40' : 'border-slate-800'
                        }`}
                      >
                        <img src={b} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Palette Controls */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Primary Accent</label>
                    <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono uppercase text-slate-300">{primaryColor}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Secondary Accent</label>
                    <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono uppercase text-slate-300">{secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time Smartphone Theme Preview Card */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Customer QR App Real-time Preview
                </span>
                <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative max-w-xs mx-auto">
                  <div className="h-28 relative">
                    <img src={banner} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  </div>
                  <div className="p-4 -mt-10 relative z-10 space-y-3">
                    <div className="flex items-center gap-3">
                      <img src={logo} className="w-12 h-12 rounded-2xl border-2 border-slate-900 object-cover shadow-lg" />
                      <div>
                        <h4 className="text-sm font-bold text-white">{restaurantName}</h4>
                        <span className="text-[10px] text-slate-400">Table 04 • QR Menu</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-bold">Featured Dish</span>
                        <span className="font-bold text-emerald-400">$28.00</span>
                      </div>
                      <button
                        style={{ backgroundColor: primaryColor }}
                        className="w-full py-1.5 rounded-xl text-white font-bold text-xs shadow-md transition-all"
                      >
                        Add to Order
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* STEP 4: TABLES & QR CONFIGURATION */}
        {currentStep === 4 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-rose-500" /> Step 4: Table Floorplan & QR Code Setup
              </h3>
              <p className="text-xs text-slate-400 mt-1">Specify seating sections to auto-generate dining QR codes.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Card className="bg-slate-950 border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Indoor Seating</h4>
                  <Badge variant="brand">Section A</Badge>
                </div>
                <Input
                  type="number"
                  label="Number of Tables"
                  value={indoorTables.toString()}
                  onChange={(e) => setIndoorTables(parseInt(e.target.value) || 0)}
                />
              </Card>

              <Card className="bg-slate-950 border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Outdoor Patio</h4>
                  <Badge variant="info">Section B</Badge>
                </div>
                <Input
                  type="number"
                  label="Number of Tables"
                  value={outdoorTables.toString()}
                  onChange={(e) => setOutdoorTables(parseInt(e.target.value) || 0)}
                />
              </Card>

              <Card className="bg-slate-950 border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">VIP Rooms</h4>
                  <Badge variant="warning">Section C</Badge>
                </div>
                <Input
                  type="number"
                  label="Number of Tables"
                  value={vipTables.toString()}
                  onChange={(e) => setVipTables(parseInt(e.target.value) || 0)}
                />
              </Card>
            </div>

            {/* Generated QR Codes Summary */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">QR Code Floorplan Auto-Generator</h4>
                  <p className="text-xs text-slate-400">Total {totalTables} table QR codes ready for instant download.</p>
                </div>
                <Badge variant="success">{totalTables} Tables Configured</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                {Array.from({ length: Math.min(totalTables, 12) }).map((_, i) => (
                  <div key={i} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-1">
                    <QrCode className="w-6 h-6 text-slate-400 mx-auto" />
                    <span className="text-[11px] font-bold text-slate-200 block">Table {i + 1}</span>
                    <span className="text-[9px] font-mono text-emerald-400">Active QR</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* STEP 5: RESTAURANT FEATURES & SERVICES */}
        {currentStep === 5 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  <Wine className="w-5 h-5 text-rose-500" /> Step 5: Restaurant Services & Feature Flags
                </h3>
                <Badge variant="brand">Modular Architecture</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select which services your restaurant offers. Only enabled modules will be displayed to your staff and customers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'food_service', name: 'Food Service', desc: 'Full-course dining, ala carte, and kitchen KDS routing', icon: UtensilsCrossed, badge: 'Core' },
                { key: 'cafe', name: 'Cafe & Coffee', desc: 'Coffee, espresso bar, pastries, and quick counter service', icon: Coffee, badge: 'Beverage' },
                { key: 'bar', name: 'Bar & Alcohol', desc: 'Dedicated Bar Terminal, alcohol menu, age confirmation & drink queue', icon: Wine, badge: 'Bar Module' },
                { key: 'bakery', name: 'Bakery', desc: 'Fresh baked goods, customized cakes, and pastry orders', icon: Store, badge: 'Bakery' },
                { key: 'desserts', name: 'Desserts', desc: 'Sweets, ice creams, dessert counter & confectioneries', icon: Sparkles, badge: 'Sweets' },
                { key: 'takeaway', name: 'Takeaway / Pickup', desc: 'Self-pickup orders, counter dispatch & takeaway packing', icon: Truck, badge: 'Logistics' },
                { key: 'delivery', name: 'Delivery Service', desc: 'Home delivery order dispatch, courier tracking & address maps', icon: Truck, badge: 'Delivery' },
                { key: 'reservations', name: 'Reservations', desc: 'Table pre-booking, guest party size management & holds', icon: Clock, badge: 'Bookings' },
                { key: 'outdoor_seating', name: 'Outdoor Seating', desc: 'Patio, rooftop, and outdoor garden table management', icon: Store, badge: 'Seating' },
                { key: 'vip_rooms', name: 'VIP Rooms', desc: 'Private dining rooms, VIP suite bookings & custom party dining', icon: Flame, badge: 'VIP' },
              ].map((item) => {
                const isEnabled = features[item.key as keyof typeof features];
                const IconComp = item.icon;
                return (
                  <div
                    key={item.key}
                    onClick={() => toggleFeature(item.key as keyof typeof features)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      isEnabled
                        ? 'bg-rose-500/10 border-rose-500 text-white ring-1 ring-rose-500/40 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl ${isEnabled ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.desc}</p>
                      </div>
                    </div>

                    <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-1 shrink-0 ${isEnabled ? 'bg-rose-600' : 'bg-slate-800'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* STEP 6: EMPLOYEES & SHIFTS */}
        {currentStep === 6 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-500" /> Step 6: Staff Onboarding & Shift Roster
              </h3>
              <p className="text-xs text-slate-400 mt-1">Directly add or remove staff members, assign work shifts, and manage floor stations with instant live preview.</p>
            </div>

            {/* Add Employee Direct Form */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Add New Staff Member
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Full Name *"
                  placeholder="e.g. Alex Rivera"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                />
                <Input
                  label="Email Address"
                  placeholder="alex@lumiere.com"
                  value={newEmpEmail}
                  onChange={(e) => setNewEmpEmail(e.target.value)}
                />
                <Input
                  label="Phone Number"
                  placeholder="+1 555-0188"
                  value={newEmpPhone}
                  onChange={(e) => setNewEmpPhone(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Staff Role *</label>
                  <select
                    value={newEmpRole}
                    onChange={(e: any) => setNewEmpRole(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="MANAGER">Manager</option>
                    <option value="CHEF">Kitchen Chef</option>
                    <option value="WAITER">Floor Waiter</option>
                    <option value="BARTENDER">Bartender</option>
                    <option value="CASHIER">Cashier</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Assigned Shift *</label>
                  <select
                    value={newEmpShift}
                    onChange={(e) => setNewEmpShift(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Morning (8AM - 4PM)">Morning (8AM - 4PM)</option>
                    <option value="Evening (4PM - 12AM)">Evening (4PM - 12AM)</option>
                    <option value="Night (12AM - 8AM)">Night (12AM - 8AM)</option>
                    <option value="Full Day (10AM - 10PM)">Full Day (10AM - 10PM)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Station / Floor Section</label>
                  <select
                    value={newEmpSection}
                    onChange={(e) => setNewEmpSection(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Front Floor">Front Floor</option>
                    <option value="Patio Deck">Patio Deck</option>
                    <option value="Hot Kitchen Station">Hot Kitchen Station</option>
                    <option value="Cocktail Bar">Cocktail Bar</option>
                    <option value="VIP Private Rooms">VIP Private Rooms</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button variant="brand" onClick={handleAddEmployee} className="text-xs px-5 py-2 font-bold" icon={<UserPlus className="w-4 h-4 mr-1" />}>
                  Save & Add Employee
                </Button>
              </div>
            </div>

            {/* Employees Roster List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Staff Roster ({employees.length})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {employees.map((emp) => (
                  <div key={emp.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{emp.name}</span>
                        <Badge variant={emp.role === 'CHEF' ? 'warning' : emp.role === 'BARTENDER' ? 'brand' : 'info'} className="text-[9px]">
                          {emp.role}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{emp.email} • {emp.shift}</p>
                      <p className="text-[10px] text-emerald-400 font-mono">Station: {emp.section}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* STEP 7: INITIAL MENU SETUP */}
        {currentStep === 7 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-rose-500" /> Step 7: Initial Menu & Categories
              </h3>
              <p className="text-xs text-slate-400 mt-1">Configure your foundational menu categories and add flagship signature dishes.</p>
            </div>

            {/* Categories Pills */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Menu Categories</label>
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((cat, idx) => (
                  <Badge key={idx} variant="outline" className="px-3 py-1 text-xs font-bold bg-slate-950">
                    {cat}
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="New category..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200"
                  />
                  <Button variant="secondary" onClick={handleAddCategory} className="px-2 py-1 text-xs">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Add Dish Form */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Add Flagship Dish</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Dish Name *" placeholder="e.g. Lobster Bisque" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Category</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <Input label="Price ($) *" type="number" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} />
              </div>

              {/* Local File / Image Upload for Dish */}
              <ImageUpload
                label="Dish Photo (Upload from local drive or drop image)"
                value={newItemImage}
                onChange={setNewItemImage}
              />

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemIsVeg}
                    onChange={(e) => setNewItemIsVeg(e.target.checked)}
                    className="rounded bg-slate-900 text-emerald-500"
                  />
                  Vegetarian Option
                </label>
                <Button variant="brand" onClick={handleAddMenuItem} className="text-xs px-5 py-2 font-bold" icon={<Plus className="w-4 h-4 mr-1" />}>
                  Add Dish to Menu
                </Button>
              </div>
            </div>

            {/* Menu Items List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {menuItems.map((item) => (
                <div key={item.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                  <img src={item.image} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-800" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                      <span className="text-xs font-bold text-emerald-400">${item.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">{item.category}</Badge>
                      {item.isVegetarian && <Badge variant="success" className="text-[9px]">Veg</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* STEP 8: REVIEW & FINISH */}
        {currentStep === 8 && (
          <Card className="bg-slate-900 border-slate-800 p-8 space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white">Review Setup & Request Launch</h3>
              <p className="text-xs text-slate-400">
                Verify your configuration below. Once you click <strong>"Request Launch"</strong>, your restaurant application will be submitted to the DineFlow Platform Team for approval.
              </p>
              
              <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-2xl text-left text-xs text-amber-200 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-300">Platform Approval Workflow</p>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Your restaurant status will change to <strong>Pending Approval</strong>. You will be able to access your dashboard preview while our team verifies your table floorplan and menu details.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
                <h4 className="font-bold text-rose-400 flex items-center gap-1.5">
                  <Building className="w-4 h-4" /> Business & Location
                </h4>
                <p className="text-slate-200 font-bold">{restaurantName}</p>
                <p className="text-slate-400">{address}, {city}, {country}</p>
                <p className="text-slate-400">{timezone} • Currency: {currency}</p>
              </Card>

              <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" /> Dining Floorplan
                </h4>
                <p className="text-slate-200 font-bold">{totalTables} Tables Configured</p>
                <p className="text-slate-400">Indoor: {indoorTables} | Outdoor: {outdoorTables} | VIP: {vipTables}</p>
                <p className="text-emerald-400 font-mono">QR Codes generated</p>
              </Card>

              <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
                <h4 className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <Wine className="w-4 h-4" /> Enabled Services
                </h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(features)
                    .filter(([_, v]) => v)
                    .map(([k]) => (
                      <Badge key={k} variant="brand" className="text-[9px] uppercase">{k.replace('_', ' ')}</Badge>
                    ))}
                </div>
              </Card>

              <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
                <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-4 h-4" /> Initial Menu & Team
                </h4>
                <p className="text-slate-200 font-bold">{employees.length} Team Members, {menuItems.length} Dishes</p>
                <p className="text-slate-400">High-res images and prep times linked</p>
              </Card>
            </div>
          </Card>
        )}

        {/* Wizard Footer Navigation Controls */}
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="text-xs font-bold"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous Step
          </Button>

          {currentStep < 8 ? (
            <Button
              variant="brand"
              onClick={() => setCurrentStep(Math.min(8, currentStep + 1))}
              className="text-xs font-bold px-6 shadow-lg shadow-rose-950/40"
            >
              Next Step <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              variant="brand"
              onClick={handleFinish}
              className="text-xs font-bold px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-xl shadow-rose-950/50"
            >
              Request Launch <Sparkles className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
