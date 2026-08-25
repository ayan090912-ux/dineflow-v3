export type UserRole = 'SUPER_ADMIN' | 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER' | 'MANAGER' | 'CHEF' | 'WAITER' | 'CUSTOMER' | 'BAR_STAFF' | 'BARTENDER' | 'INVENTORY_MANAGER';

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
  restaurantId: string;
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

export type BusinessType = 'RESTAURANT' | 'CAFE' | 'BAR' | 'FOOD_CART' | 'FOOD_TRUCK';

export interface Restaurant {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  cuisine: string;
  businessType?: BusinessType;
  hasBar?: boolean;
  hasTables?: boolean;
  hasKitchen?: boolean;
  hasWaiter?: boolean;
  orderNumberPrefix?: string;
  restaurantType?: string;
  description?: string;
  address: string;
  locality?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  phone: string;
  email?: string;
  website?: string;
  gstNumber?: string;
  taxPercentage?: number;
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
  tablesCount: number;
  theme: ThemeConfig;
  features?: RestaurantFeatures;
  domain?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  submittedAt?: string;
  approvedAt?: string;
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
  image: string;
  isAvailable: boolean;
  isVegetarian?: boolean;
  dietaryType?: 'VEG' | 'NON_VEG';
  isSpicy?: boolean;
  calories?: number;
  prepTimeMinutes?: number;
  targetDestination?: 'KITCHEN' | 'BAR';
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
  isBestSeller?: boolean;
  options?: {
    name: string;
    choices: { name: string; priceDelta: number }[];
  }[];
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  icon?: string;
  order: number;
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
  station?: 'KITCHEN' | 'BAR';
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

export interface Bill {
  id: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  tableSessionId: string;
  businessDayId?: string;
  orders: Order[];
  items: BillItem[];
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  taxBreakdown?: TaxSnapshot[];
  discountAmount: number;
  grandTotal: number;
  status: BillStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus: 'UNPAID' | 'PAYMENT_PENDING' | 'PAID' | 'FAILED';
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
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  openedBy?: string;
  closedBy?: string;
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
  // Table Reservation
  reservationDetails?: TableReservation;
  reservedForName?: string;
  reservedForPhone?: string;
  reservationTime?: string;
  partySize?: number;
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
  tableNumber: string;
  requestType: CustomerRequestType;
  customTitle?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: CustomerRequestStatus;
  requestedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  assignedWaiterId?: string;
  assignedWaiterName?: string;
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
  targetDestination?: 'KITCHEN' | 'BAR';
  isAlcoholic?: boolean;
  alcoholPercentage?: number;
  glassSize?: string;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId?: string;
  tableNumber: string;
  tableSessionId?: string;
  businessDayId?: string;
  orderType?: 'DINE_IN' | 'PICKUP';
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  totalAmount: number;
  taxAmount: number;
  tipAmount: number;
  status: OrderStatus;
  targetDestination?: 'KITCHEN' | 'BAR' | 'MIXED';
  kitchenStatus?: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED';
  barStatus?: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED';
  kitchenCompletedAt?: string;
  barCompletedAt?: string;
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
  station: 'KITCHEN' | 'BAR';
  status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  customerName?: string;
  orderType?: 'DINE_IN' | 'PICKUP';
}

export function getFulfillmentStation(item: {
  targetDestination?: string;
  isAlcoholic?: boolean;
  category?: string;
  barCategory?: string;
  name?: string;
}): 'KITCHEN' | 'BAR' {
  if (item.targetDestination === 'BAR' || item.isAlcoholic === true || item.barCategory !== undefined) {
    return 'BAR';
  }
  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  if (
    cat.includes('bar') ||
    cat.includes('cocktail') ||
    cat.includes('beer') ||
    cat.includes('wine') ||
    cat.includes('whiskey') ||
    cat.includes('spirit') ||
    cat.includes('beverage') ||
    cat.includes('drink') ||
    name.includes('beer') ||
    name.includes('kingfisher') ||
    name.includes('wine') ||
    name.includes('whiskey') ||
    name.includes('cocktail') ||
    name.includes('vodka') ||
    name.includes('rum') ||
    name.includes('gin') ||
    name.includes('brandy') ||
    name.includes('coke') ||
    name.includes('pepsi') ||
    name.includes('sprite') ||
    name.includes('soda') ||
    name.includes('juice') ||
    name.includes('mocktail')
  ) {
    return 'BAR';
  }
  return 'KITCHEN';
}

export interface Employee {
  id: string;
  restaurantId: string;
  name: string;
  role: 'MANAGER' | 'CHEF' | 'WAITER' | 'HOST' | 'CASHIER' | 'BARTENDER' | 'BAR_STAFF' | 'INVENTORY_MANAGER';
  email: string;
  phone: string;
  status: 'ON_CLOCK' | 'OFF_CLOCK' | 'ON_BREAK';
  hourlyRate: number;
  shift?: string;
  assignedSection?: string;
  shiftStart?: string;
  password?: string;
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
