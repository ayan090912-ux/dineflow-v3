import React, { useState, useEffect } from 'react';
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
  Eye,
  Edit,
  Save,
  RotateCcw,
  Edit3,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Unlock,
  Copy,
  Check,
  Building2,
  ChevronDown,
  GitBranch,
  MapPin,
  Store,
  Layers,
  Calendar,
  UserCheck,
  Link,
  Unlink,
  Phone,
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
  Avatar,
  SearchInput,
  ImageUpload,
  ToastContainer,
  ToastMessage,
} from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { CURRENCY_OPTIONS, getCurrencySymbol, formatCurrency } from '../../packages/utils/currency';
import { api } from '../../packages/api/client';
import { Order, MenuItem, Table, Employee, InventoryItem, OrderStatus } from '../../packages/types';
import { MOCK_CATEGORIES } from '../../packages/data/mockData';
import { KitchenETADashboard } from './KitchenETADashboard';
import { WaiterTerminalOS } from '../waiter/WaiterTerminalOS';
import { BarTerminal } from '../bar/BarTerminal';
import { realtimeBus } from '../../packages/api/realtime';

interface RestaurantAppProps {
  onEditSetup?: () => void;
  onLogout?: () => void;
}

export const RestaurantApp: React.FC<RestaurantAppProps> = ({ onEditSetup, onLogout }) => {
  const { theme, updateThemeColor, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'kitchen' | 'bar' | 'tables' | 'menu' | 'staff' | 'inventory' | 'theme' | 'waiter'>('dashboard');

  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: 'cat-1',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
  });

  // Menu Search, Filter, Edit & Delete State
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('ALL');

  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);

  const filteredMenuItems = menuItems.filter((item) => {
    const matchesCategory = selectedMenuCategory === 'ALL' || item.categoryId === selectedMenuCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
      item.price.toString().includes(menuSearchQuery);
    return matchesCategory && matchesSearch;
  });

  // Staff Management State
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    role: 'WAITER' as Employee['role'],
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
  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);
  const [newInventory, setNewInventory] = useState({
    name: '',
    category: 'Meat & Poultry',
    quantity: '25',
    unit: 'kg',
    minThreshold: '5',
    costPerUnit: '12.00',
    supplierName: 'Prime Choice Foods',
    supplierContact: '+1 800-555-0199',
    storageLocation: 'Cold Storage #1',
  });

  const [selectedTableQR, setSelectedTableQR] = useState<Table | null>(null);

  // Table Management & Reservation State
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
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

  const [currentRestaurant, setCurrentRestaurant] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

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

  const handleSwitchRestaurant = async (restId: string) => {
    api.switchActiveRestaurant(restId);
    await loadData();
    setIsOutletModalOpen(false);
    addToast('success', 'Switched Active Restaurant Outlet 🏪', `Now viewing operational dashboard.`);
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
    await api.createTable({
      tableNumber: newTableData.tableNumber,
      capacity: parseInt(newTableData.capacity) || 4,
      section: newTableData.section,
      shape: newTableData.shape,
      isVip: newTableData.isVip,
    });
    addToast('success', 'Table Created! 🪑', `${newTableData.tableNumber} added to ${newTableData.section}.`);
    setIsCreateTableModalOpen(false);
    setNewTableData({
      tableNumber: '',
      capacity: '4',
      section: 'Main Hall',
      shape: 'RECTANGLE',
      isVip: false,
    });
    await loadData();
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
    addToast('success', 'Table Updated! 📝', `${editingTable.tableNumber} updated successfully.`);
    setIsEditTableModalOpen(false);
    setEditingTable(null);
    await loadData();
  };

  const handleDeleteTable = async (tableId: string, tableNumber: string) => {
    if (confirm(`Are you sure you want to remove ${tableNumber} from floor plan?`)) {
      await api.deleteTable(tableId);
      addToast('success', 'Table Removed 🗑️', `${tableNumber} deleted.`);
      await loadData();
    }
  };

  const handleMergeTables = async () => {
    if (selectedTableIdsForMerge.length < 2) {
      addToast('error', 'Merge Failed', 'Please select at least 2 tables to merge.');
      return;
    }
    const res = await api.mergeTables(selectedTableIdsForMerge, customMergeLabel);
    if (res.success) {
      addToast('success', 'Tables Merged Successfully! 🔗', 'Kitchen, Waiters, and Staff notified.');
      setIsMergeTablesModalOpen(false);
      setSelectedTableIdsForMerge([]);
      setCustomMergeLabel('');
      await loadData();
    }
  };

  const handleUnmergeTables = async (tableIds: string[]) => {
    await api.unmergeTables(tableIds);
    addToast('success', 'Tables Unmerged 🔓', 'Tables split back into individual seats.');
    await loadData();
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
    await loadData();
  };

  const handleCancelReservation = async (tableId: string, tableNumber: string) => {
    await api.cancelTableReservation(tableId);
    addToast('info', 'Reservation Cancelled 🔓', `${tableNumber} is now available.`);
    await loadData();
  };

  const handleCheckInGuest = async (tableId: string, tableNumber: string, guestName: string) => {
    await api.checkInReservedTable(tableId);
    addToast('success', 'Guest Seated! 🎉', `${guestName} checked in at ${tableNumber}.`);
    await loadData();
  };

  useEffect(() => {
    loadData();

    const unsubscribe = realtimeBus.subscribe((event) => {
      loadData();
      if (event.type === 'OrderCreated') {
        addToast('info', 'New Customer Order Received! 🛎️', `Table ${event.tableNumber} placed Order #${event.orderId}`);
      } else if (event.type === 'WaiterCalled') {
        addToast('warning', 'Waiter Assistance Call 🔔', `Table ${event.tableNumber} requested waiter support.`);
      } else if (event.type === 'BillRequested') {
        addToast('success', 'Bill Request Received 🧾', `Table ${event.tableNumber} requested final check.`);
      } else if (event.type === 'ETAUpdated') {
        addToast('info', 'ETA Adjusted ⏱️', `Order #${event.orderId} ETA set to ${event.estimatedPrepTimeMinutes}m`);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    const user = api.getCurrentUser();
    const rest = await api.getRestaurantDetails();
    const ownerRests = await api.getOwnerRestaurants();
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

    const o = await api.getOrders(rest.id);
    const m = await api.getMenuItems(rest.id);
    const t = await api.getTables(rest.id);
    const e = await api.getEmployees(rest.id);
    const i = await api.getInventory(rest.id);
    setOrders(o);
    setMenuItems(m);
    setTables(t);
    setEmployees(e);
    setInventory(i);
  };

  const handleRequestLaunch = async () => {
    if (!currentRestaurant) return;
    await api.submitRestaurantLaunch({ id: currentRestaurant.id, name: currentRestaurant.name });
    addToast('success', 'Launch Request Submitted! 🚀', 'Platform Admin will review your restaurant application.');
    loadData();
  };

  const handleResubmitLaunch = async () => {
    if (!currentRestaurant) return;
    await api.resubmitRestaurantLaunch(currentRestaurant.id);
    addToast('success', 'Launch Resubmitted! 🔄', 'Your updated application was sent to Platform Admin.');
    loadData();
  };

  const addToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    await api.updateOrderStatus(orderId, newStatus);
    addToast('info', 'Order Status Updated', `Order #${orderId} moved to ${newStatus}`);
    loadData();
  };

  const handleToggleItemAvailability = async (itemId: string) => {
    await api.toggleMenuItemAvailability(itemId);
    addToast('success', 'Menu Availability Updated');
    loadData();
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price) {
      addToast('error', 'Validation Failed', 'Item name and price are required');
      return;
    }
    const restId = currentRestaurant?.id || 'rest-1';
    await api.addMenuItem({
      restaurantId: restId,
      categoryId: newItem.categoryId,
      name: newItem.name,
      description: newItem.description,
      price: parseFloat(newItem.price),
      image: newItem.image || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
      isAvailable: true,
    });
    addToast('success', 'Menu Item Added', `${newItem.name} added to menu`);
    setIsAddItemModalOpen(false);
    setNewItem({ name: '', description: '', price: '', categoryId: 'cat-1', image: '' });
    loadData();
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
    await api.updateMenuItem(editingItem.id, {
      name: editingItem.name,
      description: editingItem.description,
      price: typeof editingItem.price === 'string' ? parseFloat(editingItem.price) : editingItem.price,
      categoryId: editingItem.categoryId,
      image: editingItem.image,
      isAvailable: editingItem.isAvailable,
    });
    addToast('success', 'Menu Item Updated', `${editingItem.name} updated successfully`);
    setIsEditItemModalOpen(false);
    setEditingItem(null);
    loadData();
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return;
    await api.deleteMenuItem(deletingItem.id);
    addToast('info', 'Menu Item Deleted', `${deletingItem.name} removed from menu`);
    setDeletingItem(null);
    loadData();
  };

  // Staff CRUD Handlers
  const handleAddStaff = async () => {
    if (!newStaff.name) {
      addToast('error', 'Validation Failed', 'Staff member name is required');
      return;
    }
    const restId = currentRestaurant?.id || 'rest-1';
    const initialPass = newStaffPassword || (newStaff.role === 'CHEF' ? 'kitchen123' : newStaff.role === 'WAITER' ? 'waiter123' : 'staff123');
    await api.addEmployee({
      restaurantId: restId,
      name: newStaff.name,
      role: newStaff.role,
      email: newStaff.email || `${newStaff.name.toLowerCase().replace(/\s+/g, '')}@dineflow.com`,
      phone: newStaff.phone || '+1 555-0100',
      status: 'ON_CLOCK',
      shift: newStaff.shift,
      assignedSection: newStaff.assignedSection,
      hourlyRate: parseFloat(newStaff.hourlyRate) || 18,
      password: initialPass,
      isAccountDisabled: false,
    });
    addToast('success', 'Staff Member & Login Credentials Created', `${newStaff.name} can now log in with password: ${initialPass}`);
    setIsAddStaffModalOpen(false);
    setNewStaff({
      name: '',
      role: 'WAITER',
      email: '',
      phone: '',
      shift: 'Evening (4PM - 12AM)',
      assignedSection: 'Front Floor & POS',
      hourlyRate: '18.50',
    });
    setNewStaffPassword('');
    loadData();
  };

  const handleSaveEditStaff = async () => {
    if (!editingStaff) return;
    await api.updateEmployee(editingStaff.id, {
      name: editingStaff.name,
      role: editingStaff.role,
      email: editingStaff.email,
      phone: editingStaff.phone,
      shift: editingStaff.shift,
      assignedSection: editingStaff.assignedSection,
      hourlyRate: editingStaff.hourlyRate,
    });
    addToast('success', 'Staff Record Updated', `${editingStaff.name}'s profile was updated.`);
    setIsEditStaffModalOpen(false);
    setEditingStaff(null);
    loadData();
  };

  const handleToggleAccountDisabled = async (employeeId: string, currentName: string) => {
    const updated = await api.toggleEmployeeAccountStatus(employeeId);
    if (updated) {
      if (updated.isAccountDisabled) {
        addToast('warning', 'Staff Account Access Disabled', `${currentName} can no longer log in.`);
      } else {
        addToast('success', 'Staff Account Access Restored', `${currentName} can now log in.`);
      }
    }
    loadData();
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
    loadData();
  };

  const handleDeleteStaff = async (employeeId: string, name: string) => {
    await api.deleteEmployee(employeeId);
    addToast('info', 'Staff Member Deleted', `${name} has been removed from staff roster.`);
    loadData();
  };

  const handleToggleStaffStatus = async (employeeId: string, currentStatus: Employee['status']) => {
    const nextStatus: Employee['status'] =
      currentStatus === 'ON_CLOCK' ? 'ON_BREAK' : currentStatus === 'ON_BREAK' ? 'OFF_CLOCK' : 'ON_CLOCK';
    await api.updateEmployeeStatus(employeeId, nextStatus);
    addToast('success', 'Staff Clock Status Updated', `Status changed to ${nextStatus.replace('_', ' ')}`);
    loadData();
  };

  // Raw Material Inventory Handlers
  const handleAddInventory = async () => {
    if (!newInventory.name) {
      addToast('error', 'Validation Failed', 'Item name is required');
      return;
    }
    const restId = currentRestaurant?.id || 'rest-1';
    await api.addInventoryItem({
      restaurantId: restId,
      name: newInventory.name,
      category: newInventory.category,
      quantity: parseFloat(newInventory.quantity) || 10,
      unit: newInventory.unit,
      minThreshold: parseFloat(newInventory.minThreshold) || 5,
      costPerUnit: parseFloat(newInventory.costPerUnit) || 10,
      status: 'IN_STOCK',
      lastRestocked: new Date().toISOString().split('T')[0],
      supplierName: newInventory.supplierName,
      supplierContact: newInventory.supplierContact,
      storageLocation: newInventory.storageLocation,
    });
    addToast('success', 'Raw Material Added', `${newInventory.name} added to inventory.`);
    setIsAddInventoryModalOpen(false);
    setNewInventory({
      name: '',
      category: 'Meat & Poultry',
      quantity: '25',
      unit: 'kg',
      minThreshold: '5',
      costPerUnit: '12.00',
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
            <p className="text-xs text-slate-400 font-mono">dashboard.dineflow.com • ID: {currentRestaurant.id}</p>
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
              <p className="text-slate-400 text-xs">Your restaurant property has been set to inactive by Platform Administrator. Customer ordering website is temporarily offline.</p>
            </div>
          )}

          {currentRestaurant.lifecycleStatus === 'SUSPENDED' && (
            <div className="bg-rose-500/10 p-6 rounded-2xl border border-rose-500/30 space-y-2 text-rose-200 text-sm text-center">
              <p className="font-bold text-white text-base">Account Suspended</p>
              <p className="text-xs text-rose-300">Access to the Restaurant OS is currently disabled. Please contact Platform Support at support@dineflow.com.</p>
            </div>
          )}

          {/* BUTTON CONTROLS */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-800">
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-5 flex flex-col justify-between shrink-0">
        <div>
          {/* Multi-Restaurant Outlet Switcher Button */}
          <div className="mb-6 px-1">
            <button
              onClick={() => setIsOutletModalOpen(true)}
              className="w-full p-2.5 bg-slate-950 border border-slate-800 hover:border-rose-500/50 rounded-2xl flex items-center justify-between gap-2.5 transition-all text-left group cursor-pointer shadow-md hover:shadow-rose-500/10"
              title="Click to Switch Restaurant Outlet or Register New Branch"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={theme.logo}
                  alt={theme.restaurantName}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-xs font-bold text-white tracking-tight truncate">
                      {theme.restaurantName}
                    </h1>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>{currentRestaurant?.branchName || currentRestaurant?.city || 'Main Outlet'}</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1 rounded font-mono shrink-0 ml-1">
                      {allMyRestaurants.length} Outlets
                    </span>
                  </p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-rose-400 shrink-0 transition-colors" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
              {
                id: 'waiter',
                label: 'Waiter Terminal OS',
                icon: <PhoneCall className="w-4 h-4 text-amber-400" />,
                badge: 'LIVE',
              },
              {
                id: 'orders',
                label: 'POS Orders',
                icon: <ShoppingBag className="w-4 h-4" />,
                badge: orders.filter((o) => o.status !== 'COMPLETED').length,
              },
              { id: 'kitchen', label: 'Kitchen KDS', icon: <ChefHat className="w-4 h-4" /> },
              ...(currentRestaurant?.features?.bar !== false
                ? [{ id: 'bar', label: 'Bar Terminal KDS', icon: <Wine className="w-4 h-4 text-purple-400" />, badge: 'BAR' }]
                : []),
              {
                id: 'tables',
                label: 'Table Floorplan',
                icon: <Grid className="w-4 h-4" />,
                badge: tables.filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length > 0 ? 'ALERT' : undefined,
              },
              { id: 'menu', label: 'Menu & Pricing', icon: <UtensilsCrossed className="w-4 h-4" /> },
              { id: 'staff', label: 'Staff & Shifts', icon: <Users className="w-4 h-4" /> },
              { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
              { id: 'theme', label: 'Branding & Theme', icon: <Palette className="w-4 h-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === item.id
                    ? 'bg-[var(--brand-primary,#e11d48)]/20 text-white border border-[var(--brand-primary,#e11d48)]/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.badge === 'ALERT' ? 'bg-amber-500 text-slate-950 animate-pulse' : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Quick Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <Avatar name={currentUser?.name || 'Restaurant Owner'} size="sm" status="online" />
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">{currentUser?.name || 'Restaurant Owner'}</p>
              <p className="text-[10px] text-slate-400 truncate">{currentUser?.email || 'owner@restaurant.com'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Body */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Launch Status Banner */}
        {currentRestaurant && (
          <div className="mb-6">
            {currentRestaurant.lifecycleStatus === 'DRAFT' && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Restaurant Setup in Draft Mode</h4>
                    <p className="text-xs text-amber-300/80">
                      Configure your menu items, tables, and branding below. When ready, submit your application for platform approval and live URL activation.
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleRequestLaunch} className="shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                  Request Launch Approval
                </Button>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'PENDING_APPROVAL' && (
              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-200 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                    <Clock className="w-5 h-5 animate-spin" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Launch Application Pending Review ⏳</h4>
                    <p className="text-xs text-sky-300/80">
                      Your restaurant submission is queued for Platform Admin verification. Live customer ordering will unlock automatically upon approval.
                    </p>
                  </div>
                </div>
                <Badge variant="warning">Under Review</Badge>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'CHANGES_REQUESTED' && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Action Required: Modification Requested</h4>
                    <p className="text-xs text-amber-300/90 mt-0.5">
                      Platform Admin message: "{currentRestaurant.requestedChanges || 'Please check tax number and menu items.'}"
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleResubmitLaunch} className="shrink-0">
                  Resubmit Application
                </Button>
              </div>
            )}

            {currentRestaurant.lifecycleStatus === 'REJECTED' && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Launch Application Declined</h4>
                    <p className="text-xs text-rose-300/90 mt-0.5">
                      Reason: "{currentRestaurant.rejectionReason || 'Details did not meet platform guidelines.'}"
                    </p>
                  </div>
                </div>
                <Button variant="brand" size="sm" onClick={handleResubmitLaunch} className="shrink-0 bg-rose-600 hover:bg-rose-500">
                  Resubmit Application
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800/60">
          <div>
            <span className="text-xs text-slate-400 font-mono">dashboard.dineflow.com</span>
            <h2 className="text-2xl font-black text-white tracking-tight mt-0.5">
              {activeTab === 'dashboard' && 'Restaurant Executive Overview'}
              {activeTab === 'orders' && 'Live POS & Customer QR Orders'}
              {activeTab === 'kitchen' && 'Kitchen Display System (KDS)'}
              {activeTab === 'tables' && 'Table Map & QR Codes'}
              {activeTab === 'menu' && 'Menu Engineering & Pricing'}
              {activeTab === 'staff' && 'Employee Clock-In & Attendance'}
              {activeTab === 'inventory' && 'Raw Material Inventory'}
              {activeTab === 'theme' && 'Live Theme & Branding Engine'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'menu' && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddItemModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Menu Item
              </Button>
            )}
            <Badge variant="success">Domain: {theme.restaurantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}.dineflow.app</Badge>
          </div>
        </header>

        {/* Tab 1: Dashboard Overview */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* DOMINANT RESTAURANT BRANDING HERO */}
            <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900">
              <div className="h-44 sm:h-52 w-full relative">
                <img
                  src={theme.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80'}
                  alt={theme.restaurantName}
                  className="w-full h-full object-cover brightness-50"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              </div>

              <div className="p-6 sm:p-8 -mt-20 relative z-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
                <div className="flex items-end gap-5">
                  <img
                    src={theme.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                    alt={theme.restaurantName}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border-4 border-slate-950 shadow-2xl bg-slate-900 shrink-0"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Restaurant Status: Live
                      </span>
                      <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                        {currentRestaurant?.domain || `${theme.restaurantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}.dineflow.app`}
                      </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                      🍽️ {theme.restaurantName.toUpperCase()}
                    </h1>
                    <p className="text-sm text-slate-300 font-semibold">
                      Welcome Back, {currentUser?.name || 'Restaurant Owner'} 👋
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => setActiveTab('waiter')}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2"
                    icon={<PhoneCall className="w-4 h-4" />}
                  >
                    Launch Waiter OS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab('kitchen')}
                    className="border-slate-700 text-slate-200 hover:bg-slate-800 px-4 py-2"
                    icon={<ChefHat className="w-4 h-4" />}
                  >
                    Kitchen KDS
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Today's Sales"
                value="$1,840.50"
                change={{ value: '+24.5%', isPositive: true }}
                subtitle="vs yesterday"
                icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
              />
              <StatsCard
                title="Active Orders"
                value={orders.filter((o) => o.status !== 'COMPLETED').length}
                change={{ value: 'Live Kitchen', isPositive: true }}
                icon={<ShoppingBag className="w-5 h-5 text-sky-400" />}
              />
              <StatsCard
                title="Occupied Tables"
                value={`${tables.filter((t) => t.status !== 'AVAILABLE').length} / ${tables.length}`}
                change={{ value: '62% Occupancy', isPositive: true }}
                icon={<Grid className="w-5 h-5 text-purple-400" />}
              />
              <StatsCard
                title="Avg Prep Time"
                value="14.2 min"
                change={{ value: '-2.1 min', isPositive: true }}
                icon={<Clock className="w-5 h-5 text-amber-400" />}
              />
            </div>

            {/* Quick Actions & Live Order Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 bg-slate-900 border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">Live Customer QR Orders</h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('orders')}>
                    View All Orders →
                  </Button>
                </div>

                <div className="space-y-3">
                  {orders.slice(0, 3).map((order) => (
                    <div
                      key={order.id}
                      className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white text-sm">#{order.id}</span>
                          <Badge variant="brand">{order.tableNumber}</Badge>
                          <span className="text-xs text-slate-400">{order.customerName || 'Guest'}</span>
                        </div>
                        <p className="text-xs text-slate-300 truncate max-w-md">
                          {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-white">${order.totalAmount.toFixed(2)}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateOrderStatus(order.id, 'IN_KITCHEN')}
                        >
                          Send to Kitchen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Table Alert Summary */}
              <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                <h3 className="text-base font-bold text-white">Table Alerts</h3>
                <div className="space-y-3">
                  {tables
                    .filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED')
                    .map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {t.status === 'WAITER_CALLED' ? (
                            <PhoneCall className="w-4 h-4 text-amber-400 animate-bounce" />
                          ) : (
                            <Receipt className="w-4 h-4 text-emerald-400" />
                          )}
                          <div>
                            <p className="text-xs font-bold text-white">{t.tableNumber}</p>
                            <p className="text-[10px] text-amber-300">
                              {t.status === 'WAITER_CALLED' ? 'Requested Waiter Assistance' : 'Requested Final Bill'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] px-2 py-1"
                          onClick={() => {
                            api.getTables('rest-1').then(() => {
                              addToast('success', 'Alert Cleared');
                              loadData();
                            });
                          }}
                        >
                          Acknowledge
                        </Button>
                      </div>
                    ))}
                  {tables.filter((t) => t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">No pending waiter calls or bill requests.</p>
                  )}
                </div>
              </Card>
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
                  render: (o) => <span className="font-mono font-bold text-emerald-400">${o.totalAmount.toFixed(2)}</span>,
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
          <WaiterTerminalOS />
        )}

        {/* Tab 3: Kitchen Display System (KDS) & ETA Controls */}
        {activeTab === 'kitchen' && (
          <KitchenETADashboard orders={orders} onRefreshOrders={loadData} />
        )}

        {/* Tab: Bar Terminal KDS */}
        {activeTab === 'bar' && (
          <BarTerminal />
        )}

        {/* Tab 4: Table Floorplan, Merging & Reservations */}
        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Grid className="w-5 h-5 text-rose-500" /> Dining Room Table Floorplan & Reservations
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
                  className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
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
              <Card className="bg-slate-900 border-slate-800 p-3 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Total Tables</span>
                <p className="text-xl font-black text-white">{tables.length}</p>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-3 space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase">Available</span>
                <p className="text-xl font-black text-emerald-400">
                  {tables.filter((t) => t.status === 'AVAILABLE').length}
                </p>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-3 space-y-1">
                <span className="text-[10px] font-mono text-amber-400 uppercase">Reserved</span>
                <p className="text-xl font-black text-amber-400">
                  {tables.filter((t) => t.status === 'RESERVED').length}
                </p>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-3 space-y-1">
                <span className="text-[10px] font-mono text-sky-400 uppercase">Merged Groups</span>
                <p className="text-xl font-black text-sky-400">
                  {tables.filter((t) => t.isMerged).length}
                </p>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-3 space-y-1 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-mono text-rose-400 uppercase">Occupied</span>
                <p className="text-xl font-black text-rose-400">
                  {tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length}
                </p>
              </Card>
            </div>

            {/* Interactive Floorplan Table Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tables.map((tbl) => {
                const isReserved = tbl.status === 'RESERVED' || !!tbl.reservationDetails;
                const isMerged = tbl.isMerged || tbl.status === 'MERGED';

                return (
                  <Card
                    key={tbl.id}
                    className={`bg-slate-900 border transition-all p-5 flex flex-col justify-between space-y-4 rounded-2xl ${
                      isReserved
                        ? 'border-amber-500/60 shadow-lg shadow-amber-950/20'
                        : isMerged
                        ? 'border-sky-500/60 shadow-lg shadow-sky-950/20'
                        : tbl.status === 'OCCUPIED'
                        ? 'border-rose-500/40'
                        : 'border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Top Row: Table Number, VIP, Status */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono font-black text-white text-xl">{tbl.tableNumber}</h4>
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
                            tbl.status === 'AVAILABLE'
                              ? 'success'
                              : isReserved
                              ? 'warning'
                              : isMerged
                              ? 'info'
                              : 'danger'
                          }
                        >
                          {tbl.status}
                        </Badge>
                      </div>

                      {/* Merged Banner */}
                      {isMerged && (
                        <div className="mt-3 p-3 rounded-xl bg-sky-950/60 border border-sky-500/30 text-xs space-y-1">
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
                        <div className="mt-3 p-3 rounded-xl bg-amber-950/60 border border-amber-500/30 text-xs space-y-1">
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
                              variant="secondary"
                              size="sm"
                              onClick={() => handleCheckInGuest(tbl.id, tbl.tableNumber, tbl.reservationDetails!.reservedForName)}
                              className="text-[10px] py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                              icon={<UserCheck className="w-3 h-3" />}
                            >
                              Check In Guest
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelReservation(tbl.id, tbl.tableNumber)}
                              className="text-[10px] py-1 px-2 border-slate-700 text-rose-400 hover:bg-rose-500/10"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Action Footer Controls */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTableQR(tbl)}
                        className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1"
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
        )}

        {/* Tab 5: Menu & Pricing */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-rose-500" /> Menu Catalog & Availability Engine
                </h3>
                <p className="text-xs text-slate-400">
                  Add, edit, delete, and control real-time ordering availability across all digital channels.
                </p>
              </div>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddItemModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Dish / Drink
              </Button>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
              <div className="w-full sm:w-72">
                <SearchInput
                  value={menuSearchQuery}
                  onChange={setMenuSearchQuery}
                  placeholder="Search dish, description, price..."
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => setSelectedMenuCategory('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedMenuCategory === 'ALL'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All Items ({menuItems.length})
                </button>
                {MOCK_CATEGORIES.map((cat) => {
                  const count = menuItems.filter((i) => i.categoryId === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedMenuCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedMenuCategory === cat.id
                          ? 'bg-rose-600 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMenuItems.map((item) => {
                const categoryObj = MOCK_CATEGORIES.find((c) => c.id === item.categoryId);
                return (
                  <Card key={item.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div>
                      <div className="relative mb-3 rounded-xl overflow-hidden group">
                        <img src={item.image} alt={item.name} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
                        <span className="absolute top-2 left-2 px-2.5 py-1 bg-slate-950/80 backdrop-blur-md rounded-lg text-[10px] font-bold text-slate-200 border border-slate-700">
                          {categoryObj?.name || 'General'}
                        </span>
                        <span className={`absolute top-2 right-2 px-2.5 py-1 rounded-lg text-[10px] font-bold backdrop-blur-md ${
                          item.isAvailable ? 'bg-emerald-500/80 text-white' : 'bg-rose-500/80 text-white'
                        }`}>
                          {item.isAvailable ? 'In Stock' : '86ed'}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-white text-sm">{item.name}</h4>
                        <span className="font-mono font-bold text-rose-400 text-base">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <Button
                        variant={item.isAvailable ? 'secondary' : 'brand'}
                        size="sm"
                        onClick={() => handleToggleItemAvailability(item.id)}
                        className="text-xs"
                      >
                        {item.isAvailable ? 'Mark 86ed' : 'Enable Item'}
                      </Button>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditModal(item)}
                          className="hover:bg-slate-800 text-slate-300 hover:text-white px-2.5"
                          title="Edit Menu Item"
                        >
                          <Edit className="w-3.5 h-3.5 text-blue-400 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                          className="hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 px-2.5"
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
                  <p className="text-sm font-semibold text-slate-300">No menu items found</p>
                  <p className="text-xs text-slate-500 mt-1">Try adjusting your filter or search query, or add a new dish.</p>
                  <Button
                    variant="brand"
                    size="sm"
                    className="mt-4"
                    onClick={() => setIsAddItemModalOpen(true)}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add New Menu Item
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
                  <Users className="w-5 h-5 text-rose-500" /> Employee Roster & Shift Attendance
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
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Staff</span>
                <p className="text-2xl font-black text-white">{employees.length}</p>
                <span className="text-[10px] text-slate-500">Active roster count</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" /> On Clock Now
                </span>
                <p className="text-2xl font-black text-emerald-400">
                  {employees.filter((e) => e.status === 'ON_CLOCK').length}
                </p>
                <span className="text-[10px] text-slate-500">Active on floor & kitchen</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-amber-400 font-semibold uppercase">On Break</span>
                <p className="text-2xl font-black text-amber-400">
                  {employees.filter((e) => e.status === 'ON_BREAK').length}
                </p>
                <span className="text-[10px] text-slate-500">Scheduled break time</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Off Clock</span>
                <p className="text-2xl font-black text-slate-400">
                  {employees.filter((e) => e.status === 'OFF_CLOCK').length}
                </p>
                <span className="text-[10px] text-slate-500">Off-duty or next shift</span>
              </Card>
            </div>

            {/* Staff Data Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <DataTable<Employee>
                data={employees}
                keyExtractor={(e) => e.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Staff Member',
                    render: (e) => (
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} size="sm" status={e.status === 'ON_CLOCK' ? 'online' : 'offline'} />
                        <div>
                          <p className="font-bold text-white text-xs">{e.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{e.email}</p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'role',
                    header: 'Role',
                    render: (e) => (
                      <Badge variant={e.role === 'MANAGER' ? 'brand' : e.role === 'CHEF' ? 'warning' : 'info'}>
                        {e.role}
                      </Badge>
                    ),
                  },
                  {
                    key: 'phone',
                    header: 'Contact Phone',
                    render: (e) => <span className="text-xs font-mono text-slate-300">{e.phone}</span>,
                  },
                  {
                    key: 'shift',
                    header: 'Assigned Shift',
                    render: (e) => (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 font-medium text-[11px] flex items-center gap-1.5 w-fit">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {e.shift || 'Evening (4PM - 12AM)'}
                      </span>
                    ),
                  },
                  {
                    key: 'assignedSection',
                    header: 'Station / Section',
                    render: (e) => (
                      <span className="text-xs font-bold text-slate-200 bg-slate-800 px-2.5 py-1 rounded-lg">
                        {e.assignedSection || 'Front Floor & POS'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Clock Status',
                    render: (e) => (
                      <button
                        onClick={() => handleToggleStaffStatus(e.id, e.status)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          e.status === 'ON_CLOCK'
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                            : e.status === 'ON_BREAK'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                        title="Click to toggle status"
                      >
                        {e.status === 'ON_CLOCK' ? '● ON CLOCK' : e.status === 'ON_BREAK' ? '☕ ON BREAK' : '○ OFF CLOCK'}
                      </button>
                    ),
                  },
                  {
                    key: 'accountStatus',
                    header: 'Portal Access',
                    render: (e) => (
                      <button
                        onClick={() => handleToggleAccountDisabled(e.id, e.name)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                          e.isAccountDisabled
                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                        title={e.isAccountDisabled ? 'Click to Enable Account Login' : 'Click to Disable Account Login'}
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
                    ),
                  },
                  {
                    key: 'actions',
                    header: 'Staff Actions',
                    render: (e) => (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingStaff({ ...e });
                            setIsEditStaffModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit Staff Member Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenResetPasswordModal(e)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                          title="Reset Portal Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteStaff(e.id, e.name)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Remove Staff Member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-rose-500" /> Raw Materials & Inventory Control
                </h3>
                <p className="text-xs text-slate-400">Track raw ingredient levels, unit costs, low stock thresholds, and suppliers.</p>
              </div>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setIsAddInventoryModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Raw Material / Stock
              </Button>
            </div>

            {/* Inventory KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Tracked Items</span>
                <p className="text-2xl font-black text-white">{inventory.length}</p>
                <span className="text-[10px] text-slate-500">Raw materials in database</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-rose-400 font-semibold uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Low Stock Alerts
                </span>
                <p className="text-2xl font-black text-rose-400">
                  {inventory.filter((i) => i.quantity <= i.minThreshold).length}
                </p>
                <span className="text-[10px] text-slate-500">At or below reorder threshold</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-emerald-400 font-semibold uppercase">Total Inventory Value</span>
                <p className="text-2xl font-black text-emerald-400">
                  ${inventory.reduce((acc, item) => acc + item.quantity * item.costPerUnit, 0).toFixed(2)}
                </p>
                <span className="text-[10px] text-slate-500">Valued at current cost</span>
              </Card>

              <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
                <span className="text-[11px] text-sky-400 font-semibold uppercase">Active Suppliers</span>
                <p className="text-2xl font-black text-sky-400">
                  {new Set(inventory.map((i) => i.supplierName).filter(Boolean)).size || 1}
                </p>
                <span className="text-[10px] text-slate-500">Verified raw vendor contacts</span>
              </Card>
            </div>

            {/* Raw Material Inventory Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <DataTable<InventoryItem>
                data={inventory}
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
                            className="w-6 h-6 rounded-md bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 flex items-center justify-center transition-colors"
                            title="Decrease 1 unit"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleAdjustInventory(i.id, 1)}
                            className="w-6 h-6 rounded-md bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 flex items-center justify-center transition-colors"
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
                        <p className="font-mono text-xs text-white">${i.costPerUnit.toFixed(2)} / {i.unit}</p>
                        <p className="font-mono text-[10px] text-emerald-400 font-bold">
                          Total: ${(i.quantity * i.costPerUnit).toFixed(2)}
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
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      value={theme.currency || 'INR (₹)'}
                      onChange={(e) => updateThemeColor('currency', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500 font-medium"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.flagEmoji} {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Select Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { code: 'INR (₹)', flag: '🇮🇳', label: 'INR ₹' },
                      { code: 'USD ($)', flag: '🇺🇸', label: 'USD $' },
                      { code: 'EUR (€)', flag: '🇪🇺', label: 'EUR €' },
                      { code: 'GBP (£)', flag: '🇬🇧', label: 'GBP £' },
                      { code: 'AED (AED)', flag: '🇦🇪', label: 'AED' },
                    ].map((cur) => {
                      const isSelected = (theme.currency || 'INR (₹)') === cur.code;
                      return (
                        <button
                          key={cur.code}
                          type="button"
                          onClick={() => updateThemeColor('currency', cur.code)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-400'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                          }`}
                        >
                          <span>{cur.flag}</span>
                          <span>{cur.label}</span>
                        </button>
                      );
                    })}
                  </div>
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
                      <p className="text-[10px] text-slate-400">Sample Menu Item • Special Chef Curry</p>
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
                    }
                    addToast(
                      'success',
                      'Branding & Currency Published! 🎨',
                      `Base currency updated to ${theme.currency || 'INR (₹)'}. Live customer QR apps synced!`
                    );
                  }}
                  className="px-6 py-2.5 font-bold text-sm"
                >
                  Save & Publish Theme Engine
                </Button>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      <Modal
        isOpen={!!selectedTableQR}
        onClose={() => setSelectedTableQR(null)}
        title={`Custom QR Standee & Download for ${selectedTableQR?.tableNumber}`}
        maxWidth="2xl"
      >
        {selectedTableQR && (
          <QRCodeDisplay
            url={selectedTableQR.qrCodeUrl}
            tableNumber={selectedTableQR.tableNumber}
            restaurantName={theme.restaurantName || 'Lumière Bistro'}
            restaurantLogo={theme.logo}
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
                {MOCK_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Price ($ USD) *"
              type="number"
              placeholder="24.00"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
            />
          </div>

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
                  {MOCK_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Price ($ USD) *"
                type="number"
                value={editingItem.price.toString()}
                onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
              />
            </div>

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
                variant={editingItem.isAvailable ? 'success' : 'brand'}
                size="sm"
                onClick={() => setEditingItem({ ...editingItem, isAvailable: !editingItem.isAvailable })}
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
              label="Hourly Wage ($)"
              type="number"
              placeholder="18.50"
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
                label="Hourly Rate ($)"
                type="number"
                value={editingStaff.hourlyRate || 18.5}
                onChange={(e) => setEditingStaff({ ...editingStaff, hourlyRate: parseFloat(e.target.value) || 18.5 })}
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
        title="Add Raw Material / Stock Item"
      >
        <div className="space-y-4">
          <Input
            label="Raw Material / Item Name *"
            placeholder="e.g. Organic Extra Virgin Olive Oil"
            value={newInventory.name}
            onChange={(e) => setNewInventory({ ...newInventory, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
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
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Unit of Measure *</label>
              <select
                value={newInventory.unit}
                onChange={(e) => setNewInventory({ ...newInventory, unit: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="liters">Liters (L)</option>
                <option value="pcs">Pieces (pcs)</option>
                <option value="packs">Packs / Boxes</option>
                <option value="bags">Bags</option>
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
              label="Unit Cost ($)"
              type="number"
              value={newInventory.costPerUnit}
              onChange={(e) => setNewInventory({ ...newInventory, costPerUnit: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Supplier Name"
              placeholder="e.g. Tuscan Imports Co."
              value={newInventory.supplierName}
              onChange={(e) => setNewInventory({ ...newInventory, supplierName: e.target.value })}
            />
            <Input
              label="Supplier Contact"
              placeholder="+1 800-555-0199"
              value={newInventory.supplierContact}
              onChange={(e) => setNewInventory({ ...newInventory, supplierContact: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Storage Location</label>
            <select
              value={newInventory.storageLocation}
              onChange={(e) => setNewInventory({ ...newInventory, storageLocation: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
            >
              <option value="Cold Storage #1">Cold Storage #1</option>
              <option value="Dry Pantry Vault">Dry Pantry Vault</option>
              <option value="Wine & Beverage Cellar">Wine & Beverage Cellar</option>
              <option value="Deep Freezer #2">Deep Freezer #2</option>
            </select>
          </div>

          <Button variant="brand" className="w-full mt-2" onClick={handleAddInventory}>
            Add Item to Inventory
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

          <Button variant="brand" className="w-full mt-2" onClick={handleCreateTable} icon={<Plus className="w-4 h-4" />}>
            Create Table & Generate QR
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
    </div>
  );
};
