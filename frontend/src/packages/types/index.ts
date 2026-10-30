export type UserRole = 'SUPER_ADMIN' | 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER' | 'MANAGER' | 'CHEF' | 'WAITER' | 'CUSTOMER' | 'BAR_STAFF' | 'BARTENDER' | 'HOOKAH' | 'HOOKAH_STAFF' | 'SHISHA' | 'SHISHA_STAFF' | 'INVENTORY_MANAGER';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role: UserRole;
  avatar?: string;
  restaurantId?: string;
  orgId?: string;
  isEmailVerified?: boolean;
  googleUid?: string;
  authProvider?: 'password' | 'google';
  photoURL?: string;
  tokens?: AuthTokens;
}

export type WorkspaceType = 'admin' | 'restaurant' | 'operations' | 'kitchen' | 'waiter' | 'bar' | 'hookah' | 'inventory' | 'customer';

export type TerminalModule = 'kitchen' | 'waiter' | 'bar' | 'hookah' | 'inventory' | 'billing' | 'dashboard' | 'tables' | 'weddings';

export function canAccessWorkspace(
  user: User | null | undefined,
  workspace: WorkspaceType | string,
  restaurant?: Restaurant | null
): boolean {
  if (!user || !user.role) return false;
  const role = user.role;
  const userEmail = (user.email || '').trim().toLowerCase();

  // 1. Platform Admin has exclusive access to platform admin based on verified role
  if (workspace === 'admin') {
    return role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN';
  }

  if (role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  // 2. Restaurant Owner & Manager have access to all enabled restaurant operational & management workspaces
  if (role === 'RESTAURANT_OWNER' || role === 'MANAGER') {
    return true;
  }

  // 3. Scoped Staff roles (Staff only access their designated terminal)
  if (role === 'CHEF') {
    return workspace === 'kitchen';
  }
  if (role === 'WAITER' || (role as string) === 'HOST' || (role as string) === 'CASHIER') {
    return workspace === 'waiter';
  }
  if (role === 'BARTENDER' || role === 'BAR_STAFF') {
    return workspace === 'bar';
  }
  if (role === 'HOOKAH' || role === 'HOOKAH_STAFF' || (role as string) === 'SHISHA' || (role as string) === 'SHISHA_STAFF') {
    return workspace === 'hookah';
  }
  if (role === 'INVENTORY_MANAGER') {
    return workspace === 'inventory';
  }

  if (role === 'CUSTOMER') {
    return workspace === 'customer';
  }

  return false;
}

export function isModuleEnabled(
  restaurant: Restaurant | null | undefined,
  module: TerminalModule | string
): boolean {
  if (!restaurant) return true; // Default permissive until loaded
  
  const bType = (restaurant.businessType || 'RESTAURANT').toUpperCase();
  const modLower = module.toLowerCase();

  // Business-Type Strict Partitioning: A Restaurant, Bar, or Small Cart must NEVER enable weddings
  if (modLower === 'weddings' || modLower === 'wedding') {
    if (bType !== 'WEDDING_EVENT' && bType !== 'WEDDING_ORDERING') {
      return false;
    }
  }

  // Small Carts do not support dine-in tables, waiter call, or wedding operations
  if (bType === 'SMALL_CART' || bType === 'FOOD_CART') {
    if (modLower === 'tables' || modLower === 'waiter' || modLower === 'weddings') {
      return false;
    }
  }

  // If checking tables module:
  if (modLower === 'tables') {
    if (restaurant.hasTables === false) return false;
    const count = restaurant.tablesCount ?? (restaurant as any).totalTablesCount;
    if (Array.isArray(restaurant.enabledModules) && restaurant.enabledModules.length > 0) {
      if (restaurant.enabledModules.includes('tables')) return true;
      // If restaurant has seating flag or table count, do not block tables
      if (restaurant.hasTables === true || (count && count > 0)) {
        return true;
      }
    }
    return (restaurant.hasTables as boolean | undefined) !== false;
  }

  // If enabledModules array is present, check membership
  if (Array.isArray(restaurant.enabledModules) && restaurant.enabledModules.length > 0) {
    return restaurant.enabledModules.includes(modLower);
  }

  // Fallback to explicit boolean flags
  if (module === 'kitchen') return restaurant.hasKitchen !== false;
  if (module === 'waiter') return restaurant.hasWaiter !== false && restaurant.hasTables !== false;
  if (module === 'bar') return restaurant.hasBar === true || bType === 'BAR';
  if (module === 'hookah' || modLower === 'hookah') return (restaurant as any).hasHookah === true || (Array.isArray(restaurant.enabledModules) && restaurant.enabledModules.includes('hookah'));
  if (module === 'inventory') return restaurant.hasInventory !== false;
  if (module === 'billing') return restaurant.hasBilling !== false;
  if (module === 'tables') return restaurant.hasTables !== false;
  if (modLower === 'weddings') return (restaurant as any).hasWeddings === true || bType === 'WEDDING_ORDERING';
  if (module === 'dashboard' || module === 'restaurant' || module === 'operations') return true;

  return true;
}

export interface RestaurantFeatures {
  food_service: boolean;
  cafe: boolean;
  bar: boolean;
  bakery: boolean;
  desserts: boolean;
  takeaway: boolean;
  delivery: boolean;
  reservations: boolean;
  outdoor_seating: boolean;
  vip_rooms: boolean;
}

export interface ThemeConfig {
  restaurantId?: string;
  restaurantName: string;
  logo: string;
  bannerUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  currency?: string;
}

export interface Organization {
  id: string;
  name: string;
  legalBusinessName: string;
  gstVatNumber?: string;
  country: string;
  currency: string;
  timezone: string;
  businessAddress: string;
  contactNumber: string;
  supportEmail: string;
  slug: string;
  plan: 'FREE_TRIAL' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  restaurantsCount: number;
  monthlyRevenue: number;
  createdAt: string;
  ownerName: string;
  ownerEmail: string;
  ownerId?: string;
}

export type RestaurantLifecycleStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'LIVE'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'DEACTIVATED'
  | 'SUSPENDED'
  | 'ARCHIVED'
  | 'DELETED';

export type BusinessType = 'RESTAURANT' | 'BAR' | 'SMALL_CART' | 'WEDDING_EVENT' | 'CAFE' | 'FOOD_CART' | 'FOOD_TRUCK' | 'WEDDING_ORDERING';

export interface Restaurant {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  publicSlug?: string;
  cuisine: string;
  businessType?: BusinessType;
  hasBar?: boolean;
  hasTables?: boolean;
  hasKitchen?: boolean;
  hasWaiter?: boolean;
  hasInventory?: boolean;
  hasBilling?: boolean;
  enabledModules?: string[];
  orderNumberPrefix?: string;
  restaurantType?: string;
  description?: string;
  address: string;
  locality?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  phone: string;
  email?: string;
  website?: string;
  gstNumber?: string;
  gstin?: string;
  pan?: string;
  legalName?: string;
  stateCode?: string;
  taxPercentage?: number;
  invoicePrefix?: string;
  invoiceStartingNumber?: number;
  serviceChargePercentage?: number;
  serviceChargeEnabled?: boolean;
  upiId?: string;
  upiMerchantName?: string;
  upiQrUrl?: string;
  upiEnabled?: boolean;
  openingHours?: string;
  closingHours?: string;
  currency?: string;
  timezone?: string;
  branchName?: string;
  mapsLocation?: string;
  indoorTablesCount?: number;
  outdoorTablesCount?: number;
  vipTablesCount?: number;
  privateRoomsCount?: number;
  isApproved: boolean;
  isAutoApproved?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedReason?: string;
  status: 'OPEN' | 'CLOSED' | 'BUSY';
  lifecycleStatus: RestaurantLifecycleStatus;
  rejectionReason?: string;
  requestedChanges?: string;
  rating: number;
  activeOrdersCount: number;
  tablesCount?: number;
  totalTablesCount?: number;
  theme: ThemeConfig;
  features?: RestaurantFeatures;
  domain?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerUid?: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt?: string;
}

export interface PlatformNotification {
  id: string;
  recipientRole: 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER';
  restaurantId?: string;
  restaurantName?: string;
  title: string;
  message: string;
  type: 'NEW_REGISTRATION' | 'LAUNCH_REQUESTED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPENDED' | 'SYSTEM_ANNOUNCEMENT';
  timestamp: string;
  isRead: boolean;
}

export type BarCategoryName = 
  | 'Beer'
  | 'Wine'
  | 'Whiskey'
  | 'Vodka'
  | 'Rum'
  | 'Gin'
  | 'Cocktails'
  | 'Mocktails'
  | 'Champagne'
  | 'Tequila'
  | 'Premium Bottles'
  | 'Shots'
  | 'Signature Drinks';

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  imageUrl?: string;
  isAvailable: boolean;
  stockQuantity?: number;
  trackInventory?: boolean;
  isVeg?: boolean;
  isVegetarian?: boolean;
  dietaryType?: 'VEG' | 'NON_VEG';
  isSpicy?: boolean;
  calories?: number;
  prepTimeMinutes?: number;
  preparationTimeMinutes?: number;
  targetDestination?: 'KITCHEN' | 'BAR' | 'HOOKAH';
  isAlcoholic?: boolean;
  alcoholPercentage?: number;
  bottleSize?: string;
  glassSize?: string;
  barCategory?: BarCategoryName;
  brand?: string;
  servingOptions?: string[];
  discountPercentage?: number;
  isFeatured?: boolean;
  isRecommended?: boolean;
  options?: {
    name: string;
    choices: { name: string; priceDelta: number }[];
  }[];
  // Global Library metadata
  catalogueItemId?: string;
  shortDescription?: string;
  cuisine?: string;
  servingSize?: string;
  allergens?: string[];
  flavourProfile?: string;
}

