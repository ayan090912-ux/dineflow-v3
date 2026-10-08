import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  Grid,
  UtensilsCrossed,
  Users,
  Package,
  Palette,
  Settings as SettingsIcon,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  AlertTriangle,
  QrCode,
  Flame,
  DollarSign,
  Coffee,
  Sparkles,
  PhoneCall,
  Receipt,
  Printer,
  Download,
  Eye,
  Edit,
  Save,
  Copy,
  RotateCcw,
  Edit3,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Unlock,
  Check,
  Building2,
  ChevronDown,
  GitBranch,
  MapPin,
  Store,
  Layers,
  Calendar,
  History,
  UserCheck,
  Link,
  Unlink,
  Phone,
  Wine,
  Utensils,
  LogOut,
  Truck,
  Search,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
  Table as DataTable,
  Modal,
  Tabs,
  StatsCard,
  QRCodeDisplay,
  printQRCodeCard,
  Avatar,
  SearchInput,
  ImageUpload,
  ToastContainer,
  ToastMessage,
  DinelyLogo,
  LoadingScreen,
} from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { CURRENCY_OPTIONS, getCurrencySymbol, formatCurrency } from '../../packages/utils/currency';
import { api } from '../../packages/api/client';
import { getRestaurantCustomerUrl, getRestaurantPublicDomain, getTenantUrl } from '../../packages/utils/tenantResolver';
import { Order, MenuItem, Table, Employee, InventoryItem, Supplier, OrderStatus, MenuCategory, BarCategory, TableSession, BusinessDay, getFulfillmentStation, Bill, PaymentMethod } from '../../packages/types';
import { KitchenETADashboard } from './KitchenETADashboard';
import { WaiterTerminalOS } from '../waiter/WaiterTerminalOS';
import { BarTerminal } from '../bar/BarTerminal';
import { realtimeBus } from '../../packages/api/realtime';
import { downloadDigitalReceiptPNG } from '../../packages/utils/receiptDownloader';
import { TaxManagement } from './TaxManagement';
import { OwnerBillingSettings } from './OwnerBillingSettings';
import { WorkspaceSettingsTab } from './WorkspaceSettingsTab';
import { DayManagementView } from './DayManagementView';
import { isModuleEnabled } from '../../packages/types';
import { firebaseAuth } from '../../packages/auth/firebase';

