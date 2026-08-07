export type UserRole = 'SUPER_ADMIN' | 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER' | 'MANAGER' | 'CHEF' | 'WAITER' | 'CUSTOMER' | 'BAR_STAFF' | 'BARTENDER';

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
  role: UserRole;
  avatar?: string;
  restaurantId?: string;
  orgId?: string;
  isEmailVerified?: boolean;
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
  | 'LIVE'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'DEACTIVATED'
  | 'SUSPENDED'
  | 'ARCHIVED'
  | 'DELETED';

export interface Restaurant {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  cuisine: string;
  restaurantType?: string;
  description?: string;
  address: string;
  city?: string;
  state?: string;
  country?: string;
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
  type: 'NEW_REGISTRATION' | 'LAUNCH_REQUESTED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUSPENDED';
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
  | 'Shots'
  | 'Premium'
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
  isSpicy?: boolean;
  calories?: number;
  prepTimeMinutes?: number;
  targetDestination?: 'KITCHEN' | 'BAR';
  isAlcoholic?: boolean;
  alcoholPercentage?: number;
  bottleSize?: string;
  glassSize?: string;
  barCategory?: BarCategoryName;
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

export interface Table {
  id: string;
  restaurantId: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'WAITING_FOR_SERVICE' | 'BILL_REQUESTED' | 'WAITER_CALLED' | 'MERGED';
  qrCodeUrl: string;
  activeOrderId?: string;
  assignedWaiterName?: string;
  isVip?: boolean;
  sessionStartedAt?: string;
  section?: string;
  shape?: 'SQUARE' | 'ROUND' | 'RECTANGLE';
  // Table Merging for large gatherings
  isMerged?: boolean;
  mergedWithIds?: string[];
  mergedTableNumbers?: string[];
  parentMergedTableId?: string;
  mergedGroupLabel?: string;
  // Table Reservation
  reservationDetails?: TableReservation;
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

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'IN_KITCHEN' | 'PREPARING_DRINKS' | 'READY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
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
  tableNumber: string;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  totalAmount: number;
  taxAmount: number;
  tipAmount: number;
  status: OrderStatus;
  targetDestination?: 'KITCHEN' | 'BAR' | 'MIXED';
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  paymentMethod?: 'CASH' | 'CARD' | 'APPLE_PAY' | 'QR_CODE';
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
    changedBy: string;
    reason?: string;
  }[];
}

export interface Employee {
  id: string;
  restaurantId: string;
  name: string;
  role: 'MANAGER' | 'CHEF' | 'WAITER' | 'HOST' | 'CASHIER' | 'BARTENDER' | 'BAR_STAFF';
  email: string;
  phone: string;
  status: 'ON_CLOCK' | 'OFF_CLOCK' | 'ON_BREAK';
  hourlyRate: number;
  shift?: string;
  assignedSection?: string;
  shiftStart?: string;
  password?: string;
  isAccountDisabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface InventoryItem {
  id: string;
  restaurantId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  costPerUnit: number;
  lastRestocked: string;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
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