export interface CatalogueItem {
  id: string;
  name: string;
  aliases: string[];
  category: 'FOOD' | 'BAR' | 'HOOKAH' | 'DESSERT' | 'BEVERAGE' | string;
  subcategory: string;
  cuisine: string;
  shortDescription: string;
  longDescription: string;
  ingredients: string[];
  preparationNotes?: string;
  dietaryType: 'VEG' | 'NON_VEG' | 'EGG' | 'VEGAN';
  isVegetarian: boolean;
  isVegan: boolean;
  containsEgg: boolean;
  allergens: string[];
  servingSize?: string;
  targetDestination: 'KITCHEN' | 'BAR' | 'HOOKAH';
  isAlcoholic: boolean;
  preparationTimeMinutes: number;
  imageUrl?: string;
  imageAttribution?: string;
  flavourProfile?: string;
  suggestedPriceInr?: number;
  isActive: boolean;
  version: number;
  provenance: string;
  descriptionVariants?: Array<{ tone: string; shortDescription: string; longDescription: string }>;
}

export interface CatalogueResponse {
  items: CatalogueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: {
    categories: Array<{ category: string; count: number }>;
    subcategories: string[];
    cuisines: string[];
  };
}

export interface AddLibraryItemEntry {
  catalogueItemId: string;
  price: number;
  customName?: string;
  customDescription?: string;
  categoryName?: string;
  categoryId?: string;
  targetDestination?: string;
  isAvailable?: boolean;
  servingSize?: string;
  duplicateAction?: 'SKIP' | 'CREATE_COPY' | 'OVERWRITE';
}