interface RestaurantAppProps {
  activeRestaurant?: any;
  onEditSetup?: () => void;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

export const RestaurantApp: React.FC<RestaurantAppProps> = ({
  activeRestaurant,
  onEditSetup,
  onLogout,
  onNavigate,
}) => {
  const { theme, updateThemeColor, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'kitchen' | 'bar' | 'tables' | 'menu' | 'staff' | 'inventory' | 'billing' | 'theme' | 'waiter' | 'qr_pickup' | 'business_day' | 'day_management' | 'workspace_settings'>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      if (p.includes('/menu')) return 'menu';
      if (p.includes('/floorplan') || p.includes('/tables')) return 'tables';
      if (p.includes('/staff') || p.includes('/employees')) return 'staff';
      if (p.includes('/inventory')) return 'inventory';
      if (p.includes('/billing')) return 'billing';
      if (p.includes('/orders')) return 'orders';
      if (p.includes('/theme')) return 'theme';
      if (p.includes('/waiter')) return 'waiter';
      if (p.includes('/kitchen')) return 'kitchen';
      if (p.includes('/bar')) return 'bar';
      if (p.includes('/day-management') || p.includes('/daily-closing') || p.includes('/day') || p.includes('/closing')) return 'day_management';
      if (p.includes('/workspace_settings') || p.includes('/settings')) return 'workspace_settings';
    }
    return 'dashboard';
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBillDetails, setSelectedBillDetails] = useState<Bill | null>(null);
  const [paymentBillModal, setPaymentBillModal] = useState<Bill | null>(null);
  const [paymentMethodInput, setPaymentMethodInput] = useState<PaymentMethod>('CASH');
  const [paymentRefInput, setPaymentRefInput] = useState<string>('');
  const [paymentVerifiedByInput, setPaymentVerifiedByInput] = useState<string>('Manager / Cashier');
  const [settlingBillId, setSettlingBillId] = useState<string | null>(null);
  const [billingSearchQuery, setBillingSearchQuery] = useState('');
  const [billingStatusFilter, setBillingStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'CANCELLED'>('ALL');
  const [billingPaymentFilter, setBillingPaymentFilter] = useState<'ALL' | 'CASH' | 'CARD' | 'UPI'>('ALL');
  const [billingSubTab, setBillingSubTab] = useState<'terminal' | 'invoices' | 'taxes' | 'settings'>('terminal');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const recentToastKeys = useRef<Map<string, number>>(new Map());

  const addToast = (type: 'info' | 'success' | 'warning' | 'error' | 'danger', title: string, message?: string) => {
    const key = `${type}:${title}:${message || ''}`;
    const now = Date.now();
    const lastTime = recentToastKeys.current.get(key) || 0;
    if (now - lastTime < 3500) {
      return; // Deduplicate burst notifications
    }
    recentToastKeys.current.set(key, now);

    const id = `toast-${now}-${Math.random().toString(36).substr(2, 9)}`;
    const normalizedType: 'info' | 'success' | 'warning' | 'error' = type === 'danger' ? 'error' : (type as any);
    setToasts((prev) => [...prev.slice(-4), { id, type: normalizedType, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };


  // Category Management State
  const [foodCategories, setFoodCategories] = useState<MenuCategory[]>([]);
  const [barCategories, setBarCategories] = useState<BarCategory[]>([]);
  const [isManageCategoriesModalOpen, setIsManageCategoriesModalOpen] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState<'FOOD' | 'BAR'>('FOOD');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<{ id: string; name: string; type: 'FOOD' | 'BAR' } | null>(null);

  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    isVegetarian: true,
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
  });

  // Menu Search, Filter, Edit & Delete State
  const [menuCatalogMode, setMenuCatalogMode] = useState<'FOOD' | 'BAR'>('FOOD');
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');

  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);

  const handleDuplicateItem = async (itemId: string) => {
    try {
      const dup = await api.duplicateMenuItem(itemId);
      if (dup) {
        addToast('success', 'Item Duplicated ✨', `Created copy: ${dup.name}`);
        await loadData();
      }
    } catch (err) {
      console.error('Failed to duplicate item:', err);
    }
  };

  const handleBulkImportBarDrinks = async () => {
    if (!currentRestaurant) return;
    const defaultCraftDrinks = [
      { name: 'Smoked Bourbon Old Fashioned', categoryId: 'Cocktails', price: 18.5, brand: 'Woodford Reserve', alcoholPercentage: 45, bottleSize: '750ml', servingSize: '60ml Peg', description: 'Aged Kentucky bourbon, Angostura bitters & smoked oak rosemary.' },
      { name: 'Empress Botanical Gin Fizz', categoryId: 'Cocktails', price: 16.0, brand: 'Empress 1908', alcoholPercentage: 42.5, bottleSize: '750ml', servingSize: 'Highball', description: 'Empress 1908 indigo gin, fresh yuzu & elderflower liqueur.' },
      { name: 'Patrón Añejo Tequila Shot', categoryId: 'Shots', price: 12.0, brand: 'Patrón', alcoholPercentage: 40, bottleSize: '750ml', servingSize: '30ml Shot', description: 'Oak barrel aged 100% blue Weber agave tequila shot with lime salt.' },
      { name: 'Dom Pérignon Vintage Champagne 2012', categoryId: 'Champagne', price: 280.0, brand: 'Dom Pérignon', alcoholPercentage: 12.5, bottleSize: '750ml Bottle', servingSize: 'Flute Glass', description: 'Prestige cuvée champagne with white peach, mint & toasted brioche notes.' },
      { name: 'Macallan 18 Sherry Oak Single Malt', categoryId: 'Whiskey', price: 42.0, brand: 'Macallan', alcoholPercentage: 43, bottleSize: '750ml', servingSize: '60ml Neat', description: 'Single malt Scotch whisky matured in hand-crafted sherry seasoned oak casks.' },
      { name: 'Belvedere Intense Vodka', categoryId: 'Vodka', price: 15.0, brand: 'Belvedere', alcoholPercentage: 40, bottleSize: '1L', servingSize: '60ml Peg', description: 'Quintuple distilled Polish rye vodka with vanilla & black pepper finish.' },
      { name: 'Craft Hazy Double IPA', categoryId: 'Beer', price: 9.5, brand: 'Hazy Brew Co', alcoholPercentage: 8.2, bottleSize: '500ml', servingSize: 'Draft Pint', description: 'Unfiltered double dry-hopped IPA with tropical fruit aroma.' },
    ];
    await api.bulkImportBarMenuItems(currentRestaurant.id, defaultCraftDrinks as any);
    addToast('success', 'Bulk Craft Drinks Imported 🍹', 'Added 7 premium bar catalog drinks.');
    await loadData();
  };

  // Staff Management State
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    username: '',
    role: 'WAITER' as Employee['role'],
    terminal: 'WAITER-01',
    email: '',
    phone: '',
    shift: 'Evening (4PM - 12AM)',
    assignedSection: 'Front Floor & POS',
    hourlyRate: '18.50',
  });
  const [newStaffPassword, setNewStaffPassword] = useState('');

  // Edit & Reset Password Staff State
  const [editingStaff, setEditingStaff] = useState<Employee | null>(null);
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState(false);
  const [resetPassStaff, setResetPassStaff] = useState<Employee | null>(null);
  const [generatedPass, setGeneratedPass] = useState('');
  const [isResetPassModalOpen, setIsResetPassModalOpen] = useState(false);

  // Inventory & Raw Material State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventorySubTab, setInventorySubTab] = useState<'ALL' | 'KITCHEN' | 'BAR' | 'SUPPLIERS'>('ALL');
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    supplyCategory: 'Dairy & Cheese',
    address: '',
    notes: '',
  });

  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);
  const [newInventory, setNewInventory] = useState({
    name: '',
    category: 'Meat & Poultry',
    station: 'KITCHEN' as 'KITCHEN' | 'BAR',
    quantity: '25',
    unit: 'kg',
    minThreshold: '5',
    costPerUnit: '12.00',
    supplierId: '',
    supplierName: 'Prime Choice Foods',
    supplierContact: '+1 800-555-0199',
    storageLocation: 'Cold Storage #1',
  });

  const [selectedTableQR, setSelectedTableQR] = useState<Table | null>(null);

  // Table Management & Reservation State
  const [selectedFloorplanSection, setSelectedFloorplanSection] = useState<string>('ALL');
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [newTableData, setNewTableData] = useState({
    tableNumber: '',
    capacity: '4',
    section: 'Main Hall',
    shape: 'RECTANGLE' as 'SQUARE' | 'ROUND' | 'RECTANGLE',
    isVip: false,
  });

  const [isEditTableModalOpen, setIsEditTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);

  const [isMergeTablesModalOpen, setIsMergeTablesModalOpen] = useState(false);
  const [selectedTableIdsForMerge, setSelectedTableIdsForMerge] = useState<string[]>([]);
  const [customMergeLabel, setCustomMergeLabel] = useState('');

  const [isReserveTableModalOpen, setIsReserveTableModalOpen] = useState(false);
  const [tableToReserve, setTableToReserve] = useState<Table | null>(null);
  const [reservationForm, setReservationForm] = useState({
    reservedForName: '',
    reservedForPhone: '',
    reservationTime: '7:30 PM',
    partySize: '4',
    notes: '',
  });

  const [currentRestaurant, setCurrentRestaurant] = useState<any>(activeRestaurant || null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewState, setViewState] = useState<'INITIALIZING' | 'LOADING' | 'READY' | 'ERROR'>(
    activeRestaurant ? 'READY' : 'INITIALIZING'
  );
  const [viewError, setViewError] = useState<string>('');
  const [activeSessions, setActiveSessions] = useState<TableSession[]>([]);

  useEffect(() => {
    if (activeRestaurant) {
      api.switchActiveRestaurant(activeRestaurant.id).catch(() => {});
      if (!currentRestaurant || currentRestaurant.id !== activeRestaurant.id) {
        setCurrentRestaurant(activeRestaurant);
        if (activeRestaurant.theme) {
          setTheme({
            restaurantId: activeRestaurant.id,
            restaurantName: activeRestaurant.name,
            logo: activeRestaurant.theme.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
            bannerUrl: activeRestaurant.theme.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
            primaryColor: activeRestaurant.theme.primaryColor || '#e11d48',
            secondaryColor: activeRestaurant.theme.secondaryColor || '#475569',
            accentColor: '#f59e0b',
            backgroundColor: '#f8fafc',
            textColor: '#0f172a',
            fontFamily: 'sans',
            borderRadius: 'lg',
            currency: activeRestaurant.theme.currency || activeRestaurant.currency || 'INR (₹)',
          });
        }
      }
    }
  }, [activeRestaurant]);

  // Business Day & Daily Closing State
  const [currentBusinessDay, setCurrentBusinessDay] = useState<BusinessDay | null>(null);
  const [businessDayHistory, setBusinessDayHistory] = useState<BusinessDay[]>([]);
  const [isCloseDayModalOpen, setIsCloseDayModalOpen] = useState(false);
  const [isClosingDayLoading, setIsClosingDayLoading] = useState(false);
  const [dayClosePrecheck, setDayClosePrecheck] = useState<any>(null);
  const [dayCloseStage, setDayCloseStage] = useState<'IDLE' | 'CLOSING' | 'RESETTING' | 'READY'>('IDLE');

  useEffect(() => {
    if (isCloseDayModalOpen) {
      setDayCloseStage('IDLE');
      const restId = activeRestaurant?.id || currentRestaurant?.id || api.getCurrentRestaurantId();
      if (restId) {
        api.getBusinessDayPrecheck(restId).then(setDayClosePrecheck).catch(() => {});
      }
    }
  }, [isCloseDayModalOpen, activeRestaurant?.id, currentRestaurant?.id]);



  // Multi-Restaurant & Branch Outlet State
  const [allMyRestaurants, setAllMyRestaurants] = useState<any[]>([]);
  const [isOutletModalOpen, setIsOutletModalOpen] = useState(false);
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [newBranchData, setNewBranchData] = useState({
    name: '',
    branchName: '',
    city: 'San Francisco',
    address: '',
    phone: '',
    cuisine: 'Modern Fusion',
  });

  const isBarEnabled = currentRestaurant?.hasBar === true || currentRestaurant?.businessType === 'BAR';
  const activeCatalogMode = isBarEnabled ? menuCatalogMode : 'FOOD';

  const filteredMenuItems = menuItems.filter((item) => {
    const isBarItem = item.targetDestination === 'BAR' || item.isAlcoholic || (item.barCategory !== undefined && item.barCategory !== null);
    if (activeCatalogMode === 'BAR' && !isBarItem) return false;
    if (activeCatalogMode === 'FOOD' && isBarItem) return false;

    const foodCatObj = foodCategories.find((c) => c.id === item.categoryId || c.name === item.categoryId);
    const matchesCategory =
      selectedMenuCategory === 'ALL' ||
      item.categoryId === selectedMenuCategory ||
      (foodCatObj && (foodCatObj.name === selectedMenuCategory || foodCatObj.id === selectedMenuCategory)) ||
      item.barCategory === selectedMenuCategory;

    const isVeg = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
    const matchesDietary =
      dietaryFilter === 'ALL' ||
      (dietaryFilter === 'VEG' && isVeg) ||
      (dietaryFilter === 'NON_VEG' && !isVeg);

    const query = menuSearchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.brand && item.brand.toLowerCase().includes(query)) ||
      item.price.toString().includes(query);

    return matchesCategory && matchesDietary && matchesSearch;
  });

  const handleSwitchRestaurant = async (restId: string) => {
    let targetRest = allMyRestaurants.find((r) => r.id === restId);
    if (!targetRest) {
      targetRest = (await api.getRestaurantDetails(restId).catch(() => null)) || null;
    }
    if (targetRest) {
      await api.switchActiveRestaurant(restId);
      const targetUrl = getTenantUrl(targetRest, '/restaurant/dashboard');
      window.location.href = targetUrl;
    } else {
      await api.switchActiveRestaurant(restId);
      await loadData();
      setIsOutletModalOpen(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchData.name) {
      addToast('error', 'Validation Failed', 'Outlet name is required.');
      return;
    }
    const created = await api.createNewBranchOutlet({
      name: newBranchData.name,
      branchName: newBranchData.branchName || `${newBranchData.city || 'Branch'} Outlet`,
      city: newBranchData.city,
      address: newBranchData.address,
      phone: newBranchData.phone,
      cuisine: newBranchData.cuisine,
    });
    addToast('success', 'New Restaurant Branch Created! 🎉', `${created.name} added to your multi-tenant portfolio.`);
    setIsAddBranchModalOpen(false);
    setIsOutletModalOpen(false);
    setNewBranchData({
      name: '',
      branchName: '',
      city: 'San Francisco',
      address: '',
      phone: '',
      cuisine: 'Modern Fusion',
    });
    await loadData();
  };

  // Table CRUD, Merge, and Reservation Handlers
  const handleCreateTable = async () => {
    if (!newTableData.tableNumber.trim()) {
      addToast('error', 'Validation Error', 'Table Number is required.');
      return;
    }
    setIsCreatingTable(true);
    try {
      const created = await api.createTable({
        restaurantId: currentRestaurant?.id || api.getCurrentRestaurantId() || '',
        tableNumber: newTableData.tableNumber,
        capacity: parseInt(newTableData.capacity) || 4,
        section: newTableData.section,
        shape: newTableData.shape,
        isVip: newTableData.isVip,
      });
      if (created) {
        setTables((prev) => [...prev.filter((t) => t.id !== created.id), created]);
        addToast('success', 'Created ✓', `${newTableData.tableNumber} added to ${newTableData.section}.`);
        setIsCreateTableModalOpen(false);
        setNewTableData({
          tableNumber: '',
          capacity: '4',
          section: 'Main Hall',
          shape: 'RECTANGLE',
          isVip: false,
        });
      } else {
        addToast('error', 'Table Creation Failed', 'Could not create table. Please check network connection.');
      }
    } catch (e: any) {
      addToast('error', 'Table Creation Error', e?.message || 'Failed to create table.');
    } finally {
      setIsCreatingTable(false);
    }
  };

  const handleUpdateTableDetails = async () => {
    if (!editingTable) return;
    await api.updateTable(editingTable.id, {
      tableNumber: editingTable.tableNumber,
      capacity: editingTable.capacity,
      section: editingTable.section,
      shape: editingTable.shape,
      isVip: editingTable.isVip,
    });
    setTables((prev) =>
      prev.map((t) => (t.id === editingTable.id ? { ...t, ...editingTable } : t))
    );
    addToast('success', 'Table Updated! 📝', `${editingTable.tableNumber} updated successfully.`);
    setIsEditTableModalOpen(false);
    setEditingTable(null);
  };

  const handleDeleteTable = async (tableId: string, tableNumber: string) => {
    if (confirm(`Are you sure you want to remove ${tableNumber} from floor plan?`)) {
      await api.deleteTable(tableId);
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      addToast('success', 'Table Removed 🗑️', `${tableNumber} deleted.`);
    }
  };

  const handleMergeTables = async () => {
    if (selectedTableIdsForMerge.length < 2) {
      addToast('error', 'Merge Failed', 'Please select at least 2 tables to merge.');
      return;
    }
    await api.mergeTables(selectedTableIdsForMerge, customMergeLabel);
    setTables((prev) =>
      prev.map((t) => (selectedTableIdsForMerge.includes(t.id) ? { ...t, isMerged: true, groupLabel: customMergeLabel } : t))
    );
    addToast('success', 'Tables Merged Successfully! 🔗', 'Kitchen, Waiters, and Staff notified.');
    setIsMergeTablesModalOpen(false);
    setSelectedTableIdsForMerge([]);
    setCustomMergeLabel('');
  };

  const handleUnmergeTables = async (tableIds: string[]) => {
    await api.unmergeTables(tableIds);
    setTables((prev) =>
      prev.map((t) => (tableIds.includes(t.id) ? { ...t, isMerged: false, groupLabel: undefined } : t))
    );
    addToast('success', 'Tables Unmerged 🔓', 'Tables split back into individual seats.');
  };

  const handleReserveTable = async () => {
    if (!tableToReserve) return;
    if (!reservationForm.reservedForName.trim()) {
      addToast('error', 'Validation Error', 'Guest name is required.');
      return;
    }
    await api.reserveTable(tableToReserve.id, {
      reservedForName: reservationForm.reservedForName,
      reservedForPhone: reservationForm.reservedForPhone,
      reservationTime: reservationForm.reservationTime,
      partySize: parseInt(reservationForm.partySize) || 4,
      notes: reservationForm.notes,
    });
    setTables((prev) =>
      prev.map((t) =>
        t.id === tableToReserve.id
          ? {
              ...t,
              status: 'RESERVED',
              isReserved: true,
              reservedForName: reservationForm.reservedForName,
              reservedForPhone: reservationForm.reservedForPhone,
              reservationTime: reservationForm.reservationTime,
            }
          : t
      )
    );
    addToast('success', 'Table Reserved! 🔒', `${tableToReserve.tableNumber} reserved for ${reservationForm.reservedForName}.`);
    setIsReserveTableModalOpen(false);
    setTableToReserve(null);
    setReservationForm({
      reservedForName: '',
      reservedForPhone: '',
      reservationTime: '7:30 PM',
      partySize: '4',
      notes: '',
    });
  };

  const handleCancelReservation = async (tableId: string, tableNumber: string) => {
    await api.cancelTableReservation(tableId);
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status: 'AVAILABLE', isReserved: false, reservedForName: undefined } : t))
    );
    addToast('info', 'Reservation Cancelled 🔓', `${tableNumber} is now available.`);
  };

  const handleCheckInGuest = async (tableId: string, tableNumber: string, guestName: string) => {
    await api.checkInReservedTable(tableId);
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, status: 'OCCUPIED', isOccupied: true, isReserved: false } : t))
    );
    addToast('success', 'Guest Seated! 🎉', `${guestName} checked in at ${tableNumber}.`);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      if (p === '/workspace' || p.startsWith('/workspace/')) {
        window.history.replaceState(null, '', '/restaurant/dashboard');
      }
    }

    const restId = activeRestaurant?.id || currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    if (restId) {
      realtimeBus.connect(restId, 'OWNER');
    }

    loadData();

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (event.type === 'order_created' || event.type === 'OrderCreated') {
        addToast('info', 'New Customer Order Received! 🛎️', `Table ${event.tableNumber || 'Guest'} placed an order`);
        const tblNum = (event as any).tableNumber || (event as any).table_number;
        const tblId = (event as any).tableId || (event as any).table_id;
        const sessId = (event as any).tableSessionId || (event as any).table_session_id;
        if (tblNum || tblId) {
          setTables((prev) =>
            prev.map((t) =>
              (tblId && t.id === tblId) || (tblNum && (t.tableNumber === tblNum || (t as any).number === tblNum))
                ? { ...t, status: 'OCCUPIED', isOccupied: true, activeSessionId: sessId || t.activeSessionId }
                : t
            )
          );
        }
        api.getOrders(restId).then(setOrders).catch(() => {});
        api.getActiveTableSessions(restId).then((sess) => setActiveSessions(sess || [])).catch(() => {});
        api.getTables(restId).then((tbls) => {
          if (tbls && tbls.length > 0) setTables(tbls);
        }).catch(() => {});
      } else if (
        event.type === 'table_updated' ||
        event.type === 'table_status_updated' ||
        event.type === 'TableStatusUpdated' ||
        event.type === 'TableStatusChanged'
      ) {
        const tblNum = (event as any).tableNumber || (event as any).table_number;
        const tblId = (event as any).tableId || (event as any).table_id;
        const isOcc = (event as any).isOccupied ?? (event as any).is_occupied ?? ((event as any).status === 'OCCUPIED');
        const st = (event as any).status || (isOcc ? 'OCCUPIED' : 'AVAILABLE');
        const sessId = (event as any).tableSessionId || (event as any).table_session_id;
        if (tblNum || tblId) {
          setTables((prev) =>
            prev.map((t) =>
              (tblId && t.id === tblId) || (tblNum && (t.tableNumber === tblNum || (t as any).number === tblNum))
                ? { ...t, status: st, isOccupied: isOcc, activeSessionId: sessId || t.activeSessionId }
                : t
            )
          );
        }
        api.getActiveTableSessions(restId).then((sess) => setActiveSessions(sess || [])).catch(() => {});
        api.getTables(restId).then((tbls) => {
          if (tbls && tbls.length > 0) setTables(tbls);
        }).catch(() => {});
      } else if (
        event.type === 'order_status_updated' ||
        event.type === 'order_ready' ||
        event.type === 'order_delivered' ||
        event.type === 'OrderDelivered' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'KitchenStatusUpdated' ||
        event.type === 'BarStatusUpdated'
      ) {
        api.getOrders(restId).then(setOrders).catch(() => {});
      } else if (event.type === 'service_request_created' || event.type === 'WaiterCalled') {
        addToast('warning', 'Waiter Assistance Call 🔔', `Table ${event.tableNumber || 'Guest'} requested support.`);
      } else if (event.type === 'table_session_closed' || event.type === 'TableSessionClosed') {
        const tblNum = (event as any).tableNumber || '';
        const sessId = (event as any).tableSessionId || (event as any).sessionId;
        addToast('info', 'Table Session Closed 🧹', `Table ${tblNum} session ended and set to VACANT.`);
        if (sessId) {
          setActiveSessions((prev) => prev.filter((s) => s.id !== sessId));
        }
        setTables((prev) =>
          prev.map((t) => (t.tableNumber === tblNum || (t as any).number === tblNum ? { ...t, status: 'AVAILABLE', isOccupied: false } : t))
        );
      } else if (event.type === 'BillRequested') {
        // Routine bill requests are handled by Waiter floor staff; silently refresh bills list for owner reports
        api.getBills(restId).then((b) => setBills(b || [])).catch(() => {});
      } else if (
        event.type === 'BillPaid' ||
        event.type === 'payment_updated' ||
        event.type === 'payment_status_updated' ||
        event.type === 'BillPaymentRecorded'
      ) {
        const payloadData = (event as any).payload || event;
        const paidBillId = payloadData.billId || payloadData.bill_id;
        const newStatus = payloadData.paymentStatus || payloadData.payment_status || 'PAID';
        if (paidBillId) {
          setBills((prev) =>
            prev.map((b) => (b.id === paidBillId ? { ...b, paymentStatus: newStatus, status: newStatus === 'PAID' ? 'CLOSED' : b.status } : b))
          );
        }
        api.getBills(restId).then((b) => setBills(b || [])).catch(() => {});
        addToast('success', 'Payment Received 💰', `Bill payment updated: ₹${payloadData.amount || payloadData.grandTotal || ''} (${newStatus})`);
      } else if (event.type === 'ETAUpdated') {
        addToast('info', 'ETA Adjusted ⏱️', `Order #${event.orderId} ETA set to ${event.estimatedPrepTimeMinutes}m`);
        setOrders((prev) =>
          prev.map((o) =>
            o.id === event.orderId
              ? {
                  ...o,
                  estimatedPrepTimeMinutes: event.estimatedPrepTimeMinutes,
                  etaTargetTimestamp: event.etaTargetTimestamp,
                }
              : o
          )
        );
      } else if (event.type === 'BusinessDayClosed' || event.type === 'DayClosed') {
        addToast('warning', 'Business Day Closed 🌅', 'Daily closing summary archived in history.');
        api.invalidateQueryCache('tables');
        api.invalidateQueryCache('active-sessions');
        setActiveSessions([]);
        setTables((prev) =>
          prev.map((t) => ({
            ...t,
            status: 'AVAILABLE',
            isOccupied: false,
            activeSessionId: undefined,
          }))
        );
        api.getCurrentBusinessDay(restId).then(setCurrentBusinessDay).catch(() => {});
        api.getBusinessDayHistory(restId).then(setBusinessDayHistory).catch(() => {});
        api.getOrders(restId).then(setOrders).catch(() => {});
      } else if (event.type === 'BusinessDayOpened' || event.type === 'DayOpened') {
        addToast('success', 'New Business Day Opened ☀️', 'Now recording orders for new business day.');
        api.getCurrentBusinessDay(restId).then(setCurrentBusinessDay).catch(() => {});
      } else if (event.type === 'StaffStatusUpdated') {
        if (event.status === 'ON_CLOCK') {
          addToast('success', 'Staff Member Online 🟢', `${event.name} (${event.role}) logged in and is now ACTIVE in app.`);
        } else {
          addToast('info', 'Staff Member Offline ⚪', `${event.name} logged out.`);
        }
        setEmployees((prev) =>
          prev.map((emp) => (emp.id === event.employeeId || emp.name === event.name ? { ...emp, isClockedIn: event.status === 'ON_CLOCK' } : emp))
        );
      } else if (event.type === 'RESTAURANT_APPROVED' || event.type === 'RestaurantStatusUpdated') {
        const evtRestId = event.restaurantId || (event as any).restaurant_id;
        if (!restId || !evtRestId || evtRestId === restId) {
          api.getRestaurantDetails(restId).then((updatedRest) => {
            if (updatedRest) {
              setCurrentRestaurant(updatedRest);
              addToast('success', 'Restaurant Status Updated', `Status is now ${updatedRest.lifecycleStatus}`);
            }
          }).catch(() => {});
        }
      } else if (event.type === 'WorkspaceConfigUpdated') {
        const evtRestId = event.restaurantId || (event as any).restaurant_id;
        if (!restId || !evtRestId || String(evtRestId).toLowerCase() === String(restId).toLowerCase()) {
          setCurrentRestaurant((prev: any) => ({
            ...prev,
            enabledModules: event.enabledModules || prev?.enabledModules,
            hasKitchen: event.hasKitchen !== undefined ? event.hasKitchen : prev?.hasKitchen,
            hasWaiter: event.hasWaiter !== undefined ? event.hasWaiter : prev?.hasWaiter,
            hasBar: event.hasBar !== undefined ? event.hasBar : prev?.hasBar,
            hasInventory: event.hasInventory !== undefined ? event.hasInventory : prev?.hasInventory,
            hasBilling: event.hasBilling !== undefined ? event.hasBilling : prev?.hasBilling,
            hasTables: event.hasTables !== undefined ? event.hasTables : prev?.hasTables,
          }));
          addToast('info', 'Workspace Updated', 'Restaurant operational terminal configuration was updated.');
        }
      } else if (event.type === 'RECONNECTED') {
        loadData(false);
      }
    });

    // Gentle fallback sync every 60 seconds (replaces destructive 5s full-reload loop)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        api.getOrders(restId).then(setOrders).catch(() => {});
        api.getActiveTableSessions(restId).then((s) => setActiveSessions(s || [])).catch(() => {});
      }
    }, 60000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [activeRestaurant?.id, currentRestaurant?.id]);


  const loadData = useCallback(async (forceLoading = false) => {
    const targetRestId = activeRestaurant?.id || currentRestaurant?.id || api.getCurrentRestaurantId();
    if (!targetRestId) {
      setViewState('ERROR');
      setViewError('No active restaurant selected. Please return to workspace and select your restaurant.');
      return;
    }

    if (forceLoading || (!activeRestaurant && !currentRestaurant)) {
      setViewState('LOADING');
    }
    setViewError('');
    try {
      const user = api.getCurrentUser();
      const rest = (await api.getRestaurantDetails(targetRestId).catch(() => null)) || activeRestaurant || currentRestaurant;
      if (!rest) {
        setViewState('ERROR');
        setViewError(`Restaurant "${targetRestId}" could not be loaded or was not found.`);
        return;
      }

      const ownerRests = await api.getOwnerRestaurants().catch(() => []);
      setCurrentUser(user);
      setCurrentRestaurant(rest);
      setAllMyRestaurants(ownerRests);

      if (rest?.theme) {
        setTheme({
          restaurantId: rest.id,
          restaurantName: rest.name,
          logo: rest.theme.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
          bannerUrl: rest.theme.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
          primaryColor: rest.theme.primaryColor || '#e11d48',
          secondaryColor: rest.theme.secondaryColor || '#475569',
          accentColor: '#f59e0b',
          backgroundColor: '#f8fafc',
          textColor: '#0f172a',
          fontFamily: 'sans',
          borderRadius: 'lg',
          currency: rest.theme.currency || rest.currency || 'INR (₹)',
        });
      }

      let menuLoadErr: string | null = null;
      const [o, m, t, e, i, sup, fc, bc, bDay, bHistory, activeSess, bList] = await Promise.all([
        api.getOrders(rest.id).catch((err) => { console.error('[Orders] Load error:', err); return []; }),
        api.getMenuItems(rest.id).catch((err) => {
          console.error('[Menu] Load error:', err);
          menuLoadErr = err?.message || 'Failed to load menu items';
          return [];
        }),
        api.getTables(rest.id).catch((err) => { console.error('[Tables] Load error:', err); return []; }),
        api.getEmployees(rest.id).catch((err) => { console.error('[Employees] Load error:', err); return []; }),
        api.getInventory(rest.id).catch((err) => { console.error('[Inventory] Load error:', err); return []; }),
        api.getSuppliers(rest.id).catch((err) => { console.error('[Suppliers] Load error:', err); return []; }),
        api.getCategories(rest.id).catch((err) => { console.error('[Categories] Load error:', err); return []; }),
        api.getBarCategories(rest.id).catch((err) => { console.error('[BarCats] Load error:', err); return []; }),
        api.getCurrentBusinessDay(rest.id).catch(() => null),
        api.getBusinessDayHistory(rest.id).catch(() => []),
        api.getActiveTableSessions(rest.id).catch(() => []),
        api.getBills(rest.id).catch(() => []),
      ]);

      if (menuLoadErr) {
        addToast('error', 'Menu Sync Notice', menuLoadErr);
      }

      setOrders(o || []);
      setMenuItems(m || []);
      setTables(t || []);
      setEmployees(e || []);
      setInventory(i || []);
      setSuppliers(sup || []);
      setFoodCategories(fc || []);
      setBarCategories(bc || []);
      setCurrentBusinessDay(bDay);
      setBusinessDayHistory(bHistory || []);
      setActiveSessions(activeSess || []);
      setBills(bList || []);

      setViewState('READY');
    } catch (err: any) {
      console.error('[RestaurantApp] Failed to load data:', err);
      if (!activeRestaurant && !currentRestaurant) {
        setViewState('ERROR');
        setViewError(err?.message || 'Failed to initialize restaurant operating system.');
      }
    }
  }, [activeRestaurant, currentRestaurant?.id]);

  const handleRefreshOrders = useCallback(async () => {
    const targetRestId = activeRestaurant?.id || currentRestaurant?.id || api.getCurrentRestaurantId();
    if (targetRestId) {
      const freshOrders = await api.getOrders(targetRestId).catch(() => []);
      setOrders(freshOrders);
    }
  }, [activeRestaurant?.id, currentRestaurant?.id]);

  // Category CRUD Handlers
  const handleAddCategory = async () => {
    if (!newCategoryInput.trim()) {
      addToast('error', 'Validation Error', 'Category name cannot be empty.');
      return;
    }
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    if (categoryModalMode === 'FOOD') {
      const added = await api.addCategory({ restaurantId: restId, name: newCategoryInput.trim() });
      if (added) {
        setFoodCategories((prev) => [...prev, added]);
      }
      addToast('success', 'Food Category Added 🍽️', `Added "${newCategoryInput.trim()}"`);
    } else {
      const added = await api.addBarCategory({ restaurantId: restId, name: newCategoryInput.trim() });
      if (added) {
        setBarCategories((prev) => [...prev, added]);
      }
      addToast('success', 'Bar Category Added 🍸', `Added "${newCategoryInput.trim()}"`);
    }
    setNewCategoryInput('');
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    if (categoryModalMode === 'FOOD') {
      await api.updateCategory(editingCategory.id, { name: editingCategory.name.trim() });
      setFoodCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...c, name: editingCategory.name.trim() } : c))
      );
      addToast('success', 'Category Renamed ✏️', `Updated to "${editingCategory.name.trim()}"`);
    } else {
      await api.updateBarCategory(editingCategory.id, { name: editingCategory.name.trim() });
      setBarCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...c, name: editingCategory.name.trim() } : c))
      );
      addToast('success', 'Bar Category Renamed ✏️', `Updated to "${editingCategory.name.trim()}"`);
    }
    setEditingCategory(null);
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;
    if (deletingCategory.type === 'FOOD') {
      await api.deleteCategory(deletingCategory.id);
      setFoodCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      addToast('info', 'Category Deleted 🗑️', `Deleted category "${deletingCategory.name}"`);
    } else {
      await api.deleteBarCategory(deletingCategory.id);
      setBarCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      addToast('info', 'Bar Category Deleted 🗑️', `Deleted category "${deletingCategory.name}"`);
    }
    setDeletingCategory(null);
  };

  const handleRequestLaunch = async () => {
    if (!currentRestaurant) return;
    await api.submitRestaurantLaunch({ id: currentRestaurant.id, name: currentRestaurant.name });
    addToast('success', 'Launch Request Submitted! 🚀', 'Your restaurant application has been submitted for review.');
  };

  const handleResubmitLaunch = async () => {
    if (!currentRestaurant) return;
    await api.resubmitRestaurantLaunch(currentRestaurant.id);
    addToast('success', 'Launch Resubmitted! 🔄', 'Your updated application has been submitted for review.');
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    await api.updateOrderStatus(orderId, newStatus);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    addToast('info', 'Order Status Updated', `Order #${orderId} moved to ${newStatus}`);
  };

  const handleToggleItemAvailability = async (item: MenuItem) => {
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const newAvail = !item.isAvailable;
    setMenuItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, isAvailable: newAvail } : m))
    );
    await api.toggleMenuItemAvailability(item.id, restId, item.isAvailable);
    addToast('success', 'Menu Availability Updated', `${item.name} is now ${newAvail ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  };

  const handleAddItem = async () => {
    try {
      if (!newItem.name || !newItem.name.trim()) {
        addToast('error', 'Validation Failed', 'Dish/Item name is required.');
        return;
      }
      if (!newItem.price || !newItem.price.toString().trim()) {
        addToast('error', 'Validation Failed', 'Price is required.');
        return;
      }

      const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
      const isBar = isBarEnabled && activeCatalogMode === 'BAR';
      const isVeg = isBar ? false : newItem.isVegetarian !== false;

      const defaultFoodCat = foodCategories[0]?.id || foodCategories[0]?.name || 'cat-starters';
      const defaultBarCat = barCategories[0]?.name || barCategories[0]?.id || 'Cocktails';

      let finalCat = newItem.categoryId;
      if (!finalCat || finalCat === 'cat-1') {
        finalCat = isBar ? defaultBarCat : defaultFoodCat;
      }

      const cleanPrice = parseFloat(newItem.price.toString().replace(/[^0-9.]/g, '')) || 0;

      const added = await api.addMenuItem({
        restaurantId: restId,
        categoryId: finalCat,
        barCategory: isBar ? (finalCat as any) : undefined,
        name: newItem.name.trim(),
        description: (newItem.description || '').trim(),
        price: cleanPrice,
        image: newItem.image || (isBar ? 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600' : 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600'),
        isAvailable: true,
        isVegetarian: isVeg,
        dietaryType: isVeg ? 'VEG' : 'NON_VEG',
        targetDestination: isBar ? 'BAR' : 'KITCHEN',
        isAlcoholic: isBar,
        alcoholPercentage: isBar ? 40 : 0,
        glassSize: isBar ? '60ml Peg' : undefined,
      });

      if (added) {
        setMenuItems((prev) => [...prev, added]);
      }

      addToast('success', `${isBar ? 'Bar Drink' : 'Food Item'} Added ✨`, `"${newItem.name.trim()}" added to catalog`);
      setIsAddItemModalOpen(false);
      setSelectedMenuCategory('ALL');
      setMenuSearchQuery('');
      setDietaryFilter('ALL');
      setNewItem({ name: '', description: '', price: '', categoryId: isBar ? defaultBarCat : defaultFoodCat, isVegetarian: true, image: '' });
    } catch (err: any) {
      addToast('error', 'Failed to Add Item', err.message || 'An error occurred while adding the dish.');
    }
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem({ ...item });
    setIsEditItemModalOpen(true);
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !editingItem.name || editingItem.price === undefined) {
      addToast('error', 'Validation Failed', 'Item name and price are required');
      return;
    }
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const isVeg = editingItem.isVegetarian !== undefined ? editingItem.isVegetarian : (editingItem.dietaryType === 'VEG');
    const itemUpdates = {
      restaurantId: restId,
      name: editingItem.name,
      description: editingItem.description,
      price: typeof editingItem.price === 'string' ? parseFloat(editingItem.price) : editingItem.price,
      categoryId: editingItem.categoryId,
      barCategory: editingItem.barCategory,
      isVegetarian: isVeg,
      dietaryType: (isVeg ? 'VEG' : 'NON_VEG') as 'VEG' | 'NON_VEG',
      brand: editingItem.brand,
      alcoholPercentage: editingItem.alcoholPercentage,
      glassSize: editingItem.glassSize,
      bottleSize: editingItem.bottleSize,
      image: editingItem.image,
      isAvailable: editingItem.isAvailable,
      targetDestination: editingItem.targetDestination,
      isAlcoholic: editingItem.isAlcoholic,
    };
    await api.updateMenuItem(editingItem.id, itemUpdates);
    setMenuItems((prev) =>
      prev.map((m) => (m.id === editingItem.id ? { ...m, ...itemUpdates } : m))
    );
    addToast('success', 'Menu Item Updated', `${editingItem.name} updated successfully`);
    setIsEditItemModalOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return;
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    await api.deleteMenuItem(deletingItem.id, restId);
    setMenuItems((prev) => prev.filter((m) => m.id !== deletingItem.id));
    addToast('info', 'Menu Item Deleted', `${deletingItem.name} removed from menu`);
    setDeletingItem(null);
  };


  // Staff CRUD Handlers
  const handleAddStaff = async () => {
    if (!newStaff.name.trim()) {
      addToast('error', 'Validation Failed', 'Staff member name is required.');
      return;
    }
    const cleanUsername = (newStaff.username || newStaff.name.toLowerCase().replace(/\s+/g, '')).trim().toLowerCase();
    if (!cleanUsername) {
      addToast('error', 'Validation Failed', 'Staff username is required.');
      return;
    }
    try {
      const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
      const initialPass = newStaffPassword || (newStaff.role === 'CHEF' ? 'kitchen123' : newStaff.role === 'WAITER' ? 'waiter123' : 'staff123');
      const created = await api.addEmployee({
        restaurantId: restId,
        name: newStaff.name.trim(),
        username: cleanUsername,
        role: newStaff.role,
        terminal: (newStaff.terminal || `${newStaff.role}-01`).trim().toUpperCase(),
        terminalId: (newStaff.terminal || `${newStaff.role}-01`).trim().toUpperCase(),
        email: newStaff.email || `${cleanUsername}@staff.dinely.internal`,
        phone: newStaff.phone || '+1 555-0100',
        status: 'OFF_CLOCK',
        shift: newStaff.shift,
        assignedSection: newStaff.assignedSection,
        hourlyRate: parseFloat(newStaff.hourlyRate) || 18,
        password: initialPass,
        isActive: true,
        isAccountDisabled: false,
      });

      if (created) {
        setEmployees((prev) => [...prev.filter((e) => e.id !== created.id), created]);
        addToast('success', 'Staff Member Created 🎉', `${created.name} (@${created.username}) assigned to ${created.terminal || created.role}`);
        setIsAddStaffModalOpen(false);
        setNewStaff({
          name: '',
          username: '',
          role: 'WAITER',
          terminal: 'WAITER-01',
          email: '',
          phone: '',
          shift: 'Evening (4PM - 12AM)',
          assignedSection: 'Front Floor & POS',
          hourlyRate: '18.50',
        });
        setNewStaffPassword('');
      }
    } catch (err: any) {
      addToast('error', 'Staff Creation Failed ❌', err.message || 'Error persisting employee record to database.');
    }
  };

  const handleSaveEditStaff = async () => {
    if (!editingStaff) return;
    const staffUpdates = {
      name: editingStaff.name,
      role: editingStaff.role,
      terminal: editingStaff.terminal || editingStaff.terminalId || `${editingStaff.role}-01`,
      terminalId: editingStaff.terminal || editingStaff.terminalId || `${editingStaff.role}-01`,
      email: editingStaff.email,
      phone: editingStaff.phone,
      shift: editingStaff.shift,
      assignedSection: editingStaff.assignedSection,
      hourlyRate: editingStaff.hourlyRate,
      isActive: editingStaff.isActive,
    };
    await api.updateEmployee(editingStaff.id, staffUpdates);
    setEmployees((prev) =>
      prev.map((e) => (e.id === editingStaff.id ? { ...e, ...staffUpdates } : e))
    );
    addToast('success', 'Staff Record Updated', `${editingStaff.name}'s profile was updated.`);
    setIsEditStaffModalOpen(false);
    setEditingStaff(null);
  };

  const handleToggleAccountDisabled = async (employeeId: string, currentName: string) => {
    const updated = await api.toggleEmployeeAccountStatus(employeeId);
    if (updated) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? { ...e, isAccountDisabled: updated.isAccountDisabled } : e))
      );
      if (updated.isAccountDisabled) {
        addToast('warning', 'Staff Account Access Disabled', `${currentName} can no longer log in.`);
      } else {
        addToast('success', 'Staff Account Access Restored', `${currentName} can now log in.`);
      }
    }
  };

  const handleOpenResetPasswordModal = (employee: Employee) => {
    setResetPassStaff(employee);
    const pass = employee.role === 'CHEF' ? 'kitchen123' : employee.role === 'WAITER' ? 'waiter123' : 'pass' + Math.floor(1000 + Math.random() * 9000);
    setGeneratedPass(pass);
    setIsResetPassModalOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPassStaff) return;
    await api.resetEmployeePassword(resetPassStaff.id, generatedPass);
    addToast('success', 'Password Reset Completed', `${resetPassStaff.name}'s portal password was updated.`);
    setIsResetPassModalOpen(false);
    setResetPassStaff(null);
  };

  const handleDeleteStaff = async (employeeId: string, name: string) => {
    await api.deleteEmployee(employeeId);
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    addToast('info', 'Staff Member Deleted', `${name} has been removed from staff roster.`);
  };

  const handleToggleStaffStatus = async (employeeId: string, currentStatus: Employee['status']) => {
    const nextStatus: Employee['status'] =
      currentStatus === 'ON_CLOCK' ? 'ON_BREAK' : currentStatus === 'ON_BREAK' ? 'OFF_CLOCK' : 'ON_CLOCK';
    await api.updateEmployeeStatus(employeeId, nextStatus);
    setEmployees((prev) =>
      prev.map((e) => (e.id === employeeId ? { ...e, status: nextStatus, isClockedIn: nextStatus === 'ON_CLOCK' } : e))
    );
    addToast('success', 'Staff Clock Status Updated', `Status changed to ${nextStatus.replace('_', ' ')}`);
  };

  // Raw Material & Supplier Handlers
  const handleAddSupplier = async () => {
    if (!newSupplier.name) {
      addToast('error', 'Validation Failed', 'Supplier company name is required');
      return;
    }
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    await api.addSupplier({
      restaurantId: restId,
      name: newSupplier.name,
      contactPerson: newSupplier.contactPerson,
      phone: newSupplier.phone,
      email: newSupplier.email,
      supplyCategory: newSupplier.supplyCategory,
      address: newSupplier.address,
      notes: newSupplier.notes,
    });
    addToast('success', 'Supplier Registered', `${newSupplier.name} registered successfully.`);
    setIsAddSupplierModalOpen(false);
    setNewSupplier({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      supplyCategory: 'Dairy & Cheese',
      address: '',
      notes: '',
    });
    loadData();
  };

  const handleDeleteSupplier = async (supplierId: string, name: string) => {
    await api.deleteSupplier(supplierId);
    addToast('info', 'Supplier Deleted', `${name} removed from vendor registry.`);
    loadData();
  };

  const handleAddInventory = async () => {
    if (!newInventory.name) {
      addToast('error', 'Validation Failed', 'Item name is required');
      return;
    }
    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const selectedSup = suppliers.find((s) => s.id === newInventory.supplierId);

    await api.addInventoryItem({
      restaurantId: restId,
      name: newInventory.name,
      category: newInventory.category,
      station: newInventory.station,
      quantity: parseFloat(newInventory.quantity) || 10,
      unit: newInventory.unit,
      minThreshold: parseFloat(newInventory.minThreshold) || 5,
      costPerUnit: parseFloat(newInventory.costPerUnit) || 10,
      supplierId: selectedSup?.id || undefined,
      supplierName: selectedSup?.name || newInventory.supplierName || 'General Supplier',
      supplierContact: selectedSup?.phone || newInventory.supplierContact || 'N/A',
      storageLocation: newInventory.storageLocation,
    });

    addToast('success', 'Raw Material Added', `${newInventory.name} added to ${newInventory.station === 'BAR' ? 'Bar' : 'Kitchen'} inventory.`);
    setIsAddInventoryModalOpen(false);
    setNewInventory({
      name: '',
      category: 'Meat & Poultry',
      station: 'KITCHEN',
      quantity: '25',
      unit: 'kg',
      minThreshold: '5',
      costPerUnit: '12.00',
      supplierId: '',
      supplierName: 'Prime Choice Foods',
      supplierContact: '+1 800-555-0199',
      storageLocation: 'Cold Storage #1',
    });
    loadData();
  };

  const handleAdjustInventory = async (itemId: string, delta: number) => {
    await api.updateInventoryQuantity(itemId, delta);
    addToast('info', 'Inventory Adjusted', `Stock quantity updated by ${delta > 0 ? '+' : ''}${delta}`);
    loadData();
  };

  const handleDeleteInventory = async (itemId: string, name: string) => {
    await api.deleteInventoryItem(itemId);
    addToast('info', 'Inventory Item Removed', `${name} removed from inventory.`);
    loadData();
  };

  if (viewState === 'INITIALIZING' || viewState === 'LOADING') {
    const restName = activeRestaurant?.name || currentRestaurant?.name;
    return (
      <LoadingScreen
        restaurantName={restName}
        status="Opening your workspace"
        substatus={restName ? `Connecting to ${restName}...` : 'Preparing your restaurant workspace...'}
        onRetry={() => loadData(true)}
        onChooseRestaurant={() => (onNavigate ? onNavigate('/workspace') : (window.location.href = '/workspace'))}
      />
    );
  }

  if (viewState === 'ERROR') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <Card className="max-w-md w-full bg-slate-900/90 border-slate-800 p-8 shadow-2xl text-center space-y-5 rounded-3xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-white">Restaurant Unavailable</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {viewError || 'Could not resolve the selected restaurant workspace.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="brand"
              size="sm"
              onClick={() => loadData()}
              className="px-5 py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
            >
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (onNavigate ? onNavigate('/workspace') : (window.location.href = '/workspace'))}
              className="px-5 py-2.5 text-xs font-bold border-slate-700 text-slate-300"
            >
              Choose Restaurant
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (currentRestaurant && (
    currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' ||
    currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' ||
    currentRestaurant.lifecycleStatus === 'REJECTED' ||
    currentRestaurant.lifecycleStatus === 'DEACTIVATED' ||
    currentRestaurant.lifecycleStatus === 'SUSPENDED' ||
    (!currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'DRAFT')
  )) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <Card className="max-w-2xl w-full bg-slate-900/90 border-slate-800 p-8 sm:p-10 shadow-2xl relative z-10 backdrop-blur-xl rounded-3xl text-center space-y-6">
          {/* Restaurant Banner & Logo */}
          <div className="relative mb-6">
            <div className="h-32 w-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/60 shadow-inner">
              <img
                src={theme.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80'}
                alt={theme.restaurantName}
                className="w-full h-full object-cover opacity-60"
              />
            </div>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
              <img
                src={theme.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                alt={theme.restaurantName}
                className="w-20 h-20 rounded-3xl object-cover border-4 border-slate-900 shadow-xl"
              />
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <h1 className="text-3xl font-black text-white tracking-tight">{theme.restaurantName}</h1>
            <p className="text-xs text-slate-400 font-mono">dashboard.dinely.com • ID: {currentRestaurant.id}</p>
          </div>

          {/* STATUS DISPLAY */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border shadow-sm">
            {currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' && (
              <span className="bg-amber-500/20 text-amber-400 border-amber-500/40 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /> Status: Pending Approval ⏳
              </span>
            )}
            {currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' && (
              <span className="bg-amber-500/20 text-amber-400 border-amber-500/40 px-3 py-1 rounded-full font-bold">
                ⚠️ Status: Action Required (Changes Requested)
              </span>
            )}
            {currentRestaurant.lifecycleStatus === 'REJECTED' && (
              <span className="bg-rose-500/20 text-rose-400 border-rose-500/40 px-3 py-1 rounded-full font-bold">
                ❌ Status: Application Declined
              </span>
            )}
            {currentRestaurant.lifecycleStatus === 'DEACTIVATED' && (
              <span className="bg-slate-800 text-slate-300 border-slate-700 px-3 py-1 rounded-full font-bold">
                🔒 Restaurant Currently Disabled
              </span>
            )}
            {currentRestaurant.lifecycleStatus === 'SUSPENDED' && (
              <span className="bg-rose-500/20 text-rose-400 border-rose-500/40 px-3 py-1 rounded-full font-bold">
                🚫 Account Suspended
              </span>
            )}
          </div>

          {/* MESSAGE CONTENT */}
          {currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' && (
            <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 space-y-3 text-slate-300 text-sm leading-relaxed text-center">
              <p className="font-semibold text-white text-base">Thank you for registering your restaurant.</p>
              <p>Your restaurant has been submitted for review.</p>
              <p>Our team is reviewing your restaurant.</p>
              <p className="text-emerald-400 font-semibold pt-1">You will receive a notification once your restaurant has been approved.</p>
            </div>
          )}

          {currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' && (
            <div className="bg-amber-500/10 p-5 rounded-2xl border border-amber-500/30 text-amber-200 text-xs space-y-2 text-left">
              <p className="font-bold text-amber-300 text-sm">Comments from Platform Reviewer:</p>
              <p className="p-3 bg-slate-950 rounded-xl border border-amber-500/20 font-mono text-slate-200">
                "{currentRestaurant.requestedChanges || 'Please check business tax numbers and menu pricing.'}"
              </p>
              <p className="text-slate-300 pt-1">Please update your restaurant setup information using the button below and click Resubmit Application.</p>
            </div>
          )}

          {currentRestaurant.lifecycleStatus === 'REJECTED' && (
            <div className="bg-rose-500/10 p-5 rounded-2xl border border-rose-500/30 text-rose-200 text-xs space-y-2 text-left">
              <p className="font-bold text-rose-300 text-sm">Rejection Reason:</p>
              <p className="p-3 bg-slate-950 rounded-xl border border-rose-500/20 font-mono text-slate-200">
                "{currentRestaurant.rejectionReason || 'Application details did not meet platform guidelines.'}"
              </p>
              <p className="text-slate-300 pt-1">You may edit your information and resubmit for reconsideration.</p>
            </div>
          )}

          {currentRestaurant.lifecycleStatus === 'DEACTIVATED' && (
            <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 space-y-2 text-slate-300 text-sm text-center">
              <p className="font-bold text-white text-base">Restaurant Currently Disabled</p>
              <p className="text-slate-400 text-xs">Your restaurant property has been set to inactive. Customer ordering website is temporarily offline.</p>
            </div>
          )}

          {currentRestaurant.lifecycleStatus === 'SUSPENDED' && (
            <div className="bg-rose-500/10 p-6 rounded-2xl border border-rose-500/30 space-y-2 text-rose-200 text-sm text-center">
              <p className="font-bold text-white text-base">Account Suspended</p>
              <p className="text-xs text-rose-300">Access to the restaurant management dashboard is currently disabled. Please contact support at support@dinely.com.</p>
            </div>
          )}

          {/* BUTTON CONTROLS */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="brand"
              onClick={async () => {
                if (currentRestaurant) {
                  const approvedRest = await api.approveRestaurant(currentRestaurant.id);
                  if (approvedRest) {
                    setCurrentRestaurant({ ...approvedRest });
                  }
                  addToast('success', 'Restaurant System Live! 🚀', 'Your restaurant is fully approved and active.');
                  await loadData();
                }
              }}
              className="w-full sm:w-auto text-xs font-bold px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-xl shadow-emerald-950/50"
              icon={<Sparkles className="w-4 h-4" />}
            >
              Instant Launch & Open Dashboard 🚀
            </Button>

            {(currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' ||
              currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' ||
              currentRestaurant.lifecycleStatus === 'REJECTED') && (
              <Button
                variant="outline"
                onClick={() => {
                  if (onEditSetup) onEditSetup();
                }}
                className="w-full sm:w-auto text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 px-6 py-2.5"
                icon={<Edit className="w-4 h-4" />}
              >
                Edit Restaurant Information
              </Button>
            )}

            {(currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' || currentRestaurant.lifecycleStatus === 'REJECTED') && (
              <Button
                variant="brand"
                onClick={handleResubmitLaunch}
                className="w-full sm:w-auto text-xs font-bold px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500"
                icon={<RotateCcw className="w-4 h-4" />}
              >
                Resubmit Application
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => {
                api.logout();
                if (onLogout) onLogout();
              }}
              className="w-full sm:w-auto text-xs font-bold border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-6 py-2.5"
            >
              Logout
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-[#0e1117] border-r border-[#1e232e] p-4 flex flex-col justify-between shrink-0">
        <div>
          {/* Platform Branding Header */}
          <div className="mb-4 px-2 flex items-center justify-between pb-3 border-b border-[#1e232e]">
            <DinelyLogo size="sm" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-[#151922] px-2 py-0.5 rounded border border-[#242b3b]">Owner OS</span>
          </div>

          {/* Multi-Restaurant Outlet Switcher Button */}
          <div className="mb-5 px-1">
            <button
              onClick={() => setIsOutletModalOpen(true)}
              className="w-full p-2.5 bg-[#141822] border border-[#222838] hover:border-[#353f56] rounded-xl flex items-center justify-between gap-2.5 transition-all text-left group cursor-pointer"
              title="Click to Switch Restaurant Outlet or Register New Branch"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={theme.logo}
                  alt={theme.restaurantName}
                  className="w-8 h-8 rounded-lg object-cover border border-[#2a3245] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-xs font-semibold text-white tracking-tight truncate">
                    {theme.restaurantName}
                  </h1>
                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-orange-400 shrink-0" />
                    <span>{currentRestaurant?.branchName || currentRestaurant?.city || 'Main Outlet'}</span>
                    <span className="text-[9px] bg-[#1a202c] text-slate-300 px-1.5 py-0.2 rounded font-mono shrink-0 ml-1">
                      {allMyRestaurants.length}
                    </span>
                  </p>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0 transition-colors" />
            </button>
          </div>

          {/* Categorized Navigation Links */}
          <nav className="space-y-4">
            {(() => {
              const hasKitchenModule = isModuleEnabled(currentRestaurant, 'kitchen');
              const hasWaiterModule = isModuleEnabled(currentRestaurant, 'waiter');
              const hasBarModule = isModuleEnabled(currentRestaurant, 'bar');
              const hasInventoryModule = isModuleEnabled(currentRestaurant, 'inventory');
              const hasBillingModule = isModuleEnabled(currentRestaurant, 'billing');
              const hasTablesModule = isModuleEnabled(currentRestaurant, 'tables');
              const isFoodCart = currentRestaurant?.businessType === 'FOOD_CART' || currentRestaurant?.businessType === 'FOOD_TRUCK';

              const sections = [
                {
                  title: 'Operations',
                  items: [
                    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
                    ...(hasWaiterModule
                      ? [{ id: 'waiter', label: 'Waiter Terminal', icon: <PhoneCall className="w-4 h-4 text-amber-400" />, badge: 'LIVE' }]
                      : []),
                    {
                      id: 'orders',
                      label: 'POS Orders',
                      icon: <ShoppingBag className="w-4 h-4" />,
                      badge: orders.filter((o) => o.status !== 'COMPLETED').length || undefined,
                    },
                    ...(hasTablesModule
                      ? [{
                          id: 'tables',
                          label: 'Floorplan & QR',
                          icon: <Grid className="w-4 h-4" />,
                          badge: tables.filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length > 0 ? 'ALERT' : undefined,
                        }]
                      : []),
                    ...(isFoodCart && !hasTablesModule
                      ? [{ id: 'qr_pickup', label: 'Counter Pickup QR', icon: <QrCode className="w-4 h-4 text-sky-400" />, badge: 'PICKUP' }]
                      : []),
                  ],
                },
                {
                  title: 'Production',
                  items: [
                    ...(hasKitchenModule
                      ? [{ id: 'kitchen', label: 'Kitchen KDS', icon: <ChefHat className="w-4 h-4 text-emerald-400" /> }]
                      : []),
                    ...(hasBarModule
                      ? [{ id: 'bar', label: 'Bar Terminal', icon: <Wine className="w-4 h-4 text-purple-400" />, badge: 'BAR' }]
                      : []),
                    ...(hasInventoryModule
                      ? [{ id: 'inventory', label: 'Inventory Stock', icon: <Package className="w-4 h-4" /> }]
                      : []),
                  ],
                },
                {
                  title: 'Management',
                  items: [
                    ...(hasBillingModule
                      ? [{ id: 'billing', label: 'Billing & Invoices', icon: <Receipt className="w-4 h-4 text-emerald-400" /> }]
                      : []),
                    { id: 'menu', label: 'Menu & Pricing', icon: <UtensilsCrossed className="w-4 h-4" /> },
                    { id: 'staff', label: 'Staff & Shifts', icon: <Users className="w-4 h-4" /> },
                    {
                      id: 'day_management',
                      label: 'Day Management',
                      icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
                      badge: currentBusinessDay?.status === 'OPEN' ? 'OPEN' : 'CLOSED',
                    },
                    { id: 'theme', label: 'Branding & Theme', icon: <Palette className="w-4 h-4" /> },
                    { id: 'workspace_settings', label: 'Terminals & Setup', icon: <Layers className="w-4 h-4 text-rose-400" /> },
                  ],
                },
              ];

              return sections.map((sec) => {
                const validItems = sec.items.filter(Boolean);
                if (validItems.length === 0) return null;
                return (
                  <div key={sec.title} className="space-y-1">
                    <p className="px-2 text-[10px] font-mono uppercase tracking-wider text-slate-400">{sec.title}</p>
                    <div className="space-y-0.5">
                      {validItems.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id as any)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            activeTab === item.id
                              ? 'bg-[#181d27] text-white border border-[#2d3545]'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-[#141822]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {item.icon}
                            <span>{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium ${
                                item.badge === 'ALERT'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : item.badge === 'LIVE'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : item.badge === 'BAR'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : item.badge === 'PICKUP'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : item.badge === 'OPEN'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : item.badge === 'CLOSED'
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                  : 'bg-[#1e232e] text-slate-300 border border-[#2b3242]'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </nav>
        </div>

        {/* Quick Footer */}
        <div className="pt-3 border-t border-[#1e232e] space-y-2.5">
          <div className="flex items-center gap-2.5 px-1 overflow-hidden">
            <Avatar name={currentUser?.name || 'Restaurant Owner'} size="sm" status="online" />
            <div className="truncate">
              <p className="text-xs font-medium text-white truncate">{currentUser?.name || 'Restaurant Owner'}</p>
              <p className="text-[10px] text-slate-400 truncate">{currentUser?.email || 'owner@restaurant.com'}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/restaurant/login';
            }}
            className="w-full text-xs border-[#1e232e] bg-[#12151b] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center gap-1.5 h-8"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Body */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Launch Status Banner */}
        {currentRestaurant && (
          <div className="mb-6">
            {currentRestaurant.lifecycleStatus === 'DRAFT' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-white">Restaurant Setup in Draft Mode</h4>
                    <p className="text-xs text-amber-300/80">
                      Configure your menu items, tables, and branding below. When ready, submit your application for platform approval and live URL activation.
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleRequestLaunch} className="shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs">
                  Request Launch Approval
                </Button>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' && (
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
                    <Clock className="w-4 h-4 animate-spin" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-white">Launch Application Under Review</h4>
                    <p className="text-xs text-sky-300/80">
                      Your restaurant submission is currently under review by the platform team. Live customer ordering will unlock automatically upon verification.
                    </p>
                  </div>
                </div>
                <Badge variant="warning">Under Review</Badge>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-white">Modification Requested</h4>
                    <p className="text-xs text-amber-300/90 mt-0.5">
                      Feedback: "{currentRestaurant.requestedChanges || 'Please check tax number and menu items.'}"
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleResubmitLaunch} className="shrink-0 text-xs">
                  Resubmit Application
                </Button>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'REJECTED' && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-white">Launch Application Declined</h4>
                    <p className="text-xs text-rose-300/90 mt-0.5">
                      Reason: "{currentRestaurant.rejectionReason || 'Details did not meet platform guidelines.'}"
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleResubmitLaunch} className="shrink-0 bg-rose-600 hover:bg-rose-500 text-xs">
                  Resubmit Application
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#1e232e]">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span className="text-emerald-400 font-semibold">DINELY</span>
              <span>/</span>
              <span className="text-slate-300">{theme?.restaurantName || currentRestaurant?.name || 'Restaurant'}</span>
              <span>/</span>
              <span className="text-slate-400 capitalize">{activeTab.replace('_', ' ')}</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-1">
              {activeTab === 'dashboard' && 'Executive Overview'}
              {activeTab === 'orders' && 'POS & QR Orders Stream'}
              {activeTab === 'kitchen' && 'Kitchen Display System (KDS)'}
              {activeTab === 'bar' && 'Bar Terminal (KDS)'}
              {activeTab === 'tables' && 'Table Floorplan & QR Codes'}
              {activeTab === 'menu' && 'Menu Engineering & Pricing'}
              {activeTab === 'staff' && 'Employee Clock-In & Shifts'}
              {activeTab === 'inventory' && 'Raw Material Inventory'}
              {activeTab === 'billing' && 'Billing, Taxes & Invoices'}
              {(activeTab === 'business_day' || activeTab === 'day_management') && 'Day Management'}
              {activeTab === 'theme' && 'Brand Identity & Styling'}
              {activeTab === 'workspace_settings' && 'Terminals & Settings'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {activeTab === 'dashboard' && 'Live performance metrics, revenue analytics, and station status across your restaurant.'}
              {activeTab === 'orders' && 'Live chronological order stream from table QR codes, POS, and counter pickups.'}
              {activeTab === 'kitchen' && 'Real-time kitchen order bump board, active cooking timers, and runner pass.'}
              {activeTab === 'bar' && 'Craft beverage dispensing queue, mixology timers, and floor pass dispatch.'}
              {activeTab === 'tables' && 'Interactive dining area floorplan, live table states, and printable QR standee cards.'}
              {activeTab === 'menu' && 'Food & beverage catalog, category classifications, variants, and live availability toggles.'}
              {activeTab === 'staff' && 'Employee profiles, shift schedules, role-based pin credentials, and clock-in status.'}
              {activeTab === 'inventory' && 'Track kitchen and bar stock levels, minimum reorder thresholds, and suppliers.'}
              {activeTab === 'billing' && 'Table checkouts, split bills, GST/tax management, and payment receipts.'}
              {(activeTab === 'business_day' || activeTab === 'day_management') && 'Authoritative operational business-day lifecycle, shift register reconciliation, station prechecks, and daily closing.'}
              {activeTab === 'theme' && "Customize your restaurant's digital storefront, logo, accent colors, and typography."}
              {activeTab === 'workspace_settings' && 'Manage active operational modules, terminal access URLs, and branch configuration.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'menu' && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddItemModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Add Menu Item
              </Button>
            )}
            {activeTab === 'tables' && isModuleEnabled(currentRestaurant, 'tables') && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsCreateTableModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Create Table
              </Button>
            )}
            {activeTab === 'staff' && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddStaffModalOpen(true)}
                icon={<UserPlus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Add Employee
              </Button>
            )}
            {activeTab === 'inventory' && isModuleEnabled(currentRestaurant, 'inventory') && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddInventoryModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Add Raw Material
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (allMyRestaurants.length > 1) {
                  setIsOutletModalOpen(true);
                } else if (onNavigate) {
                  onNavigate('/workspace');
                } else {
                  window.location.href = 'https://dinely.food/workspace';
                }
              }}
              className="text-xs border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white hover:bg-[#181d27]"
              icon={<Store className="w-3.5 h-3.5 mr-1 text-slate-400" />}
            >
              Switch Restaurant
            </Button>
            <a
              href={getRestaurantCustomerUrl(currentRestaurant)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg bg-[#141822] border border-[#222838] text-emerald-400 hover:border-emerald-500/40 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{getRestaurantPublicDomain(currentRestaurant).replace(/^https?:\/\//, '')}</span>
            </a>
          </div>
        </header>

        {/* Tab 1: Dashboard Overview */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* DOMINANT RESTAURANT BRANDING HERO */}
            <div className="relative rounded-2xl overflow-hidden border border-[#1e232e] bg-[#12151b]">
              <div className="h-40 sm:h-48 w-full relative">
                <img
                  src={theme?.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80'}
                  alt={theme?.restaurantName || 'Restaurant'}
                  className="w-full h-full object-cover brightness-40"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#12151b] via-[#12151b]/60 to-transparent" />
              </div>

              <div className="p-5 sm:p-6 -mt-16 relative z-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-5">
                <div className="flex items-end gap-4">
                  <img
                    src={theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                    alt={theme?.restaurantName || 'Restaurant'}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-[#1e232e] bg-[#0e1117] shrink-0"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        {currentRestaurant?.lifecycleStatus === 'ACTIVE' || !currentRestaurant?.lifecycleStatus ? 'Live' : currentRestaurant?.lifecycleStatus}
                      </span>
                      <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                        {getRestaurantPublicDomain(currentRestaurant).replace(/^https?:\/\//, '')}
                      </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                      {theme?.restaurantName || currentRestaurant?.name || 'Restaurant'}
                    </h1>
                    <p className="text-xs text-slate-400">
                      {currentRestaurant?.branchName || currentRestaurant?.city || 'Main Branch'} • Logged in as {currentUser?.name || 'Owner'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => setActiveTab('waiter')}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-medium text-xs px-3.5 py-2"
                    icon={<PhoneCall className="w-3.5 h-3.5" />}
                  >
                    Launch Waiter OS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('kitchen')}
                    className="border-[#1e232e] bg-[#141822] text-slate-200 hover:bg-[#1c2230] text-xs px-3.5 py-2"
                    icon={<ChefHat className="w-3.5 h-3.5 text-emerald-400" />}
                  >
                    Kitchen KDS
                  </Button>
                </div>
              </div>
            </div>
            {/* Real Today Metrics Computation */}
            {(() => {
              const openBday = currentBusinessDay;
              const dayOrders = orders.filter(
                (o) => o.restaurantId === currentRestaurant?.id && (openBday ? o.businessDayId === openBday.id || new Date(o.createdAt).getTime() >= new Date(openBday.openedAt).getTime() : true)
              );

              const completed = dayOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.paymentStatus === 'PAID');
              const cancelled = dayOrders.filter((o) => o.status === 'CANCELLED');

              const foodOrders = dayOrders.filter((o) => o.items.some((i) => getFulfillmentStation(i) === 'KITCHEN'));
              const barOrders = dayOrders.filter((o) => o.items.some((i) => getFulfillmentStation(i) === 'BAR'));

              let foodSales = 0;
              let barSales = 0;

              dayOrders.forEach((o) => {
                if (o.status !== 'CANCELLED') {
                  o.items.forEach((item) => {
                    const itemTotal = item.price * item.quantity;
                    if (getFulfillmentStation(item) === 'BAR') {
                      barSales += itemTotal;
                    } else {
                      foodSales += itemTotal;
                    }
                  });
                }
              });

              const totalSales = foodSales + barSales;

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-[#12151b] border border-[#1e232e] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-medium">Today's Total Sales</span>
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                          <DollarSign className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white tracking-tight">
                        {formatCurrency(totalSales, theme.currency)}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{dayOrders.length} orders today</span>
                        <span className="font-mono text-slate-400">{currentBusinessDay?.status === 'OPEN' ? 'Day Open' : 'Day Closed'}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#12151b] border border-[#1e232e] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-medium">Active Kitchen Orders</span>
                        <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white tracking-tight">
                        {orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">In Preparation / Ready</span>
                        <span className="text-sky-400 font-mono">Live KDS</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#12151b] border border-[#1e232e] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-medium">Floor Occupancy</span>
                        <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                          <Grid className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white tracking-tight">
                        {tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied || activeSessions.some((s) => s.status === 'ACTIVE' && (s.tableId === t.id || s.tableNumber.toLowerCase() === t.tableNumber.toLowerCase()))).length} <span className="text-sm font-normal text-slate-400">/ {tables.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Active Dining Sessions</span>
                        <span className="text-purple-400 font-mono">{tables.length > 0 ? Math.round((tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied || activeSessions.some((s) => s.status === 'ACTIVE' && (s.tableId === t.id || s.tableNumber.toLowerCase() === t.tableNumber.toLowerCase()))).length / tables.length) * 100) : 0}%</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#12151b] border border-[#1e232e] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-medium">Fulfilled Today</span>
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                          <Clock className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono text-white tracking-tight">
                        {completed.length}
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Completed Orders</span>
                        <span className={`font-mono ${cancelled.length > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{cancelled.length} cancelled</span>
                      </div>
                    </div>
                  </div>

                  {/* Bar Operating Analytics (When Bar Module Enabled) */}
                  {currentRestaurant?.features?.bar !== false && (
                    <div className="bg-[#12151b] border border-[#222838] p-5 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-300 font-semibold text-sm">
                          <Wine className="w-4 h-4 text-purple-400" />
                          <span>Bar & Beverage Analytics</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/30">
                          BAR ACTIVE
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1e232e]">
                          <span className="text-[10px] text-slate-400 uppercase font-mono">Bar Sales</span>
                          <p className="text-lg font-bold font-mono text-amber-400 mt-0.5">{formatCurrency(barSales, theme.currency)}</p>
                          <span className="text-[10px] text-slate-400">{barOrders.length} drink tickets</span>
                        </div>

                        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1e232e]">
                          <span className="text-[10px] text-slate-400 uppercase font-mono">Kitchen Food Sales</span>
                          <p className="text-lg font-bold font-mono text-white mt-0.5">{formatCurrency(foodSales, theme.currency)}</p>
                          <span className="text-[10px] text-slate-400">{foodOrders.length} food tickets</span>
                        </div>

                        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1e232e]">
                          <span className="text-[10px] text-slate-400 uppercase font-mono">Day Status</span>
                          <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{currentBusinessDay?.status || 'OPEN'}</p>
                          <span className="text-[10px] text-slate-400 font-mono">{currentBusinessDay?.date || 'Today'}</span>
                        </div>

                        <div className="p-3 bg-[#0c0e14] rounded-xl border border-[#1e232e]">
                          <span className="text-[10px] text-slate-400 uppercase font-mono">Completed</span>
                          <p className="text-lg font-bold font-mono text-sky-400 mt-0.5">{completed.length}</p>
                          <span className="text-[10px] text-slate-400">Delivered</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Quick Actions & Live Order Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#12151b] border border-[#1e232e] p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Recent Customer Orders</h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('orders')} className="text-xs text-slate-400 hover:text-white">
                    View All Orders →
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {orders.slice(0, 3).map((order) => (
                    <div
                      key={order.id}
                      className="p-3.5 rounded-xl bg-[#0e1117] border border-[#1e232e] flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-white text-xs">#{order.id}</span>
                          <Badge variant="brand">{order.tableNumber}</Badge>
                          <span className="text-xs text-slate-400">{order.customerName || 'Walk-in'}</span>
                        </div>
                        <p className="text-xs text-slate-300 truncate max-w-md">
                          {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-white text-xs">₹{order.totalAmount.toFixed(2)}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateOrderStatus(order.id, 'IN_KITCHEN')}
                          className="text-xs h-7 px-2.5"
                        >
                          Send to Kitchen
                        </Button>
                      </div>
                    </div>
                  ))}
                  {orders.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">No incoming orders yet today.</p>
                  )}
                </div>
              </div>

              {/* Table Alert Summary / Counter Pickup Summary */}
              {currentRestaurant?.hasTables !== false ? (
                <div className="bg-[#12151b] border border-[#1e232e] p-5 rounded-2xl space-y-4">
                  <h3 className="text-sm font-semibold text-white">Table Alerts</h3>
                  <div className="space-y-2.5">
                    {(tables || [])
                      .filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED')
                      .map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            {t.status === 'WAITER_CALLED' ? (
                              <PhoneCall className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Receipt className="w-4 h-4 text-emerald-400" />
                            )}
                            <div>
                              <p className="text-xs font-semibold text-white">{t.tableNumber}</p>
                              <p className="text-[10px] text-amber-300">
                                {t.status === 'WAITER_CALLED' ? 'Requested Waiter Assistance' : 'Requested Final Bill'}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] px-2 py-1 h-6"
                            onClick={() => {
                              addToast('success', 'Alert Cleared');
                              loadData();
                            }}
                          >
                            Acknowledge
                          </Button>
                        </div>
                      ))}
                    {(tables || []).filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-6">No pending waiter calls or bill requests.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[#12151b] border border-[#1e232e] p-5 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                    <Truck className="w-4 h-4 text-sky-400" />
                    <span>Counter / Pickup Order System</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    This venue operates without tables. Customers scan your counter QR code to place pickup orders directly to Kitchen KDS.
                  </p>
                  <div className="p-4 bg-[#0c0e14] rounded-xl border border-[#1e232e] text-center space-y-3">
                    <QrCode className="w-10 h-10 text-sky-400 mx-auto" />
                    <div>
                      <p className="text-xs font-medium text-white">Counter Entry Point</p>
                      <p className="text-[10px] font-mono text-slate-400 truncate">{getRestaurantCustomerUrl(currentRestaurant, 'COUNTER')}</p>
                    </div>
                    <Button variant="brand" size="sm" onClick={() => setActiveTab('qr_pickup')} className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs">
                      View Printable Counter QR
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Orders Board */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Live Orders Stream</h3>
              <Badge variant="brand">{orders.length} Total Orders</Badge>
            </div>

            <DataTable<Order>
              data={orders}
              keyExtractor={(o) => o.id}
              columns={[
                { key: 'id', header: 'Order ID', render: (o) => <span className="font-mono font-bold text-white">#{o.id}</span> },
                { key: 'tableNumber', header: 'Table', render: (o) => <Badge variant="brand">{o.tableNumber}</Badge> },
                { key: 'customerName', header: 'Customer', render: (o) => <span className="text-xs text-slate-300">{o.customerName || 'Walk-in'}</span> },
                {
                  key: 'items',
                  header: 'Items',
                  render: (o) => (
                    <div className="text-xs text-slate-300">
                      {o.items.map((i) => (
                        <div key={i.id}>
                          • {i.quantity}x {i.name}
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'totalAmount',
                  header: 'Total',
                  render: (o) => <span className="font-mono font-bold text-emerald-400">₹{o.totalAmount.toFixed(2)}</span>,
                },
                {
                  key: 'status',
                  header: 'Kitchen Stage',
                  render: (o) => (
                    <Badge variant={o.status === 'DELIVERED' ? 'success' : o.status === 'IN_KITCHEN' ? 'warning' : 'info'}>
                      {o.status}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (o) => (
                    <div className="flex gap-1.5">
                      {o.status === 'PENDING' && (
                        <Button size="sm" variant="brand" onClick={() => handleUpdateOrderStatus(o.id, 'IN_KITCHEN')}>
                          Send KDS
                        </Button>
                      )}
                      {o.status === 'IN_KITCHEN' && (
                        <Button size="sm" variant="secondary" onClick={() => handleUpdateOrderStatus(o.id, 'READY')}>
                          Mark Ready
                        </Button>
                      )}
                      {o.status === 'READY' && (
                        <Button size="sm" variant="primary" onClick={() => handleUpdateOrderStatus(o.id, 'DELIVERED')}>
                          Deliver Table
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}

        {/* Tab: Waiter Terminal Operating System */}
        {activeTab === 'waiter' && (
          isModuleEnabled(currentRestaurant, 'waiter') ? (
            <WaiterTerminalOS />
          ) : (
            <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
                <PhoneCall className="w-8 h-8" />
              </div>
              <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
              <h3 className="text-xl font-bold text-white">Waiter Terminal is currently disabled for this restaurant.</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                The Waiter Terminal has been deactivated in Workspace Settings.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                  Open Terminals & Setup
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                  Return to Dashboard
                </Button>
              </div>
            </Card>
          )
        )}

        {/* Tab 3: Kitchen Display System (KDS) & ETA Controls */}
        {activeTab === 'kitchen' && (
          isModuleEnabled(currentRestaurant, 'kitchen') ? (
            <KitchenETADashboard orders={orders} onRefreshOrders={handleRefreshOrders} />
          ) : (
            <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
                <ChefHat className="w-8 h-8" />
              </div>
              <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
              <h3 className="text-xl font-bold text-white">Kitchen Terminal is currently disabled for this restaurant.</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                The Kitchen Display System has been deactivated in Workspace Settings.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                  Open Terminals & Setup
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                  Return to Dashboard
                </Button>
              </div>
            </Card>
          )
        )}

        {/* Tab 3.5: Bar Terminal */}
        {activeTab === 'bar' && (
          isModuleEnabled(currentRestaurant, 'bar') ? (
            <BarTerminal />
          ) : (
            <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 mx-auto flex items-center justify-center">
                <Wine className="w-8 h-8" />
              </div>
              <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
              <h3 className="text-xl font-bold text-white">Bar Terminal is currently disabled for this restaurant.</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                The Bar Terminal KDS has been deactivated in Workspace Settings.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                  Open Terminals & Setup
                </Button>
                <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                  Return to Dashboard
                </Button>
              </div>
            </Card>
          )
        )}

        {/* Tab 3.6: Counter / Pickup QR Entry Point */}
        {activeTab === 'qr_pickup' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-emerald-400" /> Business Counter QR Code & Pickup Ordering
                </h3>
                <p className="text-xs text-slate-400">
                  Print or display this single QR code at your Food Truck or Stall counter for customer pickup orders.
                </p>
              </div>
            </div>

            <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-xl mx-auto text-center space-y-6 shadow-xl">
              <div className="p-6 bg-[#0e1117] rounded-2xl border border-[#1e232e] inline-block shadow-inner">
                <QRCodeDisplay
                  url={getRestaurantCustomerUrl(currentRestaurant, 'COUNTER')}
                  tableNumber="COUNTER"
                  restaurantName={currentRestaurant?.name || theme?.restaurantName || 'Food Truck'}
                  restaurantLogo={theme?.logo}
                  restaurantId={currentRestaurant?.id}
                  isPickup={true}
                  size={240}
                />
              </div>

              <div className="space-y-2">
                <Badge variant="brand" className="px-3 py-1 text-xs font-mono font-bold">
                  COUNTER PICKUP QR
                </Badge>
                <h4 className="text-xl font-bold text-white">{currentRestaurant?.name || 'Food Truck'}</h4>
                <p className="text-xs font-mono text-emerald-400">{getRestaurantCustomerUrl(currentRestaurant, 'COUNTER')}</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Customers scan this code to view your food menu, add items to cart, and place pickup orders with unique ticket numbers (e.g. #F1024).
                </p>
              </div>

              <div className="pt-4 border-t border-[#1e232e] flex justify-center gap-3">
                <Button
                  variant="brand"
                  size="md"
                  onClick={() => {
                    const cardEl = document.querySelector('.printable-card-wrapper') as HTMLElement || document.querySelector('.w-72.sm\\:w-80') as HTMLElement;
                    printQRCodeCard(cardEl?.outerHTML || '', currentRestaurant?.name || 'Food Truck', 'COUNTER');
                  }}
                  icon={<QrCode className="w-4 h-4" />}
                >
                  Print Counter QR Sign
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 4: Table Floorplan, Merging & Reservations */}
        {activeTab === 'tables' && (
          isModuleEnabled(currentRestaurant, 'tables') ? (
            <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Grid className="w-5 h-5 text-emerald-400" /> Dining Room Table Floorplan & Reservations
                </h3>
                <p className="text-xs text-slate-400">
                  Create tables, edit capacities, merge tables for large gatherings, and reserve tables for guests.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTableIdsForMerge([]);
                    setIsMergeTablesModalOpen(true);
                  }}
                  className="border-[#1e232e] bg-[#12151b] text-slate-200 hover:bg-[#181d27] text-xs"
                  icon={<Link className="w-3.5 h-3.5 text-amber-400" />}
                >
                  Merge Tables for Gathering
                </Button>

                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setIsCreateTableModalOpen(true)}
                  className="text-xs"
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Create New Table
                </Button>
              </div>
            </div>

            {/* Floorplan Overview KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="bg-[#12151b] border-[#1e232e] p-3 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Total Tables</span>
                <p className="text-xl font-bold text-white font-mono">{tables.length}</p>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-3 space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase">Available</span>
                <p className="text-xl font-bold text-emerald-400 font-mono">
                  {tables.filter((t) => t.status !== 'OCCUPIED' && !t.isOccupied && !activeSessions.some((s) => s.status === 'ACTIVE' && (s.tableId === t.id || s.tableNumber.toLowerCase() === t.tableNumber.toLowerCase())) && t.status !== 'RESERVED').length}
                </p>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-3 space-y-1">
                <span className="text-[10px] font-mono text-amber-400 uppercase">Reserved</span>
                <p className="text-xl font-bold text-amber-400 font-mono">
                  {tables.filter((t) => t.status === 'RESERVED').length}
                </p>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-3 space-y-1">
                <span className="text-[10px] font-mono text-sky-400 uppercase">Merged Groups</span>
                <p className="text-xl font-bold text-sky-400 font-mono">
                  {tables.filter((t) => t.isMerged).length}
                </p>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-3 space-y-1 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-mono text-rose-400 uppercase">Occupied</span>
                <p className="text-xl font-bold text-rose-400 font-mono">
                  {tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied || activeSessions.some((s) => s.status === 'ACTIVE' && (s.tableId === t.id || s.tableNumber.toLowerCase() === t.tableNumber.toLowerCase()))).length}
                </p>
              </Card>
            </div>

            {/* Interactive Floorplan Table Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tables.map((tbl) => {
                const isReserved = tbl.status === 'RESERVED' || Boolean(tbl.reservationDetails);
                const isMerged = tbl.isMerged || tbl.status === 'MERGED';

                const activeSess = activeSessions.find(
                  (s) => s.status === 'ACTIVE' && (s.tableId === tbl.id || s.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
                );
                const isTableOccupied = Boolean(activeSess) || tbl.status === 'OCCUPIED' || tbl.isOccupied === true;
                const tableOrders = orders.filter((o) =>
                  (activeSess && o.tableSessionId === activeSess.id) ||
                  o.tableId === tbl.id ||
                  (o.tableNumber && o.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
                ).filter((o) => o.status !== 'CANCELLED');
                const sessionTotal = tableOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

                return (
                  <Card
                    key={tbl.id}
                    className={`bg-[#12151b] border transition-all p-5 flex flex-col justify-between space-y-4 rounded-xl ${
                      isReserved
                        ? 'border-amber-500/50 shadow-md shadow-amber-950/20'
                        : isMerged
                        ? 'border-sky-500/50 shadow-md shadow-sky-950/20'
                        : isTableOccupied
                        ? 'border-rose-500/40 shadow-md shadow-rose-950/20'
                        : 'border-[#1e232e]'
                    }`}
                  >
                    <div>
                      {/* Top Row: Table Number, VIP, Status */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono font-bold text-white text-xl">{tbl.tableNumber}</h4>
                            {tbl.isVip && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-slate-950">
                                VIP
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">
                            {tbl.section || 'Main Hall'} • Capacity: <strong className="text-slate-200">{tbl.capacity} Seats</strong> ({tbl.shape || 'RECTANGLE'})
                          </p>
                        </div>

                        <Badge
                          variant={
                            isTableOccupied
                              ? 'danger'
                              : isReserved
                              ? 'warning'
                              : isMerged
                              ? 'info'
                              : 'success'
                          }
                        >
                          {isTableOccupied ? 'OCCUPIED' : tbl.status}
                        </Badge>
                      </div>

                      {/* Active Table Session Banner */}
                      {(activeSess || isTableOccupied) && (
                        <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs space-y-2 font-mono">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              {activeSess ? `Session #${activeSess.id}` : `Active Table #${tbl.tableNumber}`}
                            </span>
                            <span className="text-[10px] text-rose-300 font-bold bg-rose-900/60 px-2 py-0.5 rounded-md">
                              ● ACTIVE
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-300 text-[11px]">
                            <span>Orders: <strong className="text-white">{tableOrders.length}</strong></span>
                            <span>Total Bill: <strong className="text-emerald-400">₹{sessionTotal.toFixed(2)}</strong></span>
                          </div>
                          <div className="pt-1 flex justify-end">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await api.closeTableSession({
                                    restaurantId: currentRestaurant?.id,
                                    tableId: tbl.id,
                                    waiterName: currentUser?.name || 'Owner',
                                    tableSessionId: activeSess?.id,
                                  });
                                  addToast('success', 'Table Session Closed 🧹', `${tbl.tableNumber} is now AVAILABLE.`);
                                  setTables((prev) =>
                                    prev.map((t) => (t.id === tbl.id ? { ...t, status: 'AVAILABLE', isOccupied: false } : t))
                                  );
                                  if (activeSess) {
                                    setActiveSessions((prev) => prev.filter((s) => s.id !== activeSess.id));
                                  }
                                  await loadData();
                                } catch (err: any) {
                                  addToast('error', 'Close Error', err.message || 'Failed to close table session.');
                                }
                              }}
                              className="text-[10px] py-1 px-2.5 font-bold"
                            >
                              CLOSE TABLE
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Merged Banner */}
                      {isMerged && (
                        <div className="mt-3 p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs space-y-1">
                          <p className="font-bold text-sky-300 flex items-center gap-1.5">
                            <Link className="w-3.5 h-3.5 text-sky-400" />
                            {tbl.mergedGroupLabel || `Merged Table Group`}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Tables: {tbl.mergedTableNumbers?.join(' + ') || tbl.tableNumber}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnmergeTables([tbl.id, ...(tbl.mergedWithIds || [])])}
                            className="mt-1 text-[10px] py-0.5 px-2 border-sky-500/40 text-sky-300 hover:bg-sky-500/20"
                            icon={<Unlink className="w-3 h-3" />}
                          >
                            Unmerge Tables
                          </Button>
                        </div>
                      )}

                      {/* Reservation Details Banner */}
                      {isReserved && tbl.reservationDetails && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs space-y-1">
                          <p className="font-bold text-amber-300 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            Reserved for {tbl.reservationDetails.reservedForName}
                          </p>
                          <p className="text-[11px] text-slate-300 font-mono">
                            Time: <strong>{tbl.reservationDetails.reservationTime}</strong> • Party of <strong>{tbl.reservationDetails.partySize}</strong>
                          </p>
                          {tbl.reservationDetails.reservedForPhone && (
                            <p className="text-[10px] text-slate-400 font-mono">Phone: {tbl.reservationDetails.reservedForPhone}</p>
                          )}
                          {tbl.reservationDetails.notes && (
                            <p className="text-[10px] text-slate-400 italic">"{tbl.reservationDetails.notes}"</p>
                          )}

                          <div className="flex gap-1.5 pt-1">
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={() => handleCheckInGuest(tbl.id, tbl.tableNumber, tbl.reservationDetails!.reservedForName)}
                              className="text-[10px] py-1 px-2.5 font-bold"
                              icon={<UserCheck className="w-3 h-3" />}
                            >
                              Check In Guest
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelReservation(tbl.id, tbl.tableNumber)}
                              className="text-[10px] py-1 px-2 border-[#1e232e] text-rose-400 hover:bg-rose-500/10"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Action Footer Controls */}
                    <div className="pt-3 border-t border-[#1e232e] flex items-center justify-between gap-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTableQR(tbl)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1"
                        icon={<QrCode className="w-3.5 h-3.5" />}
                      >
                        QR Code
                      </Button>

                      {!isReserved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTableToReserve(tbl);
                            setIsReserveTableModalOpen(true);
                          }}
                          className="text-[11px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2 py-1"
                          icon={<Calendar className="w-3 h-3" />}
                        >
                          Reserve
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTable({ ...tbl });
                          setIsEditTableModalOpen(true);
                        }}
                        className="text-[11px] text-slate-300 hover:text-white px-2 py-1"
                        icon={<Edit3 className="w-3 h-3" />}
                      >
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTable(tbl.id, tbl.tableNumber)}
                        className="text-[11px] text-slate-500 hover:text-rose-400 px-1.5 py-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
              <Grid className="w-8 h-8" />
            </div>
            <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
            <h3 className="text-xl font-bold text-white">Table Floorplan & QR is currently disabled for this restaurant.</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Dining Room Tables & Floorplan have been deactivated in Workspace Settings.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                Open Terminals & Setup
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                Return to Dashboard
              </Button>
            </div>
          </Card>
        ))}

        {/* Tab 5: Menu & Pricing */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-emerald-400" /> Menu Catalog & Availability Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isBarEnabled
                      ? 'Manage independent Food & Bar catalogs, categories, drink specs, and digital menu pricing.'
                      : 'Manage food categories, dish items, dietary tags, and digital menu pricing.'}
                  </p>
                </div>

                {/* Sub-Tab Switcher: Food Menu vs Bar Menu (Only rendered if Bar is enabled for venue) */}
                {isBarEnabled && (
                  <div className="flex items-center gap-1.5 p-1 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                    <button
                      onClick={() => {
                        setMenuCatalogMode('FOOD');
                        setSelectedMenuCategory('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                        activeCatalogMode === 'FOOD'
                          ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-[#12151b] border border-transparent'
                      }`}
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      <span>Food Menu</span>
                    </button>

                    <button
                      onClick={() => {
                        setMenuCatalogMode('BAR');
                        setSelectedMenuCategory('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                        activeCatalogMode === 'BAR'
                          ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-[#12151b] border border-transparent'
                      }`}
                    >
                      <Wine className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Bar Menu</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCategoryModalMode(activeCatalogMode);
                      setIsManageCategoriesModalOpen(true);
                    }}
                    className="text-xs"
                    icon={<Layers className="w-3.5 h-3.5 text-slate-300" />}
                  >
                    Manage Categories
                  </Button>

                  {isBarEnabled && activeCatalogMode === 'BAR' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkImportBarDrinks}
                      className="text-xs"
                      icon={<Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                    >
                      Bulk Import Craft Drinks
                    </Button>
                  )}

                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => {
                      const firstCat = (isBarEnabled && activeCatalogMode === 'BAR')
                        ? (barCategories[0]?.name || 'Cocktails')
                        : (foodCategories[0]?.id || foodCategories[0]?.name || 'cat-starters');
                      setNewItem({ name: '', description: '', price: '', categoryId: firstCat, isVegetarian: true, image: '' });
                      setIsAddItemModalOpen(true);
                    }}
                    icon={<Plus className="w-3.5 h-3.5" />}
                    className="text-xs"
                  >
                    {(isBarEnabled && activeCatalogMode === 'BAR') ? 'Add Bar Drink' : 'Add Food Item'}
                  </Button>
                </div>
              </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0e1117] p-3 rounded-xl border border-[#1e232e]">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <div className="w-full sm:w-64">
                  <SearchInput
                    value={menuSearchQuery}
                    onChange={setMenuSearchQuery}
                    placeholder={menuCatalogMode === 'BAR' ? "Search cocktails, wine, brand..." : "Search dish, description, price..."}
                  />
                </div>

                {menuCatalogMode === 'FOOD' && (
                  <div className="flex items-center gap-1 bg-[#12151b] p-1 rounded-lg border border-[#1e232e] shrink-0">
                    <button
                      onClick={() => setDietaryFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        dietaryFilter === 'ALL' ? 'bg-[#181d27] text-white border border-[#2d3545]' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setDietaryFilter('VEG')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                        dietaryFilter === 'VEG' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Veg</span>
                    </button>
                    <button
                      onClick={() => setDietaryFilter('NON_VEG')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                        dietaryFilter === 'NON_VEG' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'text-slate-400 hover:text-rose-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>Non-Veg</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => setSelectedMenuCategory('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                    selectedMenuCategory === 'ALL'
                      ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                      : 'bg-[#12151b] border border-[#1e232e] text-slate-300 hover:text-white hover:bg-[#181d27]'
                  }`}
                >
                  All {menuCatalogMode === 'BAR' ? 'Drinks' : 'Items'} ({filteredMenuItems.length})
                </button>
                {(menuCatalogMode === 'BAR'
                  ? (barCategories.length > 0
                      ? barCategories.map((c) => c.name)
                      : ['Beer', 'Wine', 'Whiskey', 'Vodka', 'Rum', 'Gin', 'Cocktails', 'Mocktails', 'Champagne', 'Tequila', 'Shots', 'Signature Drinks'])
                  : (foodCategories.length > 0
                      ? foodCategories.map((c) => c.name)
                      : ['Starters & Appetizers', 'Main Course', 'Gourmet Burgers', 'Wood-Fired Pizza', 'Fresh Salads & Bowls', 'Pasta & Risotto', 'Desserts & Sweets', 'Beverages & Shakes'])
                ).map((catName) => {
                  const foodCatObj = foodCategories.find((c) => c.name === catName);
                  const count = menuItems.filter(
                    (i) => i.categoryId === catName || (foodCatObj && i.categoryId === foodCatObj.id) || i.barCategory === catName
                  ).length;
                  return (
                    <button
                      key={catName}
                      onClick={() => setSelectedMenuCategory(catName)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        selectedMenuCategory === catName
                          ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                          : 'bg-[#12151b] border border-[#1e232e] text-slate-300 hover:text-white hover:bg-[#181d27]'
                      }`}
                    >
                      {catName} {count > 0 ? `(${count})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMenuItems.map((item) => {
                const categoryObj = foodCategories.find((c) => c.id === item.categoryId || c.name === item.categoryId);
                const isVeg = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
                return (
                  <Card key={item.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div>
                      <div className="relative mb-3 rounded-xl overflow-hidden group">
                        <img src={item.image} alt={item.name} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
                        <span className="absolute top-2 left-2 px-2.5 py-1 bg-slate-950/80 backdrop-blur-md rounded-lg text-[10px] font-bold text-slate-200 border border-slate-700">
                          {item.barCategory || categoryObj?.name || 'General'}
                        </span>
                        <span className={`absolute top-2 right-2 px-2.5 py-1 rounded-lg text-[10px] font-bold backdrop-blur-md ${
                          item.isAvailable ? 'bg-emerald-500/80 text-white' : 'bg-rose-500/80 text-white'
                        }`}>
                          {item.isAvailable ? 'In Stock' : '86ed'}
                        </span>
                        {item.alcoholPercentage && (
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-950/90 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-500/40">
                            {item.alcoholPercentage}% ABV
                          </span>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            {!item.isAlcoholic && item.targetDestination !== 'BAR' && (
                              <span
                                className={`inline-flex items-center justify-center border p-0.5 rounded-[4px] shrink-0 ${
                                  isVeg ? 'border-emerald-500 bg-emerald-950/60' : 'border-rose-500 bg-rose-950/60'
                                }`}
                                title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                              >
                                <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              </span>
                            )}
                            <h4 className="font-bold text-white text-sm">{item.name}</h4>
                          </div>
                          {item.brand && <p className="text-[10px] text-amber-400 font-mono">{item.brand}</p>}
                        </div>
                        <span className="font-mono font-bold text-rose-400 text-base">{formatCurrency(item.price, theme.currency || 'INR (₹)')}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <Button
                        variant={item.isAvailable ? 'secondary' : 'brand'}
                        size="sm"
                        onClick={() => handleToggleItemAvailability(item)}
                        className="text-xs"
                      >

                        {item.isAvailable ? 'Mark 86ed' : 'Enable Item'}
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateItem(item.id)}
                          className="hover:bg-slate-800 text-slate-400 hover:text-amber-300 px-2"
                          title="Duplicate Drink / Dish"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditModal(item)}
                          className="hover:bg-slate-800 text-slate-300 hover:text-white px-2"
                          title="Edit Menu Item"
                        >
                          <Edit className="w-3.5 h-3.5 text-blue-400" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                          className="hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 px-2"
                          title="Delete Menu Item"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {filteredMenuItems.length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                  <UtensilsCrossed className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-300">No {menuCatalogMode === 'BAR' ? 'bar drinks' : 'food items'} found</p>
                  <p className="text-xs text-slate-500 mt-1">Try adjusting your category filter or add a new menu entry.</p>
                  <Button
                    variant="brand"
                    size="sm"
                    className="mt-4"
                    onClick={() => setIsAddItemModalOpen(true)}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add New {menuCatalogMode === 'BAR' ? 'Drink' : 'Item'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Staff & Shifts Management */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" /> Employee Roster & Shift Attendance
                </h3>
                <p className="text-xs text-slate-400">Manage shift schedules, floor stations, hourly rates, and live clock-in status.</p>
              </div>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddStaffModalOpen(true)}
                icon={<UserPlus className="w-3.5 h-3.5" />}
              >
                Add Staff Member
              </Button>
            </div>

            {/* Staff Stats KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Staff</span>
                <p className="text-2xl font-bold font-mono text-white">{employees.length}</p>
                <span className="text-[10px] text-slate-500">Active roster count</span>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold uppercase flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active In App Now
                </span>
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  {employees.filter((e) => e.status === 'ON_CLOCK').length}
                </p>
                <span className="text-[10px] text-emerald-400/80">Logged in & operating terminals</span>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-amber-400 font-semibold uppercase">On Break</span>
                <p className="text-2xl font-bold font-mono text-amber-400">
                  {employees.filter((e) => e.status === 'ON_BREAK').length}
                </p>
                <span className="text-[10px] text-slate-500">Scheduled break time</span>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Offline (Off Clock)</span>
                <p className="text-2xl font-bold font-mono text-slate-400">
                  {employees.filter((e) => e.status === 'OFF_CLOCK').length}
                </p>
                <span className="text-[10px] text-slate-500">Not logged in / off-duty</span>
              </Card>
            </div>

            {/* Staff Data Table */}
            <div className="bg-[#12151b] border border-[#1e232e] rounded-xl overflow-hidden shadow-sm">
              <DataTable<Employee>
                data={employees}
                keyExtractor={(e) => e.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Staff Profile & Credentials',
                    render: (e) => (
                      <div className="flex items-center gap-3 py-1">
                        <Avatar name={e.name} size="sm" status={e.status === 'ON_CLOCK' ? 'online' : 'offline'} />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-white text-xs">{e.name}</p>
                            <Badge variant={e.role === 'MANAGER' ? 'brand' : e.role === 'CHEF' ? 'warning' : 'info'}>
                              {e.role}
                            </Badge>
                            {e.status === 'ON_CLOCK' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono flex-wrap">
                            <span>Username: <strong className="text-amber-300 font-bold">@{e.username || (e.email ? e.email.split('@')[0] : 'staff')}</strong></span>
                            <span>• Terminal: <strong className="text-emerald-300 font-bold">{e.terminal || e.terminalId || `${e.role}-01`}</strong></span>
                            <span>• Tel: <strong className="text-slate-300">{e.phone || 'N/A'}</strong></span>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'shift',
                    header: 'Shift & Station',
                    render: (e) => (
                      <div className="space-y-1 py-1">
                        <span className="px-2 py-0.5 rounded-md bg-[#0e1117] border border-[#1e232e] text-amber-400 font-medium text-[11px] inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                          {e.shift || 'Evening (4PM - 12AM)'}
                        </span>
                        <p className="text-[11px] font-semibold text-slate-300">
                          {e.assignedSection || 'Main Dining Floor'}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'App & Portal Status',
                    render: (e) => (
                      <div className="flex items-center gap-1.5 py-1">
                        <button
                          onClick={() => handleToggleStaffStatus(e.id, e.status)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                            e.status === 'ON_CLOCK'
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/20'
                              : e.status === 'ON_BREAK'
                              ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                              : 'bg-[#181d27] border-[#2d3545] text-slate-400'
                          }`}
                          title="Click to toggle live status"
                        >
                          {e.status === 'ON_CLOCK' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              <span>ON CLOCK</span>
                            </>
                          ) : e.status === 'ON_BREAK' ? (
                            <span>☕ BREAK</span>
                          ) : (
                            <span>○ OFF CLOCK</span>
                          )}
                        </button>

                        <button
                          onClick={() => handleToggleAccountDisabled(e.id, e.name)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                            e.isAccountDisabled
                              ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                          title={e.isAccountDisabled ? 'Enable Portal Account' : 'Disable Portal Account'}
                        >
                          {e.isAccountDisabled ? (
                            <>
                              <ShieldX className="w-3 h-3 text-rose-400" />
                              <span>DISABLED</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>ACTIVE</span>
                            </>
                          )}
                        </button>
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: 'Staff Actions',
                    render: (e) => (
                      <div className="flex items-center gap-1.5 py-1">
                        <button
                          onClick={() => {
                            setEditingStaff({ ...e });
                            setIsEditStaffModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181d27] hover:bg-[#222838] text-slate-200 hover:text-white border border-[#2d3545] text-[11px] font-semibold transition-all duration-150 shadow-xs cursor-pointer group"
                          title="Edit Staff Member Details"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleOpenResetPasswordModal(e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/25 text-[11px] font-semibold transition-all duration-150 shadow-xs cursor-pointer group"
                          title="Reset Staff Password"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
                          <span>Reset</span>
                        </button>

                        <button
                          onClick={() => handleDeleteStaff(e.id, e.name)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-200 border border-rose-500/30 text-[11px] font-semibold transition-all duration-150 shadow-xs cursor-pointer group"
                          title="Delete Staff Member"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                          <span>Delete</span>
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* Tab 7: Raw Material & Inventory Management */}
        {activeTab === 'inventory' && (
          isModuleEnabled(currentRestaurant, 'inventory') ? (
            <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-400" /> Raw Materials & Inventory Control
                </h3>
                <p className="text-xs text-slate-400">Track kitchen and bar raw ingredients, stock levels, unit costs, low stock alerts, and verified vendors.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddSupplierModalOpen(true)}
                  className="border-[#1e232e] bg-[#12151b] text-slate-200 hover:bg-[#181d27]"
                  icon={<Users className="w-3.5 h-3.5 text-amber-400" />}
                >
                  + Add Supplier
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setIsAddInventoryModalOpen(true)}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Add Raw Material
                </Button>
              </div>
            </div>

            {/* Inventory KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Tracked Items</span>
                <p className="text-2xl font-bold font-mono text-white">{inventory.length}</p>
                <span className="text-[10px] text-slate-500">
                  {inventory.filter((i) => i.station !== 'BAR').length} Kitchen • {inventory.filter((i) => i.station === 'BAR').length} Bar
                </span>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-rose-400 font-semibold uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Low Stock Alerts
                </span>
                <p className="text-2xl font-bold font-mono text-rose-400">
                  {inventory.filter((i) => i.quantity <= i.minThreshold).length}
                </p>
                <span className="text-[10px] text-slate-500">At or below reorder threshold</span>
              </Card>

              <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold uppercase">Total Inventory Value</span>
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  {formatCurrency(inventory.reduce((acc, item) => acc + item.quantity * item.costPerUnit, 0), theme.currency || 'INR (₹)')}
                </p>
                <span className="text-[10px] text-slate-500">Valued at current cost</span>
              </Card>

              <Card
                onClick={() => setInventorySubTab('SUPPLIERS')}
                className="bg-[#12151b] border-[#1e232e] hover:border-emerald-500/50 cursor-pointer transition-all p-4 space-y-1 group"
              >
                <span className="text-[11px] text-emerald-400 font-semibold uppercase flex items-center justify-between">
                  <span>Active Suppliers</span>
                  <span className="text-[10px] text-emerald-300 group-hover:underline">Manage →</span>
                </span>
                <p className="text-2xl font-bold font-mono text-white">{suppliers.length}</p>
                <span className="text-[10px] text-slate-500">Click to view & add suppliers</span>
              </Card>
            </div>

            {/* Sub-Tabs: All Items, Kitchen Inventory, Bar Inventory, Suppliers Directory */}
            <div className="flex items-center gap-2 border-b border-[#1e232e] pb-3 overflow-x-auto">
              <button
                onClick={() => setInventorySubTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  inventorySubTab === 'ALL'
                    ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#181d27]/50'
                }`}
              >
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span>All Stock ({inventory.length})</span>
              </button>

              <button
                onClick={() => setInventorySubTab('KITCHEN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  inventorySubTab === 'KITCHEN'
                    ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#181d27]/50'
                }`}
              >
                <Utensils className="w-3.5 h-3.5 text-amber-400" />
                <span>Kitchen Inventory ({inventory.filter((i) => i.station !== 'BAR').length})</span>
              </button>

              <button
                onClick={() => setInventorySubTab('BAR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  inventorySubTab === 'BAR'
                    ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#181d27]/50'
                }`}
              >
                <Wine className="w-3.5 h-3.5 text-purple-400" />
                <span>Bar Inventory ({inventory.filter((i) => i.station === 'BAR').length})</span>
              </button>

              <button
                onClick={() => setInventorySubTab('SUPPLIERS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  inventorySubTab === 'SUPPLIERS'
                    ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#181d27]/50'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span>Suppliers Directory ({suppliers.length})</span>
              </button>
            </div>

            {/* TAB CONTENT: SUPPLIERS DIRECTORY */}
            {inventorySubTab === 'SUPPLIERS' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">Active Vendors & Suppliers ({suppliers.length})</h4>
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() => setIsAddSupplierModalOpen(true)}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add New Supplier
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {suppliers.map((sup) => (
                    <Card key={sup.id} className="p-4 bg-[#12151b] border-[#1e232e] rounded-xl space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline">{sup.supplyCategory || 'General'}</Badge>
                          <h5 className="font-bold text-white text-sm mt-1">{sup.name}</h5>
                          {sup.contactPerson && <p className="text-xs text-slate-400">Rep: {sup.contactPerson}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                          title="Delete Supplier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1 text-xs text-slate-300 border-t border-[#1e232e] pt-2 font-mono">
                        {sup.phone && <div>📞 {sup.phone}</div>}
                        {sup.email && <div className="truncate">✉️ {sup.email}</div>}
                        {sup.address && <div className="text-[11px] text-slate-400 truncate">📍 {sup.address}</div>}
                      </div>

                      {sup.notes && (
                        <p className="text-[11px] text-slate-400 italic bg-[#0e1117] p-2 rounded-xl border border-[#1e232e]">
                          "{sup.notes}"
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              /* TAB CONTENT: RAW MATERIAL INVENTORY TABLE */
              <div className="bg-[#12151b] border border-[#1e232e] rounded-xl overflow-hidden shadow-sm">
                <DataTable<InventoryItem>
                  data={inventory.filter((i) => {
                    if (inventorySubTab === 'KITCHEN') return i.station !== 'BAR';
                    if (inventorySubTab === 'BAR') return i.station === 'BAR';
                    return true;
                  })}
                  keyExtractor={(i) => i.id}
                  columns={[
                    {
                      key: 'name',
                      header: 'Raw Material / Item',
                      render: (i) => (
                        <div>
                          <p className="font-bold text-white text-xs">{i.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{i.storageLocation || 'Main Pantry'}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'station',
                      header: 'Division',
                      render: (i) => (
                        <Badge variant={i.station === 'BAR' ? 'warning' : 'info'}>
                          {i.station === 'BAR' ? 'BAR' : 'KITCHEN'}
                        </Badge>
                      ),
                    },
                    {
                      key: 'category',
                      header: 'Category',
                      render: (i) => <Badge variant="outline">{i.category}</Badge>,
                    },
                    {
                      key: 'quantity',
                      header: 'Stock Quantity',
                      render: (i) => (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold text-sm ${
                              i.quantity <= i.minThreshold ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {i.quantity} {i.unit}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={() => handleAdjustInventory(i.id, -1)}
                              className="w-6 h-6 rounded-md bg-[#181d27] border border-[#2d3545] hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 flex items-center justify-center transition-colors"
                              title="Decrease 1 unit"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleAdjustInventory(i.id, 1)}
                              className="w-6 h-6 rounded-md bg-[#181d27] border border-[#2d3545] hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 flex items-center justify-center transition-colors"
                              title="Increase 1 unit"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'minThreshold',
                      header: 'Min Alert',
                      render: (i) => (
                        <span className="text-xs font-mono text-slate-400">
                          {i.minThreshold} {i.unit}
                        </span>
                      ),
                    },
                    {
                      key: 'costPerUnit',
                      header: 'Unit Cost & Value',
                      render: (i) => (
                        <div>
                          <p className="font-mono text-xs text-white">{formatCurrency(i.costPerUnit, theme.currency || 'INR (₹)')} / {i.unit}</p>
                          <p className="font-mono text-[10px] text-emerald-400 font-bold">
                            Total: {formatCurrency(i.quantity * i.costPerUnit, theme.currency || 'INR (₹)')}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: 'supplierName',
                      header: 'Supplier Contact',
                      render: (i) => (
                        <div>
                          <p className="text-xs font-bold text-slate-200">{i.supplierName || 'Primary Vendor'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{i.supplierContact || 'N/A'}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (i) => (
                        <Badge
                          variant={
                            i.quantity === 0 ? 'danger' : i.quantity <= i.minThreshold ? 'warning' : 'success'
                          }
                        >
                          {i.quantity === 0 ? 'OUT OF STOCK' : i.quantity <= i.minThreshold ? 'LOW STOCK' : 'IN STOCK'}
                        </Badge>
                      ),
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (i) => (
                        <button
                          onClick={() => handleDeleteInventory(i.id, i.name)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Remove Inventory Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        ) : (
          <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <Package className="w-8 h-8" />
            </div>
            <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
            <h3 className="text-xl font-bold text-white">Inventory Terminal is currently disabled for this restaurant.</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Raw Material & Inventory Management has been deactivated in Workspace Settings.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                Open Terminals & Setup
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                Return to Dashboard
              </Button>
            </div>
          </Card>
        ))}

        {/* Tab: Billing & Digital Receipt OS */}
        {activeTab === 'billing' && (
          isModuleEnabled(currentRestaurant, 'billing') ? (
            <div className="space-y-6">
            {/* Header Title Banner */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1e232e] pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Restaurant Billing & Invoicing OS</span>
                      <Badge variant="brand" className="text-[10px] font-mono uppercase tracking-wider py-0.5">
                        Live POS
                      </Badge>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Real-time table settlement, server-calculated GST invoices, verified UPI checkout & tax configuration.
                    </p>
                  </div>
                </div>
              </div>

              {/* Segmented Subtab Pills */}
              <div className="flex flex-wrap items-center gap-1.5 bg-[#0e1117] p-1.5 rounded-xl border border-[#1e232e]">
                <button
                  type="button"
                  onClick={() => setBillingSubTab('terminal')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    billingSubTab === 'terminal'
                      ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]/60'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Live Tables & POS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingSubTab('invoices')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    billingSubTab === 'invoices'
                      ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]/60'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Invoices & History</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${billingSubTab === 'invoices' ? 'bg-[#222838] text-white' : 'bg-[#181d27] text-slate-400'}`}>
                    {bills.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingSubTab('taxes')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    billingSubTab === 'taxes'
                      ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]/60'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GST & Tax Rules</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingSubTab('settings')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    billingSubTab === 'settings'
                      ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]/60'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>UPI & Bill Setup</span>
                </button>
              </div>
            </div>

            {/* SUBTAB 4: OWNER BILLING & UPI SETTINGS */}
            {billingSubTab === 'settings' && (
              <OwnerBillingSettings
                restaurantId={currentRestaurant?.id || api.getCurrentRestaurantId() || ''}
                currentRestaurant={currentRestaurant}
                addToast={addToast}
                onConfigSaved={loadData}
              />
            )}

            {/* SUBTAB 3: TAXES MANAGEMENT */}
            {billingSubTab === 'taxes' && (
              <TaxManagement
                restaurantId={currentRestaurant?.id || api.getCurrentRestaurantId() || ''}
                currencySymbol={theme.currency || '₹'}
                categories={foodCategories}
                menuItems={menuItems}
                addToast={addToast}
              />
            )}

            {/* SUBTAB 1 & 2: COMMERCIAL BILLING TERMINAL & INVOICES */}
            {(billingSubTab === 'terminal' || billingSubTab === 'invoices') && (
              <>
                {/* Billing KPI Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                    <span className="text-[11px] text-emerald-400 font-semibold uppercase">Today's Sales</span>
                    <p className="text-2xl font-bold font-mono text-emerald-400">
                      {formatCurrency(
                        bills
                          .filter((b) => b.createdAt.startsWith(new Date().toISOString().split('T')[0]) && (b.paymentStatus === 'PAID' || b.status === 'CLOSED'))
                          .reduce((sum, b) => sum + b.grandTotal, 0),
                        theme.currency || 'INR (₹)'
                      )}
                    </p>
                    <span className="text-[10px] text-slate-500">Verified paid revenue today</span>
                  </Card>

                  <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Receipts</span>
                    <p className="text-2xl font-bold font-mono text-white">{bills.length}</p>
                    <span className="text-[10px] text-slate-500">Generated invoices & sessions</span>
                  </Card>

                  <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                    <span className="text-[11px] text-emerald-400 font-semibold uppercase">Paid Invoices</span>
                    <p className="text-2xl font-bold font-mono text-emerald-300">
                      {bills.filter((b) => b.paymentStatus === 'PAID' || b.status === 'CLOSED').length}
                    </p>
                    <span className="text-[10px] text-slate-500">Completed table bills</span>
                  </Card>

                  <Card className="bg-[#12151b] border-[#1e232e] p-4 space-y-1">
                    <span className="text-[11px] text-amber-400 font-semibold uppercase">Pending / Open Bills</span>
                    <p className="text-2xl font-bold font-mono text-amber-300">
                      {bills.filter((b) => (b.paymentStatus === 'UNPAID' || b.paymentStatus === 'PAYMENT_PENDING' || b.paymentStatus === 'PAYMENT_VERIFICATION_REQUIRED') && b.status !== 'CANCELLED' && b.status !== 'CLOSED').length}
                    </p>
                    <span className="text-[10px] text-slate-500">Active table sessions</span>
                  </Card>
                </div>

                {/* SUBTAB 1: LIVE OPEN TABLE BILLS */}
                {billingSubTab === 'terminal' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>Active Tables & Running Orders</span>
                        <Badge variant="brand">{tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED').length} Active</Badge>
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadData()}
                        className="text-xs border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white"
                      >
                        Refresh Live Tables
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {tables
                        .filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED' || t.isOccupied)
                        .map((tbl) => {
                          const tableOrders = orders.filter(
                            (o) => o.tableNumber === tbl.tableNumber && o.status !== 'CANCELLED'
                          );
                          const activeBill = bills.find(
                            (b) => b.tableNumber === tbl.tableNumber && b.status !== 'CLOSED' && b.status !== 'CANCELLED'
                          );
                          const orderCount = tableOrders.length;
                          const totalItems = tableOrders.reduce(
                            (sum, o) => sum + (o.items || []).reduce((iSum, itm) => iSum + itm.quantity, 0),
                            0
                          );
                          const runningTotal = activeBill
                            ? activeBill.grandTotal
                            : tableOrders.reduce((sum, o) => sum + o.totalAmount, 0);

                          return (
                            <Card
                              key={tbl.id}
                              className={`p-5 rounded-xl border transition-all space-y-4 ${
                                tbl.status === 'BILL_REQUESTED' || activeBill?.status === 'BILL_REQUESTED'
                                  ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-950/20'
                                  : activeBill?.paymentStatus === 'PAID'
                                  ? 'bg-emerald-950/20 border-emerald-500/50'
                                  : 'bg-[#12151b] border-[#1e232e]'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                                    <span>{tbl.tableNumber}</span>
                                    <Badge
                                      variant={
                                        tbl.status === 'BILL_REQUESTED'
                                          ? 'warning'
                                          : activeBill?.paymentStatus === 'PAID'
                                          ? 'success'
                                          : 'default'
                                      }
                                    >
                                      {tbl.status === 'BILL_REQUESTED' ? 'BILL REQUESTED 🧾' : activeBill?.paymentStatus === 'PAID' ? 'PAID ✅' : 'ACTIVE'}
                                    </Badge>
                                  </h4>
                                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                    {tbl.section} • Capacity {tbl.capacity}
                                  </p>
                                </div>

                                <div className="text-right font-mono">
                                  <span className="text-[10px] text-slate-400 uppercase">Running Total</span>
                                  <p className="text-xl font-bold text-emerald-400">
                                    {formatCurrency(runningTotal, theme.currency || 'INR (₹)')}
                                  </p>
                                </div>
                              </div>

                              <div className="bg-[#0e1117] p-3 rounded-lg border border-[#1e232e] text-xs font-mono flex items-center justify-between text-slate-300">
                                <span>{orderCount} Orders ({totalItems} Items)</span>
                                {activeBill?.invoiceNumber && (
                                  <span className="text-emerald-400 font-bold">{activeBill.invoiceNumber}</span>
                                )}
                              </div>

                              {/* ACTIONS */}
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                {activeBill ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setSelectedBillDetails(activeBill)}
                                      className="border-[#1e232e] bg-[#12151b] text-xs font-semibold text-slate-200 hover:text-white"
                                    >
                                      View Bill 📄
                                    </Button>

                                    {activeBill.paymentStatus !== 'PAID' ? (
                                      <Button
                                        size="sm"
                                        variant="brand"
                                        onClick={() => {
                                          setPaymentBillModal(activeBill);
                                          setPaymentMethodInput('CASH');
                                        }}
                                        className="text-xs font-semibold"
                                      >
                                        Record Manual Payment 💳
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        disabled={settlingBillId === activeBill.id}
                                        onClick={async () => {
                                          setSettlingBillId(activeBill.id);
                                          await api.closeTableSettlement(currentRestaurant?.id || api.getCurrentRestaurantId() || '', activeBill.id, 'Cashier');
                                          addToast('success', 'Table Closed & Reset! 🧹', `${tbl.tableNumber} is now available.`);
                                          setSettlingBillId(null);
                                          await loadData();
                                        }}
                                        className="bg-[#181d27] hover:bg-[#222838] text-amber-300 text-xs font-semibold border border-[#2d3545]"
                                      >
                                        Close Table 🏁
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="brand"
                                    onClick={async () => {
                                      try {
                                        const b = await api.generateTableInvoice(currentRestaurant?.id || api.getCurrentRestaurantId() || '', {
                                          tableNumber: tbl.tableNumber,
                                          tableId: tbl.id,
                                        });
                                        addToast('success', 'Invoice Generated! 🧾', `${b.invoiceNumber || b.id} created for ${tbl.tableNumber}`);
                                        await loadData();
                                      } catch (err: any) {
                                        addToast('error', 'Invoice Error', err.message || 'Failed to generate invoice');
                                      }
                                    }}
                                    className="col-span-2 text-xs font-semibold"
                                  >
                                    Generate GST Invoice 🧾
                                  </Button>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                    </div>

                    {tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED' || t.isOccupied).length === 0 && (
                      <div className="p-12 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="font-bold text-white text-sm">All Tables Vacant & Settled</h4>
                        <p className="text-xs text-slate-400">No active dining sessions requiring bill generation or payment settlement.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB 2: INVOICES & RECEIPTS HISTORY */}
                {billingSubTab === 'invoices' && (
                  <div className="space-y-4">
                    {/* Filters Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#12151b] p-3 rounded-xl border border-[#1e232e]">
                      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
                        <select
                          value={billingStatusFilter}
                          onChange={(e: any) => setBillingStatusFilter(e.target.value)}
                          className="px-3 py-1.5 bg-[#0e1117] border border-[#1e232e] rounded-lg text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="PAID">Paid Only</option>
                          <option value="PENDING">Pending / Unpaid</option>
                        </select>

                        <select
                          value={billingPaymentFilter}
                          onChange={(e: any) => setBillingPaymentFilter(e.target.value)}
                          className="px-3 py-1.5 bg-[#0e1117] border border-[#1e232e] rounded-lg text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="ALL">All Payment Methods</option>
                          <option value="UPI">UPI / Digital</option>
                          <option value="CASH">Cash</option>
                          <option value="CARD">Credit/Debit Card</option>
                        </select>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                        <input
                          type="text"
                          value={billingSearchQuery}
                          onChange={(e) => setBillingSearchQuery(e.target.value)}
                          placeholder="Search invoice #, table #, session..."
                          className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0e1117] border border-[#1e232e] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Bills DataTable */}
                    <div className="bg-[#12151b] border border-[#1e232e] rounded-xl overflow-hidden shadow-sm">
                      <DataTable<Bill>
                        data={bills.filter((b) => {
                          if (billingStatusFilter === 'PAID' && !(b.paymentStatus === 'PAID' || b.status === 'CLOSED')) return false;
                          if (billingStatusFilter === 'PENDING' && (b.paymentStatus === 'PAID' || b.status === 'CLOSED')) return false;
                          if (billingPaymentFilter !== 'ALL' && b.paymentMethod !== billingPaymentFilter) return false;
                          if (billingSearchQuery) {
                            const q = billingSearchQuery.toLowerCase();
                            return (
                              (b.invoiceNumber && b.invoiceNumber.toLowerCase().includes(q)) ||
                              b.id.toLowerCase().includes(q) ||
                              b.tableNumber.toLowerCase().includes(q) ||
                              b.tableSessionId.toLowerCase().includes(q)
                            );
                          }
                          return true;
                        })}
                        keyExtractor={(b) => b.id}
                        columns={[
                          {
                            key: 'id',
                            header: 'Invoice #',
                            render: (b) => (
                              <div>
                                <p className="font-mono font-bold text-emerald-400 text-xs">{b.invoiceNumber || b.id}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            ),
                          },
                          {
                            key: 'tableNumber',
                            header: 'Table & Session',
                            render: (b) => (
                              <div>
                                <p className="font-bold text-white text-xs">{b.tableNumber}</p>
                                <p className="text-[10px] text-emerald-400 font-mono">Session #{b.tableSessionId}</p>
                              </div>
                            ),
                          },
                          {
                            key: 'items',
                            header: 'Items Breakdown',
                            render: (b) => (
                              <span className="text-xs font-mono text-slate-300">
                                {b.items.reduce((sum, i) => sum + i.quantity, 0)} Items ({b.orders.length} Orders)
                              </span>
                            ),
                          },
                          {
                            key: 'grandTotal',
                            header: 'Grand Total',
                            render: (b) => (
                              <div>
                                <p className="font-mono font-bold text-white text-sm">
                                  {formatCurrency(b.grandTotal, theme.currency || 'INR (₹)')}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  Tax: {formatCurrency(b.taxAmount, theme.currency || 'INR (₹)')}
                                  {b.serviceChargeAmount ? ` • SC: ${formatCurrency(b.serviceChargeAmount, theme.currency || 'INR (₹)')}` : ''}
                                </p>
                              </div>
                            ),
                          },
                          {
                            key: 'paymentMethod',
                            header: 'Payment Method',
                            render: (b) => (
                              <Badge variant="outline" className="font-mono">
                                {b.paymentMethod || 'CASH'}
                              </Badge>
                            ),
                          },
                          {
                            key: 'status',
                            header: 'Status',
                            render: (b) => (
                              <Badge
                                variant={
                                  b.paymentStatus === 'PAID' || b.status === 'CLOSED'
                                    ? 'success'
                                    : b.paymentStatus === 'PAYMENT_VERIFICATION_REQUIRED' || b.paymentStatus === 'PAYMENT_AWAITING_CONFIRMATION'
                                    ? 'warning'
                                    : b.status === 'BILL_REQUESTED'
                                    ? 'warning'
                                    : 'info'
                                }
                              >
                                {b.paymentStatus === 'PAID' || b.status === 'CLOSED'
                                  ? 'PAID'
                                  : b.paymentStatus === 'PAYMENT_AWAITING_CONFIRMATION'
                                  ? 'AWAITING CONFIRMATION'
                                  : b.paymentStatus === 'PAYMENT_VERIFICATION_REQUIRED'
                                  ? 'VERIFY PAYMENT ⚠️'
                                  : b.status === 'BILL_REQUESTED'
                                  ? 'BILL REQUESTED'
                                  : 'UNPAID'}
                              </Badge>
                            ),
                          },
                          {
                            key: 'actions',
                            header: 'Actions',
                            render: (b) => (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedBillDetails(b)}
                                  className="border-slate-800 text-xs font-bold text-slate-300 hover:text-white"
                                >
                                  View 🧾
                                </Button>
                                {b.paymentStatus !== 'PAID' && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setPaymentBillModal(b);
                                      setPaymentMethodInput('CASH');
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 whitespace-nowrap"
                                  >
                                    Record Manual Payment 💳
                                  </Button>
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <Card className="bg-[#12151b] border-[#1e232e] p-8 max-w-lg mx-auto text-center space-y-4 rounded-2xl shadow-xl mt-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <Receipt className="w-8 h-8" />
            </div>
            <Badge variant="warning" className="text-[10px] uppercase font-mono">Module Disabled</Badge>
            <h3 className="text-xl font-bold text-white">Billing Terminal is currently disabled for this restaurant.</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Billing, Invoices & Tax Management has been deactivated in Workspace Settings.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <Button variant="brand" onClick={() => setActiveTab('workspace_settings')} className="text-xs">
                Open Terminals & Setup
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('dashboard')} className="text-xs">
                Return to Dashboard
              </Button>
            </div>
          </Card>
        ))}


        {/* Tab 8: Branding & Theme Engine */}
        {activeTab === 'theme' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-rose-500" /> No-Code Restaurant Branding & Currency Engine
              </h3>
              <p className="text-xs text-slate-400">
                Customize colors, currency formatting, logo, cover images, and typography. Updates push instantly to customer QR apps and waiter terminals!
              </p>
            </div>

            <Card className="bg-slate-900 border-slate-800 p-6 space-y-6">
              {/* Restaurant Name & Brand Accent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Restaurant Display Name"
                  value={theme.restaurantName}
                  onChange={(e) => updateThemeColor('restaurantName', e.target.value)}
                />
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Primary Brand Accent Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={theme.primaryColor || '#e11d48'}
                      onChange={(e) => updateThemeColor('primaryColor', e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-slate-700"
                    />
                    <span className="font-mono text-xs text-slate-300">{theme.primaryColor || '#e11d48'}</span>
                  </div>
                </div>
              </div>

              {/* CURRENCY & PRICING FORMATTING SECTION */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-white">
                      Base Operating Currency & Price Symbol
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Sets currency symbol across Customer QR Menu, POS, Bill Receipts, and Reports.
                    </p>
                  </div>
                  <Badge variant="brand" className="text-xs font-mono font-bold px-3 py-1">
                    Symbol: {getCurrencySymbol(theme.currency || 'INR (₹)')}
                  </Badge>
                </div>

                <div className="px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🇮🇳</span>
                    <span>INR (₹) — Indian Rupee</span>
                  </div>
                  <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg font-mono font-bold">Standard Currency (₹)</span>
                </div>
              </div>

              {/* LOGO & BANNER UPLOADS */}
              <ImageUpload
                label="Restaurant Logo URL"
                value={theme.logo}
                onChange={(url) => updateThemeColor('logo', url)}
              />

              <ImageUpload
                label="Customer App Header Banner URL"
                value={theme.bannerUrl}
                onChange={(url) => updateThemeColor('bannerUrl', url)}
              />

              {/* TYPOGRAPHY & SHAPE CORNERS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Font Style</label>
                  <select
                    value={theme.fontFamily || 'sans'}
                    onChange={(e) => updateThemeColor('fontFamily', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                  >
                    <option value="sans">Sans-Serif (Modern & Clean)</option>
                    <option value="serif">Serif (Luxury & Classic)</option>
                    <option value="mono">Monospace (Tech & Minimal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">UI Corner Radius</label>
                  <select
                    value={theme.borderRadius || 'lg'}
                    onChange={(e) => updateThemeColor('borderRadius', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                  >
                    <option value="none">Square (0px)</option>
                    <option value="sm">Subtle (4px)</option>
                    <option value="md">Rounded (8px)</option>
                    <option value="lg">Soft Rounded (16px)</option>
                    <option value="full">Pill (9999px)</option>
                  </select>
                </div>
              </div>

              {/* LIVE THEME & CURRENCY PREVIEW */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Live Customer QR Preview
                  </p>
                  <span className="text-[10px] text-slate-400">Updates live in real-time</span>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {theme.logo && (
                      <img src={theme.logo} alt="Logo preview" className="w-10 h-10 rounded-xl object-cover" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-white">{theme.restaurantName || 'Restaurant Name'}</p>
                      <p className="text-[10px] text-slate-400">Featured Menu Item • Special Chef Curry</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-emerald-400">
                      {formatCurrency(350, theme.currency || 'INR (₹)')}
                    </p>
                    <span className="text-[9px] text-slate-400">Inc. local taxes</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div
                    className="h-9 flex-1 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-sm"
                    style={{ backgroundColor: theme.primaryColor || '#e11d48' }}
                  >
                    Add Order • {formatCurrency(350, theme.currency || 'INR (₹)')}
                  </div>
                  <div
                    className="h-9 flex-1 rounded-xl flex items-center justify-center font-bold text-xs text-white"
                    style={{ backgroundColor: theme.secondaryColor || '#475569' }}
                  >
                    Call Waiter 🔔
                  </div>
                </div>
              </div>

              {/* SAVE BUTTON */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="brand"
                  onClick={async () => {
                    if (currentRestaurant) {
                      await api.updateRestaurantTheme(currentRestaurant.id, theme);
                      await api.updateRestaurantDetails(currentRestaurant.id, {
                        name: theme.restaurantName || currentRestaurant.name,
                        currency: theme.currency || currentRestaurant.currency,
                      });
                    }
                    addToast(
                      'success',
                      'Settings & Branding Saved! 🎨',
                      `Base currency updated to ${theme.currency || 'INR (₹)'}. Database and live customer apps synced!`
                    );
                    await loadData();
                  }}
                  className="px-6 py-2.5 font-bold text-sm"
                >
                  Save & Publish Settings & Theme Engine
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Workspace & Terminal Configuration */}
        {activeTab === 'workspace_settings' && (
          <WorkspaceSettingsTab
            restaurant={currentRestaurant}
            onRefreshRestaurant={loadData}
            addToast={addToast}
          />
        )}

        {/* Tab: Business Day & Day Management */}
        {(activeTab === 'business_day' || activeTab === 'day_management') && (
          <DayManagementView
            currentRestaurant={currentRestaurant}
            currentBusinessDay={currentBusinessDay}
            businessDayHistory={businessDayHistory}
            orders={orders}
            tables={tables}
            bills={bills}
            theme={theme}
            currentUser={currentUser}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
            onRefreshData={loadData}
            addToast={addToast}
          />
        )}
      </main>

      {/* QR Code Modal */}
      <Modal
        isOpen={!!selectedTableQR}
        onClose={() => setSelectedTableQR(null)}
        title={`Custom QR Standee & Studio for ${selectedTableQR?.tableNumber}`}
        maxWidth="2xl"
      >
        {selectedTableQR && (
          <QRCodeDisplay
            url={getRestaurantCustomerUrl(currentRestaurant, selectedTableQR.tableNumber, selectedTableQR.id)}
            tableId={selectedTableQR.id}
            tableNumber={selectedTableQR.tableNumber}
            restaurantName={currentRestaurant?.name || theme.restaurantName || 'Lumière Bistro'}
            restaurantLogo={theme.logo}
            restaurantId={currentRestaurant?.id}
            section={selectedTableQR.section}
            capacity={selectedTableQR.capacity}
          />
        )}
      </Modal>

      {/* Add Menu Item Modal */}
      <Modal
        isOpen={isAddItemModalOpen}
        onClose={() => setIsAddItemModalOpen(false)}
        title="Create New Menu Item"
      >
        <div className="space-y-4">
          <Input
            label="Dish Name *"
            placeholder="e.g. Artisanal Burrata & Fig"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Category *</label>
              <select
                value={newItem.categoryId}
                onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                {menuCatalogMode === 'BAR'
                  ? (barCategories.length > 0 ? barCategories : [
                      { id: 'Beer', name: 'Beer' },
                      { id: 'Wine', name: 'Wine' },
                      { id: 'Whiskey', name: 'Whiskey' },
                      { id: 'Cocktails', name: 'Cocktails' },
                      { id: 'Mocktails', name: 'Mocktails' },
                    ]).map((c: any) => (
                      <option key={c.id || c.name} value={c.name || c.id}>
                        {c.name}
                      </option>
                    ))
                  : (foodCategories.length > 0 ? foodCategories : [
                      { id: 'cat-starters', name: 'Starters & Appetizers' },
                      { id: 'cat-mains', name: 'Main Course' },
                      { id: 'cat-burgers', name: 'Gourmet Burgers' },
                      { id: 'cat-pizza', name: 'Wood-Fired Pizza' },
                      { id: 'cat-desserts', name: 'Desserts & Sweets' },
                    ]).map((cat: any) => (
                      <option key={cat.id || cat.name} value={cat.id || cat.name}>
                        {cat.name}
                      </option>
                    ))}
              </select>
            </div>

            <Input
              label={`Price (${getCurrencySymbol(theme.currency || 'INR (₹)')} ${getCurrencySymbol(theme.currency || 'INR (₹)') === '₹' ? 'INR' : ''}) *`}
              type="number"
              placeholder="250.00"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
            />
          </div>

          {menuCatalogMode === 'FOOD' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Food Type (Dietary) *</label>
              <div className="flex items-center gap-3 p-1.5 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setNewItem({ ...newItem, isVegetarian: true })}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    newItem.isVegetarian
                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-950 shrink-0" />
                  <span>🟢 Veg</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewItem({ ...newItem, isVegetarian: false })}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    !newItem.isVegetarian
                      ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-950 shrink-0" />
                  <span>🔴 Non-Veg</span>
                </button>
              </div>
            </div>
          )}

          <Input
            label="Description"
            placeholder="Ingredients and prep style..."
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
          />

          <ImageUpload
            label="Food Photo (Upload local file or URL)"
            value={newItem.image}
            onChange={(url) => setNewItem({ ...newItem, image: url })}
          />

          <Button variant="brand" className="w-full mt-2" onClick={handleAddItem}>
            Save to Restaurant Menu
          </Button>
        </div>
      </Modal>

      {/* Edit Menu Item Modal */}
      <Modal
        isOpen={isEditItemModalOpen}
        onClose={() => {
          setIsEditItemModalOpen(false);
          setEditingItem(null);
        }}
        title="Edit Menu Item Details"
      >
        {editingItem && (
          <div className="space-y-4">
            <Input
              label="Dish Name *"
              value={editingItem.name}
              onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Category *</label>
                <select
                  value={editingItem.categoryId}
                  onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  {editingItem.targetDestination === 'BAR' || editingItem.isAlcoholic
                    ? (barCategories.length > 0 ? barCategories : [
                        { id: 'Beer', name: 'Beer' },
                        { id: 'Wine', name: 'Wine' },
                        { id: 'Whiskey', name: 'Whiskey' },
                        { id: 'Cocktails', name: 'Cocktails' },
                        { id: 'Mocktails', name: 'Mocktails' },
                      ]).map((c: any) => (
                        <option key={c.id || c.name} value={c.name || c.id}>
                          {c.name}
                        </option>
                      ))
                    : (foodCategories.length > 0 ? foodCategories : [
                        { id: 'cat-starters', name: 'Starters & Appetizers' },
                        { id: 'cat-mains', name: 'Main Course' },
                        { id: 'cat-burgers', name: 'Gourmet Burgers' },
                        { id: 'cat-pizza', name: 'Wood-Fired Pizza' },
                        { id: 'cat-desserts', name: 'Desserts & Sweets' },
                      ]).map((cat: any) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                </select>
              </div>

              <Input
                label={`Price (${getCurrencySymbol(theme.currency || 'INR (₹)')} ${getCurrencySymbol(theme.currency || 'INR (₹)') === '₹' ? 'INR' : ''}) *`}
                type="number"
                value={editingItem.price.toString()}
                onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
              />
            </div>

            {!editingItem.isAlcoholic && editingItem.targetDestination !== 'BAR' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Food Type (Dietary) *</label>
                <div className="flex items-center gap-3 p-1.5 bg-slate-900 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, isVegetarian: true, dietaryType: 'VEG' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      editingItem.isVegetarian !== false && editingItem.dietaryType !== 'NON_VEG'
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-950 shrink-0" />
                    <span>🟢 Veg</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, isVegetarian: false, dietaryType: 'NON_VEG' })}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      editingItem.isVegetarian === false || editingItem.dietaryType === 'NON_VEG'
                        ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-950 shrink-0" />
                    <span>🔴 Non-Veg</span>
                  </button>
                </div>
              </div>
            )}

            <Input
              label="Description"
              value={editingItem.description}
              onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
            />

            <ImageUpload
              label="Food Photo (Upload local file or URL)"
              value={editingItem.image}
              onChange={(url) => setEditingItem({ ...editingItem, image: url })}
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-300 font-medium">Availability Status</span>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setEditingItem({ ...editingItem, isAvailable: !editingItem.isAvailable })}
                className={editingItem.isAvailable ? 'bg-emerald-600 hover:bg-emerald-500' : ''}
              >
                {editingItem.isAvailable ? 'In Stock (Active)' : '86ed (Unavailable)'}
              </Button>
            </div>

            <Button variant="brand" className="w-full mt-2" onClick={handleUpdateItem}>
              Update Menu Item
            </Button>
          </div>
        )}
      </Modal>

      {/* Delete Menu Item Confirmation Modal */}
      <Modal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="Confirm Item Deletion"
      >
        {deletingItem && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-rose-200 text-sm">Delete "{deletingItem.name}"?</h4>
                <p className="text-xs text-rose-300/80 mt-1">
                  This action will permanently remove this item from your digital menu, POS ordering catalog, and customer mobile apps.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setDeletingItem(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteItem} icon={<Trash2 className="w-3.5 h-3.5" />}>
                Delete Item
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Staff Member Modal */}
      <Modal
        isOpen={isAddStaffModalOpen}
        onClose={() => setIsAddStaffModalOpen(false)}
        title="Generate Employee Account & Credentials"
      >
        <div className="space-y-4">
          <Input
            label="Full Name *"
            placeholder="e.g. David Miller"
            value={newStaff.name}
            onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Staff Username *"
              placeholder="e.g. rahul01"
              value={newStaff.username}
              onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
            />
            <Input
              label="Assigned Terminal *"
              placeholder={newStaff.role === 'CHEF' ? 'KITCHEN-01' : newStaff.role === 'WAITER' ? 'WAITER-01' : `${newStaff.role}-01`}
              value={newStaff.terminal}
              onChange={(e) => setNewStaff({ ...newStaff, terminal: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email Address *"
              placeholder="david@lumiere.com"
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
            />
            <Input
              label="Contact Phone"
              placeholder="+1 555-0188"
              value={newStaff.phone}
              onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Staff Role *</label>
              <select
                value={newStaff.role}
                onChange={(e: any) => setNewStaff({ ...newStaff, role: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="MANAGER">Manager</option>
                <option value="CHEF">Kitchen Chef</option>
                <option value="WAITER">Floor Waiter</option>
                <option value="BARTENDER">Bartender</option>
                <option value="CASHIER">Cashier</option>
              </select>
            </div>

            <Input
              label="Hourly Wage (₹ INR)"
              type="number"
              placeholder="350"
              value={newStaff.hourlyRate}
              onChange={(e) => setNewStaff({ ...newStaff, hourlyRate: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Login Password (Portal Credentials)</label>
            <Input
              type="text"
              placeholder={newStaff.role === 'CHEF' ? 'kitchen123' : newStaff.role === 'WAITER' ? 'waiter123' : 'staff123'}
              value={newStaffPassword}
              onChange={(e) => setNewStaffPassword(e.target.value)}
            />
            <p className="text-[10px] text-slate-400">
              Default password if left blank: <code className="text-amber-400 font-mono font-bold">{newStaff.role === 'CHEF' ? 'kitchen123' : newStaff.role === 'WAITER' ? 'waiter123' : 'staff123'}</code>
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Shift Schedule *</label>
            <select
              value={newStaff.shift}
              onChange={(e) => setNewStaff({ ...newStaff, shift: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            >
              <option value="Morning (8AM - 4PM)">Morning Shift (8AM - 4PM)</option>
              <option value="Evening (4PM - 12AM)">Evening Shift (4PM - 12AM)</option>
              <option value="Night (12AM - 8AM)">Night Shift (12AM - 8AM)</option>
              <option value="Full Day (10AM - 10PM)">Full Day (10AM - 10PM)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Floor Station / Duty</label>
            <select
              value={newStaff.assignedSection}
              onChange={(e) => setNewStaff({ ...newStaff, assignedSection: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            >
              <option value="Front Floor & POS">Front Floor & POS</option>
              <option value="Main Kitchen Station">Main Kitchen Station</option>
              <option value="Patio / Outdoor">Patio / Outdoor</option>
              <option value="Bar & Beverage Counter">Bar & Beverage Counter</option>
              <option value="Cashier Counter">Cashier Counter</option>
            </select>
          </div>

          <Button variant="brand" className="w-full mt-2" onClick={handleAddStaff}>
            Generate Employee Account
          </Button>
        </div>
      </Modal>

      {/* Edit Staff Member Modal */}
      <Modal
        isOpen={isEditStaffModalOpen}
        onClose={() => setIsEditStaffModalOpen(false)}
        title="Edit Staff Member Details"
      >
        {editingStaff && (
          <div className="space-y-4">
            <Input
              label="Full Name *"
              value={editingStaff.name}
              onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Email Address *"
                value={editingStaff.email}
                onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
              />
              <Input
                label="Phone Number"
                value={editingStaff.phone}
                onChange={(e) => setEditingStaff({ ...editingStaff, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Assigned Role</label>
                <select
                  value={editingStaff.role}
                  onChange={(e: any) => setEditingStaff({ ...editingStaff, role: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="MANAGER">Manager</option>
                  <option value="CHEF">Kitchen Chef</option>
                  <option value="WAITER">Floor Waiter</option>
                  <option value="BARTENDER">Bartender</option>
                  <option value="CASHIER">Cashier</option>
                </select>
              </div>

              <Input
                label="Assigned Terminal"
                placeholder={editingStaff.role ? `${editingStaff.role}-01` : 'WAITER-01'}
                value={editingStaff.terminal || editingStaff.terminalId || ''}
                onChange={(e) => setEditingStaff({ ...editingStaff, terminal: e.target.value, terminalId: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Shift Schedule</label>
              <select
                value={editingStaff.shift || 'Evening (4PM - 12AM)'}
                onChange={(e) => setEditingStaff({ ...editingStaff, shift: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="Morning (8AM - 4PM)">Morning Shift (8AM - 4PM)</option>
                <option value="Evening (4PM - 12AM)">Evening Shift (4PM - 12AM)</option>
                <option value="Night (12AM - 8AM)">Night Shift (12AM - 8AM)</option>
                <option value="Full Day (10AM - 10PM)">Full Day (10AM - 10PM)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Floor Station / Duty</label>
              <select
                value={editingStaff.assignedSection || 'Front Floor & POS'}
                onChange={(e) => setEditingStaff({ ...editingStaff, assignedSection: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="Front Floor & POS">Front Floor & POS</option>
                <option value="Main Kitchen Station">Main Kitchen Station</option>
                <option value="Patio / Outdoor">Patio / Outdoor</option>
                <option value="Bar & Beverage Counter">Bar & Beverage Counter</option>
                <option value="Cashier Counter">Cashier Counter</option>
              </select>
            </div>

            <Button variant="brand" className="w-full mt-2" onClick={handleSaveEditStaff}>
              Save Staff Changes
            </Button>
          </div>
        )}
      </Modal>

      {/* Reset Staff Password Modal */}
      <Modal
        isOpen={isResetPassModalOpen}
        onClose={() => setIsResetPassModalOpen(false)}
        title="Reset Employee Portal Password"
      >
        {resetPassStaff && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <p className="font-bold text-white mb-0.5">Resetting Password for {resetPassStaff.name}</p>
                <p className="text-[11px] text-slate-400">
                  Assigned Email: <span className="font-mono text-amber-300">{resetPassStaff.email}</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">New Password</label>
              <Input
                type="text"
                value={generatedPass}
                onChange={(e) => setGeneratedPass(e.target.value)}
                className="font-mono font-bold text-amber-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsResetPassModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="brand" size="sm" onClick={handleConfirmResetPassword} icon={<KeyRound className="w-3.5 h-3.5" />}>
                Apply Password
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Raw Material Inventory Modal */}
      <Modal
        isOpen={isAddInventoryModalOpen}
        onClose={() => setIsAddInventoryModalOpen(false)}
        title="Add Raw Material / Stock Item 📦"
      >
        <div className="space-y-4">
          <Input
            label="Raw Material / Item Name *"
            placeholder="e.g. Organic Extra Virgin Olive Oil, Gin, Wagyu"
            value={newInventory.name}
            onChange={(e) => setNewInventory({ ...newInventory, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Inventory Division *</label>
              <select
                value={newInventory.station}
                onChange={(e) => setNewInventory({ ...newInventory, station: e.target.value as 'KITCHEN' | 'BAR' })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="KITCHEN">👨‍🍳 Kitchen Inventory</option>
                <option value="BAR">🍸 Bar Inventory</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Category *</label>
              <select
                value={newInventory.category}
                onChange={(e) => setNewInventory({ ...newInventory, category: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="Meat & Poultry">Meat & Poultry</option>
                <option value="Dairy & Cheese">Dairy & Cheese</option>
                <option value="Oils & Condiments">Oils & Condiments</option>
                <option value="Grains & Flour">Grains & Flour</option>
                <option value="Produce & Herbs">Produce & Herbs</option>
                <option value="Beverages & Wine">Beverages & Wine</option>
                <option value="Spirits & Mixers">Spirits & Mixers</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Stock Quantity *"
              type="number"
              value={newInventory.quantity}
              onChange={(e) => setNewInventory({ ...newInventory, quantity: e.target.value })}
            />
            <Input
              label="Min Alert Level"
              type="number"
              value={newInventory.minThreshold}
              onChange={(e) => setNewInventory({ ...newInventory, minThreshold: e.target.value })}
            />
            <Input
              label={`Unit Cost (${getCurrencySymbol(theme.currency || 'INR (₹)')}) *`}
              type="number"
              placeholder="150.00"
              value={newInventory.costPerUnit}
              onChange={(e) => setNewInventory({ ...newInventory, costPerUnit: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Select Active Supplier</label>
              <select
                value={newInventory.supplierId}
                onChange={(e) => {
                  const sId = e.target.value;
                  const s = suppliers.find((x) => x.id === sId);
                  setNewInventory({
                    ...newInventory,
                    supplierId: sId,
                    supplierName: s?.name || '',
                    supplierContact: s?.phone || '',
                  });
                }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="">-- Pick Active Vendor --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplyCategory || 'Vendor'})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Storage Location"
              placeholder="Cold Storage #1 / Bar Cellar"
              value={newInventory.storageLocation}
              onChange={(e) => setNewInventory({ ...newInventory, storageLocation: e.target.value })}
            />
          </div>

          <Button variant="brand" className="w-full mt-2" onClick={handleAddInventory}>
            Add Item to Inventory
          </Button>
        </div>
      </Modal>

      {/* Register Supplier Modal */}
      <Modal
        isOpen={isAddSupplierModalOpen}
        onClose={() => setIsAddSupplierModalOpen(false)}
        title="Register New Vendor & Supplier 🏢"
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Supplier Company Name *"
            placeholder="e.g. Ayaan Food Industry, Apex Beverages Co."
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Person / Rep"
              placeholder="e.g. Ayaan Ahmad"
              value={newSupplier.contactPerson}
              onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Supply Category</label>
              <select
                value={newSupplier.supplyCategory}
                onChange={(e) => setNewSupplier({ ...newSupplier, supplyCategory: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="Dairy & Cheese">Dairy & Cheese</option>
                <option value="Produce & Veggies">Produce & Veggies</option>
                <option value="Spirits & Wines">Spirits & Wines</option>
                <option value="Meat & Poultry">Meat & Poultry</option>
                <option value="Bakery & Flour">Bakery & Flour</option>
                <option value="General Pantry">General Pantry</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              placeholder="+91 98765-43210"
              value={newSupplier.phone}
              onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="supply@vendor.com"
              value={newSupplier.email}
              onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
            />
          </div>

          <Input
            label="Warehouse Address"
            placeholder="Warehouse #4, Industrial Zone"
            value={newSupplier.address}
            onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
          />

          <Button variant="brand" className="w-full mt-2" onClick={handleAddSupplier}>
            Save Supplier & Add to Registry
          </Button>
        </div>
      </Modal>

      {/* Multi-Restaurant & Branch Selector Modal */}
      <Modal
        isOpen={isOutletModalOpen}
        onClose={() => setIsOutletModalOpen(false)}
        title="Multi-Restaurant & Branch Portfolio"
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Store className="w-5 h-5 text-rose-400" />
              <div>
                <p className="text-xs font-bold text-white">Active Organization Outlets</p>
                <p className="text-[11px] text-slate-400">Switch context to manage a different restaurant location</p>
              </div>
            </div>
            <Button
              variant="brand"
              size="sm"
              onClick={() => setIsAddBranchModalOpen(true)}
              icon={<Plus className="w-3.5 h-3.5" />}
              className="text-xs shrink-0"
            >
              Add New Branch
            </Button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {allMyRestaurants.map((r) => {
              const isActive = r.id === currentRestaurant?.id;
              return (
                <div
                  key={r.id}
                  onClick={() => !isActive && handleSwitchRestaurant(r.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isActive
                      ? 'bg-rose-500/10 border-rose-500/50 shadow-md ring-1 ring-rose-500/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={r.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                      alt={r.name}
                      className="w-11 h-11 rounded-2xl object-cover border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate">{r.name}</h4>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500 text-white shrink-0">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          {r.branchName || r.city || 'Flagship'}
                        </span>
                        <span>•</span>
                        <span className="text-amber-400 font-mono font-semibold">{r.cuisine}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-mono">
                        <span>{r.tablesCount || 12} Tables</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-bold">{r.activeOrdersCount || 0} Active Orders</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {isActive ? (
                      <Badge variant="success">Active OS</Badge>
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs">
                        Switch Context
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Add New Restaurant Branch Modal */}
      <Modal
        isOpen={isAddBranchModalOpen}
        onClose={() => setIsAddBranchModalOpen(false)}
        title="Register New Restaurant Branch Outlet"
      >
        <div className="space-y-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="text-xs text-slate-300">
              <p className="font-bold text-white mb-0.5">Multi-Location Branch Multi-Tenancy</p>
              <p className="text-[11px] text-slate-400">
                This will provision an isolated POS queue, KDS kitchen display, floor plan, and staff roster linked under your primary account.
              </p>
            </div>
          </div>

          <Input
            label="Branch / Restaurant Name *"
            placeholder="e.g. Lumière Bistro - Uptown Branch"
            value={newBranchData.name}
            onChange={(e) => setNewBranchData({ ...newBranchData, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Branch Tag / Location"
              placeholder="e.g. Uptown San Francisco"
              value={newBranchData.branchName}
              onChange={(e) => setNewBranchData({ ...newBranchData, branchName: e.target.value })}
            />
            <Input
              label="City Location"
              placeholder="e.g. San Francisco"
              value={newBranchData.city}
              onChange={(e) => setNewBranchData({ ...newBranchData, city: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Street Address"
              placeholder="1200 Market Street"
              value={newBranchData.address}
              onChange={(e) => setNewBranchData({ ...newBranchData, address: e.target.value })}
            />
            <Input
              label="Contact Phone"
              placeholder="+1 555-0188"
              value={newBranchData.phone}
              onChange={(e) => setNewBranchData({ ...newBranchData, phone: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Cuisine Focus</label>
            <Input
              placeholder="e.g. Modern French & Tapas"
              value={newBranchData.cuisine}
              onChange={(e) => setNewBranchData({ ...newBranchData, cuisine: e.target.value })}
            />
          </div>

          <Button variant="brand" className="w-full mt-2" onClick={handleCreateBranch}>
            Deploy New Branch Outlet
          </Button>
        </div>
      </Modal>

      {/* Modal 1: Create New Table */}
      <Modal
        isOpen={isCreateTableModalOpen}
        onClose={() => setIsCreateTableModalOpen(false)}
        title="Create Floor Plan Table"
      >
        <div className="space-y-4">
          <Input
            label="Table Number / Label *"
            placeholder="e.g. Table 09 or Terrace B1"
            value={newTableData.tableNumber}
            onChange={(e) => setNewTableData({ ...newTableData, tableNumber: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Seating Capacity *"
              type="number"
              placeholder="4"
              value={newTableData.capacity}
              onChange={(e) => setNewTableData({ ...newTableData, capacity: e.target.value })}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Dining Section</label>
              <select
                value={newTableData.section}
                onChange={(e) => setNewTableData({ ...newTableData, section: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="Main Hall">Main Hall</option>
                <option value="Patio Deck">Patio Deck</option>
                <option value="Rooftop">Rooftop Lounge / Terrace</option>
                <option value="VIP Lounge">VIP Lounge</option>
                <option value="Garden Court">Garden Court</option>
                <option value="Bar Counter">Bar Counter</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Table Shape</label>
              <select
                value={newTableData.shape}
                onChange={(e: any) => setNewTableData({ ...newTableData, shape: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="RECTANGLE">Rectangle</option>
                <option value="SQUARE">Square</option>
                <option value="ROUND">Round</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="isVipCheck"
                checked={newTableData.isVip}
                onChange={(e) => setNewTableData({ ...newTableData, isVip: e.target.checked })}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <label htmlFor="isVipCheck" className="text-xs font-bold text-slate-200 cursor-pointer">
                Flag as VIP Table ⭐
              </label>
            </div>
          </div>

          <Button
            variant="brand"
            className="w-full mt-2"
            onClick={handleCreateTable}
            disabled={isCreatingTable}
            icon={<Plus className="w-4 h-4" />}
          >
            {isCreatingTable ? 'Creating...' : 'Create Table & Generate QR'}
          </Button>
        </div>
      </Modal>

      {/* Modal 2: Edit Table Modal */}
      <Modal
        isOpen={isEditTableModalOpen}
        onClose={() => setIsEditTableModalOpen(false)}
        title={`Edit ${editingTable?.tableNumber || 'Table'}`}
      >
        {editingTable && (
          <div className="space-y-4">
            <Input
              label="Table Number / Name *"
              value={editingTable.tableNumber}
              onChange={(e) => setEditingTable({ ...editingTable, tableNumber: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Capacity (Seats) *"
                type="number"
                value={editingTable.capacity}
                onChange={(e) => setEditingTable({ ...editingTable, capacity: parseInt(e.target.value) || 4 })}
              />

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Section</label>
                <select
                  value={editingTable.section || 'Main Hall'}
                  onChange={(e) => setEditingTable({ ...editingTable, section: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="Main Hall">Main Hall</option>
                  <option value="Patio Deck">Patio Deck</option>
                  <option value="Rooftop">Rooftop Lounge / Terrace</option>
                  <option value="VIP Lounge">VIP Lounge</option>
                  <option value="Garden Court">Garden Court</option>
                  <option value="Bar Counter">Bar Counter</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Table Shape</label>
                <select
                  value={editingTable.shape || 'RECTANGLE'}
                  onChange={(e: any) => setEditingTable({ ...editingTable, shape: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                >
                  <option value="RECTANGLE">Rectangle</option>
                  <option value="SQUARE">Square</option>
                  <option value="ROUND">Round</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="editIsVipCheck"
                  checked={editingTable.isVip || false}
                  onChange={(e) => setEditingTable({ ...editingTable, isVip: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <label htmlFor="editIsVipCheck" className="text-xs font-bold text-slate-200 cursor-pointer">
                  VIP Table Flag ⭐
                </label>
              </div>
            </div>

            <Button variant="brand" className="w-full mt-2" onClick={handleUpdateTableDetails}>
              Save Table Changes
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal 3: Merge Tables for Gathering */}
      <Modal
        isOpen={isMergeTablesModalOpen}
        onClose={() => setIsMergeTablesModalOpen(false)}
        title="Merge Tables for Large Gathering / Event"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            Select 2 or more tables to combine into a unified merged seating layout.
            Notifications will be broadcasted to Kitchen, Waiters, and Manager terminals.
          </p>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            <label className="text-xs font-bold text-slate-300">Select Tables to Merge:</label>
            {tables.map((t) => {
              const isSelected = selectedTableIdsForMerge.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedTableIdsForMerge((prev) => prev.filter((id) => id !== t.id));
                    } else {
                      setSelectedTableIdsForMerge((prev) => [...prev, t.id]);
                    }
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500/80 text-white font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <div>
                      <p className="text-xs font-bold text-white">{t.tableNumber}</p>
                      <p className="text-[10px] text-slate-400">{t.section} • {t.capacity} Seats</p>
                    </div>
                  </div>
                  <Badge variant={t.status === 'AVAILABLE' ? 'success' : 'outline'}>{t.status}</Badge>
                </div>
              );
            })}
          </div>

          <Input
            label="Custom Merged Group Label (Optional)"
            placeholder="e.g. Executive Banquet (Table 07 + Table 08)"
            value={customMergeLabel}
            onChange={(e) => setCustomMergeLabel(e.target.value)}
          />

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs flex justify-between font-mono">
            <span className="text-slate-400">Selected Count:</span>
            <span className="font-bold text-amber-400">{selectedTableIdsForMerge.length} Tables</span>
          </div>

          <Button
            variant="brand"
            className="w-full mt-2"
            onClick={handleMergeTables}
            disabled={selectedTableIdsForMerge.length < 2}
            icon={<Link className="w-4 h-4" />}
          >
            Confirm & Merge Selected Tables
          </Button>
        </div>
      </Modal>

      {/* Modal 4: Reserve Table Modal */}
      <Modal
        isOpen={isReserveTableModalOpen}
        onClose={() => setIsReserveTableModalOpen(false)}
        title={`Reserve ${tableToReserve?.tableNumber || 'Table'} for Guest`}
      >
        <div className="space-y-4">
          <Input
            label="Reserved Guest Name *"
            placeholder="e.g. Dr. Harrison Vance"
            value={reservationForm.reservedForName}
            onChange={(e) => setReservationForm({ ...reservationForm, reservedForName: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Phone"
              placeholder="(555) 234-5678"
              value={reservationForm.reservedForPhone}
              onChange={(e) => setReservationForm({ ...reservationForm, reservedForPhone: e.target.value })}
            />

            <Input
              label="Reservation Time *"
              placeholder="e.g. 7:30 PM"
              value={reservationForm.reservationTime}
              onChange={(e) => setReservationForm({ ...reservationForm, reservationTime: e.target.value })}
            />
          </div>

          <Input
            label="Expected Party Size *"
            type="number"
            value={reservationForm.partySize}
            onChange={(e) => setReservationForm({ ...reservationForm, partySize: e.target.value })}
          />

          <Input
            label="Special Requests / Notes"
            placeholder="e.g. Quiet window corner, celebrating 10th anniversary"
            value={reservationForm.notes}
            onChange={(e) => setReservationForm({ ...reservationForm, notes: e.target.value })}
          />

          <Button variant="brand" className="w-full mt-2" onClick={handleReserveTable} icon={<Calendar className="w-4 h-4" />}>
            Lock Table & Save Reservation
          </Button>
        </div>
      </Modal>

      {/* Manage Menu Categories Modal */}
      <Modal
        isOpen={isManageCategoriesModalOpen}
        onClose={() => {
          setIsManageCategoriesModalOpen(false);
          setEditingCategory(null);
          setDeletingCategory(null);
        }}
        title="Manage Menu Categories (Add, Edit, Delete)"
      >
        <div className="space-y-5">
          {/* Mode Switcher */}
          <div className="flex items-center justify-between p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setCategoryModalMode('FOOD')}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                categoryModalMode === 'FOOD'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" /> Food Categories ({foodCategories.length})
            </button>

            <button
              onClick={() => setCategoryModalMode('BAR')}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                categoryModalMode === 'BAR'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wine className="w-3.5 h-3.5" /> Bar Categories ({barCategories.length})
            </button>
          </div>

          {/* Add Category Input Box */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              Add New {categoryModalMode === 'FOOD' ? 'Food' : 'Bar'} Category Name
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder={categoryModalMode === 'FOOD' ? 'e.g. Seafood, Tacos, Vegan Delights...' : 'e.g. Craft Beer, Single Malt, Cocktails...'}
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <Button
                variant="brand"
                size="sm"
                onClick={handleAddCategory}
                className={categoryModalMode === 'BAR' ? 'bg-purple-600 hover:bg-purple-500 font-bold shrink-0' : 'shrink-0'}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Categories List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase">Existing Categories</h4>
            {(categoryModalMode === 'FOOD' ? foodCategories : barCategories).length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 text-center">No custom categories created yet.</p>
            ) : (
              (categoryModalMode === 'FOOD' ? foodCategories : barCategories).map((cat) => {
                const itemCount = menuItems.filter(
                  (i) => i.categoryId === cat.id || i.categoryId === cat.name || i.barCategory === cat.name
                ).length;

                const isEditingThis = editingCategory?.id === cat.id;

                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800/80 rounded-xl text-xs"
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <Input
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                          className="text-xs"
                        />
                        <Button variant="brand" size="sm" onClick={handleUpdateCategory} icon={<Save className="w-3.5 h-3.5" />} className="bg-emerald-600 hover:bg-emerald-500">
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingCategory(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{cat.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}
                            className="text-slate-400 hover:text-amber-300 px-2 py-1 text-xs"
                            icon={<Edit className="w-3.5 h-3.5" />}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingCategory({ id: cat.id, name: cat.name, type: categoryModalMode });
                            }}
                            className="text-slate-500 hover:text-rose-400 px-2 py-1 text-xs"
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                          >
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Category Confirmation Modal */}
      <Modal
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        title="Confirm Category Deletion"
      >
        {deletingCategory && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-rose-200 text-sm">Delete Category "{deletingCategory.name}"?</h4>
                <p className="text-xs text-rose-300/80 mt-1">
                  This will permanently remove the category. Any items assigned to this category will remain in your catalog.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setDeletingCategory(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteCategory} icon={<Trash2 className="w-3.5 h-3.5" />}>
                Delete Category
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bill Details Modal for Owner / Cashier */}
      <Modal
        isOpen={!!selectedBillDetails}
        onClose={() => setSelectedBillDetails(null)}
        title={`Official Tax Invoice — ${selectedBillDetails?.invoiceNumber || selectedBillDetails?.id} 🧾`}
      >
        {selectedBillDetails && (
          <div className="space-y-4 text-xs printable-receipt">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 font-mono">
                <span className="text-slate-400">Invoice #: <strong className="text-emerald-400">{selectedBillDetails.invoiceNumber || selectedBillDetails.id}</strong></span>
                <span className="text-slate-400">{new Date(selectedBillDetails.createdAt).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div>Table: <strong className="text-white">{selectedBillDetails.tableNumber}</strong></div>
                <div>Session: <strong className="text-emerald-400">#{String(selectedBillDetails.tableSessionId).slice(-6)}</strong></div>
                <div>Payment Method: <strong className="text-amber-400">{(selectedBillDetails.paymentMethod || 'CASH').toUpperCase()}</strong></div>
                <div>
                  Status:{' '}
                  <strong className={selectedBillDetails.paymentStatus === 'PAID' ? 'text-emerald-400' : 'text-amber-400'}>
                    {selectedBillDetails.paymentStatus === 'PAID' ? 'PAID & VERIFIED ✅' : selectedBillDetails.paymentStatus}
                  </strong>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-300 uppercase text-[11px]">Itemized Tax Invoice Breakdown</h5>
              <div className="divide-y divide-slate-800 bg-slate-950 p-3 rounded-2xl border border-slate-800 max-h-52 overflow-y-auto">
                {selectedBillDetails.items.map((i, idx) => (
                  <div key={idx} className="py-1.5 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white">{i.name}</span> × {i.quantity}
                      {i.station === 'BAR' && <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">BAR</span>}
                    </div>
                    <span className="font-mono font-bold text-white">{formatCurrency(i.totalPrice, theme.currency || 'INR (₹)')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedBillDetails.subtotal, theme.currency || 'INR (₹)')}</span>
              </div>

              {(selectedBillDetails.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount ({selectedBillDetails.discountPercentage || 0}%):</span>
                  <span>-{formatCurrency(selectedBillDetails.discountAmount, theme.currency || 'INR (₹)')}</span>
                </div>
              )}

              {(selectedBillDetails.serviceChargeAmount || 0) > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Service Charge ({selectedBillDetails.serviceChargePercentage || 0}%):</span>
                  <span>{formatCurrency(selectedBillDetails.serviceChargeAmount, theme.currency || 'INR (₹)')}</span>
                </div>
              )}

              {selectedBillDetails.taxBreakdown && selectedBillDetails.taxBreakdown.length > 0 ? (
                selectedBillDetails.taxBreakdown.map((t, idx) => (
                  <div key={idx} className="flex justify-between text-slate-400">
                    <span>{t.name || t.taxName || 'GST'} ({t.rate || t.taxRate || 0}%{t.isInclusive ? ' Incl.' : ''}):</span>
                    <span>{formatCurrency(t.amount || t.taxAmount || 0, theme.currency || 'INR (₹)')}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-slate-400">
                  <span>GST / Taxes:</span>
                  <span>{formatCurrency(selectedBillDetails.taxAmount, theme.currency || 'INR (₹)')}</span>
                </div>
              )}

              {selectedBillDetails.roundOffAmount && selectedBillDetails.roundOffAmount !== 0 ? (
                <div className="flex justify-between text-slate-400">
                  <span>Round Off:</span>
                  <span>{formatCurrency(selectedBillDetails.roundOffAmount, theme.currency || 'INR (₹)')}</span>
                </div>
              ) : null}

              <div className="flex justify-between text-emerald-400 font-black pt-2 border-t border-slate-800 text-sm">
                <span>GRAND TOTAL:</span>
                <span className="text-base">{formatCurrency(selectedBillDetails.grandTotal, theme.currency || 'INR (₹)')}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap justify-end gap-2">
              {selectedBillDetails.paymentStatus !== 'PAID' && (
                <Button
                  onClick={() => {
                    setPaymentBillModal(selectedBillDetails);
                    setPaymentMethodInput('CASH');
                    setSelectedBillDetails(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Record Manual Payment 💳
                </Button>
              )}

              <Button
                onClick={() => downloadDigitalReceiptPNG(selectedBillDetails, currentRestaurant?.legalName || currentRestaurant?.name || theme.restaurantName || 'Restaurant')}
                variant="brand"
                className="flex items-center gap-1.5 cursor-pointer shadow-md text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Tax Invoice (.png)</span>
              </Button>

              <Button onClick={() => setSelectedBillDetails(null)} variant="outline" className="border-slate-800 text-slate-300 text-xs">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment Recording Modal */}
      <Modal
        isOpen={!!paymentBillModal}
        onClose={() => setPaymentBillModal(null)}
        title="Record Bill Payment 💳"
      >
        {paymentBillModal && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Settlement Amount</span>
              <p className="text-3xl font-black text-emerald-400 font-mono">
                {formatCurrency(paymentBillModal.grandTotal, theme.currency || 'INR (₹)')}
              </p>
              <p className="text-slate-400 font-mono text-[11px]">
                Table {paymentBillModal.tableNumber} • {paymentBillModal.invoiceNumber || paymentBillModal.id}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Select Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['CASH', 'UPI', 'CARD', 'OTHER'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethodInput(method)}
                      className={`p-2.5 rounded-xl border text-center font-bold font-mono transition-all text-xs cursor-pointer ${
                        paymentMethodInput === method
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Verified By (Staff / Cashier Name)</label>
                <input
                  type="text"
                  value={paymentVerifiedByInput}
                  onChange={(e) => setPaymentVerifiedByInput(e.target.value)}
                  placeholder="Manager / Cashier Name"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Transaction / Reference ID (Optional)</label>
                <input
                  type="text"
                  value={paymentRefInput}
                  onChange={(e) => setPaymentRefInput(e.target.value)}
                  placeholder="e.g. UPI Ref #439281982 or POS Slip #128"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPaymentBillModal(null)}
                className="border-slate-800 text-slate-400"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const updated = await api.markBillPayment(
                      currentRestaurant?.id || api.getCurrentRestaurantId() || '',
                      paymentBillModal.id,
                      paymentMethodInput,
                      paymentVerifiedByInput || 'Staff',
                      paymentRefInput || undefined
                    );
                    addToast('success', 'Payment Confirmed & Recorded 🎉', `₹${updated.grandTotal.toFixed(2)} marked PAID via ${updated.paymentMethod}`);
                    setPaymentBillModal(null);
                    setPaymentRefInput('');
                    await loadData();
                  } catch (err: any) {
                    addToast('error', 'Payment Error', err.message || 'Failed to record payment');
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5"
              >
                Confirm & Record Payment ✅
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