export interface AddLibraryItemsResponse {
  addedCount: number;
  skippedCount: number;
  updatedCount: number;
  added: MenuItem[];
  skipped: Array<{ catalogueItemId: string; itemName?: string; reason: string }>;
  updated: MenuItem[];
}

export interface DescriptionGenerateRequest {
  itemName: string;
  category?: string;
  cuisine?: string;
  flavourProfile?: string;
  ingredients?: string[];
  dietaryType?: string;
  servingSize?: string;
  tone?: 'classic' | 'modern' | 'concise' | 'artisanal';
}

export interface DescriptionGenerateResponse {
  itemName: string;
  category: string;
  tone: string;
  shortDescription: string;
  longDescription: string;
  variants: Array<{ tone: string; shortDescription: string; longDescription: string }>;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  icon?: string;
  order?: number;
  sortOrder?: number;
  isEnabled?: boolean;
}

export interface BarCategory {
  id: string;
  restaurantId: string;
  name: string;
  icon?: string;
  displayOrder: number;
  isEnabled: boolean;
}

export interface BarMenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  brand?: string;
  alcoholPercentage?: number;
  bottleSize?: string;
  servingSize?: string;
  prepTimeMinutes?: number;
  discountPercentage?: number;
  isFeatured?: boolean;
  isRecommended?: boolean;
  isAvailable: boolean;
  displayOrder?: number;
  targetDestination: 'BAR';
  isAlcoholic: boolean;
  servingOptions?: string[];
}

export interface TableReservation {
  reservedForName: string;
  reservedForPhone?: string;
  reservationTime: string;
  partySize: number;
  notes?: string;
  reservedAt?: string;
  reservedBy?: string;
}

export type BillStatus = 'OPEN' | 'BILL_REQUESTED' | 'PAYMENT_PENDING' | 'PAID' | 'CLOSED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'QR_CODE' | 'OTHER';

export interface BillItem {
  orderId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  station?: 'KITCHEN' | 'BAR' | 'HOOKAH';
}

export type TaxType = 'PERCENTAGE' | 'FIXED';
export type TaxAppliesTo = 'ORDER' | 'CATEGORY' | 'ITEM';
export type TaxStatus = 'ACTIVE' | 'INACTIVE';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export interface Tax {
  id: string;
  restaurantId: string;
  name: string;
  type: TaxType;
  rate: number;
  fixedAmount?: number;
  isInclusive: boolean;
  appliesTo: TaxAppliesTo;
  applicableOrderTypes: OrderType[];
  categoryIds?: string[];
  menuItemIds?: string[];
  status: TaxStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaxSnapshot {
  taxId?: string;
  tax_id?: string;
  taxName?: string;
  name: string;
  type: TaxType;
  taxType?: TaxType;
  rate: number;
  taxRate?: number;
  amount: number;
  taxAmount?: number;
  isInclusive: boolean;
  is_inclusive?: boolean;
}

export interface TaxAuditLog {
  id: string;
  restaurantId: string;
  userId?: string;
  action: string;
  taxId: string;
  previousValues?: any;
  newValues?: any;
  createdAt: string;
}

export interface BillingConfig {
  restaurantId: string;
  name?: string;
  legalName: string;
  state: string;
  stateCode: string;
  gstin: string;
  pan: string;
  taxPercentage?: number;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
  invoicePrefix: string;
  invoiceStartingNumber: number;
  serviceChargePercentage: number;
  serviceChargeEnabled: boolean;
  upiId: string;
  upiMerchantName: string;
  upiQrUrl: string;
  upiEnabled: boolean;
  billingSettings?: Record<string, any>;
}

export type PrinterConnectionType = 'BROWSER' | 'NETWORK_LAN' | 'USB_BRIDGE' | 'BLUETOOTH';
export type PrinterPaperWidth = '58mm' | '80mm';

export interface RestaurantPrinter {
  id: string;
  restaurantId: string;
  name: string;
  connectionType: PrinterConnectionType;
  ipAddress?: string;
  port: number;
  bridgeUrl?: string;
  paperWidth: PrinterPaperWidth;
  isDefault: boolean;
  autoPrintOnBill: boolean;
  copies: number;
  isActive: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR';
  lastTestPrintedAt?: string;
  lastErrorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PrintJobResponse {
  success: boolean;
  message: string;
  connectionType?: string;
  paperWidth?: string;
  escposBase64?: string;
  billId?: string;
  copiesPrinted?: number;
  error?: string;
}

export interface PaymentTransaction {
  id: string;
  billId: string;
  restaurantId: string;
  gateway: string;
  transactionReference: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  rawPayload?: any;
  verifiedAt?: string;
  createdAt: string;
}

export interface Bill {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  tableSessionId: string;
  invoiceNumber?: string;
  businessDayId?: string;
  orders: Order[];
  items: BillItem[];
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  taxBreakdown?: TaxSnapshot[];
  discountAmount: number;
  discountPercentage?: number;
  taxableSubtotal?: number;
  serviceChargeAmount?: number;
  serviceChargePercentage?: number;
  roundOffAmount?: number;
  grandTotal: number;
  amountPaid?: number;
  amountDue?: number;
  balanceDue?: number;
  status: BillStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'UNPAID' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFICATION_REQUIRED' | 'PAYMENT_AWAITING_CONFIRMATION' | 'PAYMENT_PROCESSING' | 'PAID' | 'PARTIALLY_PAID' | 'FAILED' | 'CLOSED';
  paymentVerifiedBy?: string;
  paymentReference?: string;
  paymentGateway?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayQrId?: string;
  paymentQrPayload?: string;
  qrDataUrl?: string;
  paymentInitiatedAt?: string;
  paymentExpiresAt?: string;
  printCount?: number;
  lastPrintedAt?: string;
  printerId?: string;
  requestedAt?: string;
  paidAt?: string;
  closedAt?: string;
  closedByWaiterId?: string;
  closedByWaiterName?: string;
  createdAt: string;
  updatedAt: string;
}


export interface TableSession {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  status: 'ACTIVE' | 'BILL_REQUESTED' | 'PAYMENT_PENDING' | 'PAID' | 'CLOSED';
  customerSessionId?: string;
  sessionStartedAt: string;
  sessionClosedAt?: string;
  closedByWaiterName?: string;
  businessDayId?: string;
  paymentStatus?: 'UNPAID' | 'PAYMENT_PENDING' | 'PAID';
  paymentMethod?: PaymentMethod;
  billId?: string;
  billRequestedAt?: string;
}

export interface DailySummaryData {
  totalOrders: number;
  foodOrders: number;
  barOrders: number;
  foodSales: number;
  barSales: number;
  totalSales: number;
  completedOrders: number;
  cancelledOrders: number;
}

export interface BusinessDay {
  id: string;
  restaurantId: string;
  date: string;
  businessDate?: string;
  currentBusinessDate?: string;
  nextBusinessDate?: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  openedBy?: string;
  closedBy?: string;
  requiresRollover?: boolean;
  isStaleShift?: boolean;
  totalOrders?: number;
  completedOrders?: number;
  cancelledOrders?: number;
  foodOrders?: number;
  barOrders?: number;
  totalSales?: number;
  orderValue?: number;
  foodSales?: number;
  barSales?: number;
  cashSales?: number;
  cardSales?: number;
  upiSales?: number;
  taxAmount?: number;
  discountAmount?: number;
  unpaidBillsAmount?: number;
  averageOrderValue?: number;
  activeTablesCount?: number;
  activeSessionsCount?: number;
  unpaidBillsCount?: number;
  kitchenPendingCount?: number;
  barPendingCount?: number;
  hookahPendingCount?: number;
  waiterPendingCount?: number;
  summary?: DailySummaryData;
}

export interface Table {
  id: string;
  restaurantId: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'WAITING_FOR_SERVICE' | 'BILL_REQUESTED' | 'WAITER_CALLED' | 'MERGED';
  qrCodeUrl: string;
  activeOrderId?: string;
  activeSessionId?: string;
  assignedWaiterName?: string;
  isVip?: boolean;
  sessionStartedAt?: string;
  isOccupied?: boolean;
  section?: string;
  shape?: 'SQUARE' | 'ROUND' | 'RECTANGLE';
  // Table Merging for large gatherings
  isMerged?: boolean;
  mergedWithIds?: string[];
  mergedTableNumbers?: string[];
  parentMergedTableId?: string;
  mergedGroupLabel?: string;
  mergedGroupId?: string;
  mergedLabel?: string;
  // Visual Floorplan positioning & orientation
  positionX?: number;
  positionY?: number;
  rotation?: number;
  posX?: number;
  posY?: number;
  // Table Reservation
  reservationDetails?: TableReservation;
  reservedForName?: string;
  reservedForPhone?: string;
  reservationTime?: string;
  partySize?: number;
}

export interface RestaurantTerminal {
  id: string;
  restaurantId: string;
  name: string;
  terminalCode: string;
  terminalType: 'POS' | 'WAITER' | 'KITCHEN' | 'BAR' | 'CASHIER' | string;
  deviceInfo?: string;
  pairingCode?: string;
  status: 'ACTIVE' | 'OFFLINE' | 'PAIRING' | string;
  ipAddress?: string;
  isActive: boolean;
  lastActiveAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CustomerRequestType =
  | 'WATER'
  | 'BILL'
  | 'CUTLERY'
  | 'EXTRA_SPOON'
  | 'EXTRA_PLATE'
  | 'NAPKINS'
  | 'TISSUE'
  | 'CALL_WAITER'
  | 'CUSTOM';

export type CustomerRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface CustomerRequest {
  id: string;
  restaurantId: string;
  tableId?: string;
  tableNumber: string;
  tableSessionId?: string;
  requestType: CustomerRequestType;
  customTitle?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: CustomerRequestStatus;
  requestedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  assignedWaiterId?: string;
  assignedWaiterName?: string;
  message?: string;
  customerNotes?: string;
  rejectionReason?: string;
}

export interface WaiterNotification {
  id: string;
  restaurantId?: string;
  type: 'KITCHEN_ORDER_READY' | 'BAR_ORDER_READY' | 'CUSTOMER_CALL' | 'BILL_REQUEST' | 'MANAGER_ANNOUNCEMENT' | 'ETA_CHANGED';
  title: string;
  message: string;
  tableNumber?: string;
  orderId?: string;
  timestamp: string;
  isRead: boolean;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
}

export interface ShiftSummaryData {
  shiftStart: string;
  hoursWorked: number;
  tablesServed: number;
  ordersDelivered: number;
  customerCallsCompleted: number;
  avgResponseTimeMinutes: number;
  customerRating: number;
  totalTipsCollected: number;
  assignedSection: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'IN_KITCHEN' | 'PREPARING' | 'IN_PREPARATION' | 'PREPARING_DRINKS' | 'READY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  selectedOptions?: string[];
  notes?: string;
  targetDestination?: 'KITCHEN' | 'BAR' | 'HOOKAH';
  isAlcoholic?: boolean;
  alcoholPercentage?: number;
  glassSize?: string;
  imageUrl?: string;
  image?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId?: string;
  tableNumber: string;
  tableSessionId?: string;
  businessDayId?: string;
  orderType?: 'DINE_IN' | 'PICKUP' | 'WEDDING_EVENT' | string;
  eventId?: string;
  eventName?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  displayOrderNumber?: string;
  items: OrderItem[];
  totalAmount: number;
  subtotal?: number;
  taxAmount: number;
  taxBreakdown?: TaxSnapshot[];
  tipAmount: number;
  status: OrderStatus;
  targetDestination?: 'KITCHEN' | 'BAR' | 'HOOKAH' | 'MIXED';
  kitchenStatus?: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED';
  barStatus?: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED';
  hookahStatus?: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED';
  kitchenCompletedAt?: string;
  barCompletedAt?: string;
  hookahCompletedAt?: string;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  paymentMethod?: 'CASH' | 'CARD' | 'APPLE_PAY' | 'QR_CODE' | 'UPI';
  createdAt: string;
  updatedAt: string;
  waiterCalledAt?: string;
  billRequestedAt?: string;
  specialInstructions?: string;
  // Live Kitchen ETA & Timer fields
  estimatedPrepTimeMinutes?: number;
  etaTargetTimestamp?: string;
  isTimerPaused?: boolean;
  timerRemainingSeconds?: number;
  acceptedAt?: string;
  cookingStartedAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  claimedBy?: string;
  deliveryStatus?: 'PENDING' | 'WAITING_FOR_WAITER' | 'CLAIMED' | 'COLLECTED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  pickupCode?: string;
  pickupStatus?: 'UNCLAIMED' | 'REDEEMED' | string;
  claimedAt?: string;
  idempotencyKey?: string;
  completedAt?: string;
  prepTimeMinutes?: number;
  deliveryTimeMinutes?: number;
  totalServiceTimeMinutes?: number;
  etaHistory?: {
    timestamp: string;
    oldEta: number;
    newEta: number;
    previousMinutes?: number;
    newMinutes?: number;
    changedBy: string;
    updatedBy?: string;
    reason?: string;
  }[];
}

export interface FulfillmentTicket {
  id: string;
  parentOrderId: string;
  restaurantId: string;
  tableNumber: string;
  tableSessionId?: string;
  station: 'KITCHEN' | 'BAR' | 'HOOKAH';
  status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  customerName?: string;
  orderType?: 'DINE_IN' | 'PICKUP' | 'WEDDING_EVENT' | string;
}

export type FulfillmentStation = 'KITCHEN' | 'BAR' | 'HOOKAH';

export function getFulfillmentStation(item: {
  targetDestination?: string;
  target_destination?: string;
  station?: string;
  isAlcoholic?: boolean;
  is_alcoholic?: boolean;
  category?: string;
  barCategory?: string;
  categoryName?: string;
  name?: string;
}): 'KITCHEN' | 'BAR' | 'HOOKAH' {
  const dest = (
    item.targetDestination ||
    (item as any).target_destination ||
    (item as any).station ||
    ''
  ).toUpperCase();
  if (dest === 'HOOKAH' || dest === 'SHISHA') {
    return 'HOOKAH';
  }
  if (dest === 'BAR' || item.isAlcoholic === true || (item as any).is_alcoholic === true) {
    return 'BAR';
  }
  if (dest === 'KITCHEN' || dest === 'COOK' || dest === 'CHEF') {
    return 'KITCHEN';
  }
  const cat = (item.category || item.barCategory || (item as any).categoryName || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  if (cat.includes('hookah') || cat.includes('shisha') || name.includes('hookah') || name.includes('shisha')) {
    return 'HOOKAH';
  }
  if (
    cat.includes('bar') ||
    cat.includes('cocktail') ||
    cat.includes('wine') ||
    cat.includes('drink') ||
    cat.includes('beverage') ||
    cat.includes('beer') ||
    cat.includes('liquor') ||
    name.includes('cocktail') ||
    name.includes('mocktail') ||
    name.includes('wine') ||
    name.includes('beer') ||
    name.includes('whiskey') ||
    name.includes('vodka') ||
    name.includes('mojito')
  ) {
    return 'BAR';
  }
  return 'KITCHEN';
}

export interface Employee {
  id: string;
  restaurantId: string;
  name: string;
  role: 'MANAGER' | 'CHEF' | 'WAITER' | 'HOST' | 'CASHIER' | 'BARTENDER' | 'BAR_STAFF' | 'HOOKAH' | 'HOOKAH_STAFF' | 'SHISHA' | 'SHISHA_STAFF' | 'INVENTORY_MANAGER';
  email: string;
  phone: string;
  status: 'ON_CLOCK' | 'OFF_CLOCK' | 'ON_BREAK';
  hourlyRate: number;
  shift?: string;
  assignedSection?: string;
  shiftStart?: string;
  password?: string;
  username?: string;
  terminal?: string;
  terminalId?: string;
  staffUserId?: string;
  isActive?: boolean;
  isAccountDisabled?: boolean;
  joinedDate?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Supplier {
  id: string;
  restaurantId: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  supplyCategory?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  station?: 'KITCHEN' | 'BAR';
  quantity: number;
  currentStock?: number;
  unit: string;
  minThreshold: number;
  costPerUnit: number;
  lastRestocked: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  supplierId?: string;
  supplierName?: string;
  supplierContact?: string;
  storageLocation?: string;
}

export interface Subscription {
  id: string;
  orgId: string;
  orgName: string;
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
  amount: number;
  billingCycle: 'MONTHLY' | 'YEARLY';
  nextBillingDate: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  ipAddress: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
}

export interface AdminStats {
  totalRestaurants: number;
  activeTenants: number;
  liveRestaurants: number;
  pendingApprovals: number;
  rejectedRestaurants: number;
  suspendedRestaurants: number;
  totalOrdersProcessed: number;
  systemUptimePercent: number;
}

export interface AdminOrder {
  id: string;
  restaurantId: string;
  tableNumber?: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

export type AdminRestaurant = Restaurant;
export type AdminApplication = Restaurant;

export interface AdminApplicationResponse {
  applications?: AdminApplication[];
  restaurants?: AdminRestaurant[];
  data?: AdminApplication[];
}

export interface AdminVerificationResult {
  status: string;
  authenticated: boolean;
  uid: string;
  email: string;
  role: string;
  custom_claims?: Record<string, any>;
}

export interface WeddingEvent {
  id: string;
  restaurantId: string;
  workspaceId?: string;
  organizerEmail?: string;
  title: string;
  coupleNames?: string;
  eventType: 'WEDDING' | 'RECEPTION' | 'BIRTHDAY' | 'CORPORATE' | 'PARTY' | 'ANNIVERSARY' | 'GALA' | 'ENGAGEMENT' | 'SANGEET' | 'CELEBRATION' | 'OTHER' | string;
  eventDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  serviceDays?: number;
  startDatetimeUtc?: string;
  endDatetimeUtc?: string;
  durationFormatted?: string;
  venueName?: string;
  welcomeMessage?: string;
  themeColor: 'champagne' | 'ivory_gold' | 'blush_rose' | 'emerald_elegance' | 'burgundy_velvet' | 'midnight_navy' | string;
  coverImageUrl?: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED_SETUP_PENDING' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'COMPLETED' | 'CANCELLED' | 'PUBLISHED' | string;
  rawStatus?: string;
  isOrderingOpen?: boolean;
  isServiceActive?: boolean;
  autoActivate?: boolean;
  orderingEnabled?: boolean;
  menuSelectionType: 'FULL_MENU' | 'RESTRICTED' | 'FULL' | string;
  allowedCategoryIds?: string[];
  allowedItemIds?: string[];
  estimatedGuestCount?: number;
  estimatedGuests?: number;
  notes?: string;
  extendedAt?: string;
  extendedBy?: string;
  extendedReason?: string;
  hasFood?: boolean;
  hasBar?: boolean;
  hasHookah?: boolean;
  hasTableAssistance?: boolean;
  alcoholPolicyNotes?: string;
  tableCount?: number;
  orderCount?: number;
  totalRevenue?: number;
  tables?: EventTable[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EventTable {
  id: string;
  eventId: string;
  restaurantId: string;
  tableNumber: string;
  tableLabel?: string;
  label?: string;
  capacity: number;
  qrCodeUrl?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicWeddingEventResponse {
  event: {
    id: string;
    title: string;
    coupleNames: string;
    eventType: string;
    eventDate: string;
    endDate?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
    serviceDays?: number;
    startDatetimeUtc?: string;
    endDatetimeUtc?: string;
    durationFormatted?: string;
    venueName: string;
    welcomeMessage: string;
    themeColor: string;
    coverImageUrl: string;
    status: string;
    rawStatus?: string;
    isOrderingOpen: boolean;
    isServiceActive?: boolean;
    hasFood?: boolean;
    hasBar?: boolean;
    hasHookah?: boolean;
    hasTableAssistance?: boolean;
    alcoholPolicyNotes?: string;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    currency: string;
  };
  table?: {
    id?: string;
    tableNumber: string;
    tableLabel?: string;
    capacity?: number;
  } | null;
  menu: Array<{
    id: string;
    name: string;
    description?: string;
    items: Array<{
      id: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      isVegetarian?: boolean;
      isAlcoholic?: boolean;
      isAvailable?: boolean;
      targetDestination?: 'KITCHEN' | 'BAR' | 'HOOKAH' | string;
      dietaryType?: 'VEG' | 'NON_VEG' | 'EGG' | string;
      categoryName?: string;
      categoryId?: string;
      variants?: any;
      modifiers?: any;
    }>;
  }>;
}

export interface EventAssistanceRequestItem {
  code: string;
  label: string;
  quantity?: number;
  note?: string;
}

export type EventAssistanceStatus = 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface EventAssistanceRequest {
  id: string;
  eventId: string;
  restaurantId: string;
  tableNumber: string;
  tableId?: string | null;
  items: EventAssistanceRequestItem[];
  requestItems?: EventAssistanceRequestItem[];
  guestName?: string;
  guestNote?: string;
  status: EventAssistanceStatus;
  assignedStaffName?: string | null;
  assignedStaffUid?: string | null;
  acknowledgedAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface EventAssistanceSummary {
  newRequestsCount: number;
  acknowledgedCount: number;
  inProgressCount: number;
  completedCount: number;
  waitingTablesCount: number;
  new?: number;
  acknowledged?: number;
  inProgress?: number;
  completed?: number;
  waitingTables?: number;
}

export interface WeddingAccessRequest {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  weddingName: string;
  eventType: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  venueName: string;
  venueCity: string;
  estimatedGuestCount: number;
  cateringNotes?: string;
  cateringRestaurantId?: string;
  cateringRestaurantName?: string;
  additionalRequirements?: string;
  notes?: string;
  lifecycleStatus: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeddingWorkspace {
  id: string;
  name: string;
  ownerEmail: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  restaurantId: string;
  restaurantName?: string;
  restaurantSlug?: string;
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  isOrderingOpen?: boolean;
  createdAt?: string;
}

export interface WeddingWorkspaceDetail {
  workspace: {
    id: string;
    name: string;
    ownerEmail: string;
    status: string;
    createdAt?: string;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    phone?: string;
    currency: string;
  };
  event: (WeddingEvent & { orderCount?: number; orderRevenue?: number }) | null;
  tables: EventTable[];
  availableMenu: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      price: number;
      description?: string;
      isVegetarian?: boolean;
      isAlcoholic?: boolean;
      imageUrl?: string;
    }>;
  }>;
  rawItems: Array<{
    id: string;
    name: string;
    price: number;
    categoryId: string;
    isVegetarian?: boolean;
    isAlcoholic?: boolean;
  }>;
}


