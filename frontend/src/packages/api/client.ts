import type {
  Order,
  OrderItem,
  OrderStatus,
  Restaurant,
  MenuCategory,
  MenuItem,
  Table,
  Employee,
  InventoryItem,
  Supplier,
  AuditLog,
  User,
  AuthTokens,
  CustomerRequest,
  WaiterNotification,
  PlatformNotification,
  BarCategory,
  BarMenuItem,
  TableSession,
  BusinessDay,
  FulfillmentTicket,
  Bill,
  BusinessType,
  RestaurantLifecycleStatus,
  ThemeConfig,
  PaymentMethod,
  BillingConfig,
  Tax,
  AdminStats,
  AdminOrder,
  Organization,
  AdminApplication,
  AdminRestaurant,
} from '../types';

import {
  delay,
  getProductionOrigin,
  PortalScope,
  SESSION_KEYS,
  TOKEN_KEYS,
  DATABASE_STORAGE_KEY,
  getPortalScopeFromPath,
  getApiBaseUrl,
  normalizeOrder,
  GLOBAL_MULTI_TENANT_RESTAURANTS,
  GLOBAL_MULTI_TENANT_CATEGORIES,
  GLOBAL_MULTI_TENANT_MENU_ITEMS,
  GLOBAL_MULTI_TENANT_TABLES,
} from './core/helpers';

import { realtimeBus } from './realtime';
import { BaseApiClient } from './core/baseClient';
import { AuthClient } from './domains/authClient';
import { AdminClient } from './domains/adminClient';
import { OrderClient } from './domains/orderClient';
import { BillingClient } from './domains/billingClient';
import { CustomerClient } from './domains/customerClient';
import { RestaurantClient } from './domains/restaurantClient';

// Re-export core helpers, types, and bus for backwards compatibility
export {
  delay,
  getProductionOrigin,
  SESSION_KEYS,
  TOKEN_KEYS,
  DATABASE_STORAGE_KEY,
  getPortalScopeFromPath,
  getApiBaseUrl,
  normalizeOrder,
  GLOBAL_MULTI_TENANT_RESTAURANTS,
  GLOBAL_MULTI_TENANT_CATEGORIES,
  GLOBAL_MULTI_TENANT_MENU_ITEMS,
  GLOBAL_MULTI_TENANT_TABLES,
  realtimeBus,
  BaseApiClient,
  AuthClient,
  AdminClient,
  OrderClient,
  BillingClient,
  CustomerClient,
  RestaurantClient,
};

export type { PortalScope };

/**
 * Unified API Client for Dinely Frontend.
 *
 * Implements the Composition Facade pattern:
 * - Domain operations are modularized under specialized domain clients (`auth`, `admin`, `restaurant`, `orderClient`, `billing`, `customer`).
 * - Exposes top-level backward-compatible delegates so existing UI components continue functioning seamlessly.
 */
export class DinelyApiClient extends BaseApiClient {
  public readonly auth: AuthClient;
  public readonly admin: AdminClient;
  public readonly restaurant: RestaurantClient;
  public readonly orderClient: OrderClient;
  public readonly billing: BillingClient;
  public readonly customer: CustomerClient;

  constructor() {
    super();
    this.auth = new AuthClient(this);
    this.admin = new AdminClient(this);
    this.restaurant = new RestaurantClient(this);
    this.orderClient = new OrderClient(this);
    this.billing = new BillingClient(this);
    this.customer = new CustomerClient(this);
  }

  // ==========================================
  // AUTH DOMAIN DELEGATES
  // ==========================================
  async checkUserExists(email: string): Promise<boolean> {
    return this.auth.checkUserExists(email);
  }

  async registerOwner(data: { name: string; email: string; phone?: string; password?: string }): Promise<{ user: User; tokens: AuthTokens }> {
    return this.auth.registerOwner(data);
  }

  async loginOwner(email: string, password?: string): Promise<{ user: User; tokens: AuthTokens; restaurant?: Restaurant | null }> {
    return this.auth.loginOwner(email, password);
  }

  async authenticateWithGoogle(googleData: {
    googleUid: string;
    email: string;
    name: string;
    photoURL?: string;
    idToken?: string;
  }) {
    return this.auth.authenticateWithGoogle(googleData);
  }

  async loginPlatformAdmin(email: string, password?: string): Promise<{ user: User; tokens: AuthTokens }> {
    return this.auth.loginPlatformAdmin(email, password);
  }

  async loginStaffTerminal(role: 'KITCHEN' | 'WAITER' | 'BAR' | 'INVENTORY', identifier: string, password?: string) {
    return this.auth.loginStaffTerminal(role, identifier, password);
  }

  async loginKitchen(identifier: string, password?: string) {
    return this.auth.loginKitchen(identifier, password);
  }

  async loginWaiter(identifier: string, password?: string, restaurantId?: string) {
    return this.auth.loginWaiter(identifier, password);
  }

  async loginBar(identifier: string, password?: string) {
    return this.auth.loginBar(identifier, password);
  }

  async loginInventory(identifier: string, password?: string) {
    return this.auth.loginInventory(identifier, password);
  }

  async loginKitchenTerminal(accessPin: string, restaurantId?: string): Promise<any> {
    return this.auth.loginKitchenTerminal(accessPin, restaurantId);
  }

  async loginBarTerminal(accessPin: string, restaurantId?: string): Promise<any> {
    return this.auth.loginBarTerminal(accessPin, restaurantId);
  }

  async loginInventoryTerminal(accessPin: string, restaurantId?: string): Promise<any> {
    return this.auth.loginInventoryTerminal(accessPin, restaurantId);
  }

  async loginStaff(username: string, password?: string) {
    return this.auth.loginStaff(username, password);
  }

  async logout(scope?: PortalScope): Promise<void> {
    return this.auth.logout(scope);
  }

  async verifyOwnerEmail(email: string, code?: string) {
    return this.auth.verifyOwnerEmail(email, code);
  }

  // ==========================================
  // PLATFORM ADMIN DOMAIN DELEGATES
  // ==========================================
  async purgePlatformDemoData(): Promise<any> {
    return this.admin.purgePlatformDemoData();
  }

  async getPlatformStats(): Promise<AdminStats> {
    return this.admin.getPlatformStats();
  }

  async getPlatformOrders(): Promise<AdminOrder[]> {
    return this.admin.getPlatformOrders();
  }

  async getOrganizations(): Promise<Organization[]> {
    return this.admin.getOrganizations();
  }

  async getPlatformApplications(statusFilter?: string): Promise<AdminApplication[]> {
    return this.admin.getPlatformApplications(statusFilter);
  }

  async getPendingRestaurants(): Promise<AdminRestaurant[]> {
    return this.admin.getPendingRestaurants();
  }

  async getAllRestaurants(): Promise<AdminRestaurant[]> {
    return this.admin.getAllRestaurants();
  }

  async getPlatformRestaurants(): Promise<AdminRestaurant[]> {
    return this.admin.getPlatformRestaurants();
  }

  async approveRestaurant(restaurantId: string) {
    return this.admin.approveRestaurant(restaurantId);
  }

  async rejectRestaurant(restaurantId: string, reason?: string) {
    return this.admin.rejectRestaurant(restaurantId, reason);
  }

  async requestChangesRestaurant(restaurantId: string, reason: string) {
    return this.admin.requestChangesRestaurant(restaurantId, reason);
  }

  async dismissRestaurant(restaurantId: string, reason?: string) {
    return this.admin.dismissRestaurant(restaurantId, reason);
  }

  async suspendRestaurant(restaurantId: string, reason?: string) {
    return this.admin.suspendRestaurant(restaurantId, reason);
  }

  async activateRestaurant(restaurantId: string) {
    return this.admin.activateRestaurant(restaurantId);
  }

  async reactivateRestaurant(restaurantId: string) {
    return this.admin.reactivateRestaurant(restaurantId);
  }

  async deactivateRestaurant(restaurantId: string, reason = 'Deactivated by Admin') {
    return this.admin.deactivateRestaurant(restaurantId, reason);
  }

  async deleteRestaurant(restaurantId: string, reason = 'Permanently soft-deleted by Platform Admin') {
    return this.admin.deleteRestaurant(restaurantId, reason);
  }

  async sendReminder(restaurantId: string, reminderType: string, customMessage?: string) {
    return this.admin.sendReminder(restaurantId, reminderType, customMessage);
  }

  async markNotificationRead(notifId: string) {
    return this.admin.markNotificationRead(notifId);
  }

  async getPlatformNotifications(role: 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER', restaurantId?: string) {
    return this.admin.getPlatformNotifications(role, restaurantId);
  }

  async getAuditLogs() {
    return this.admin.getAuditLogs();
  }

  // ==========================================
  // RESTAURANT DOMAIN DELEGATES
  // ==========================================
  async getRestaurants(): Promise<Restaurant[]> {
    return this.restaurant.getRestaurants();
  }

  async getOwnerRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    return this.restaurant.getOwnerRestaurants(ownerEmail, ownerUid);
  }

  async getOwnedRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    return this.restaurant.getOwnedRestaurants(ownerEmail, ownerUid);
  }

  async createRestaurantForOwner(restData: {
    name: string;
    cuisine?: string;
    ownerEmail?: string;
    branchName?: string;
    city?: string;
    address?: string;
    phone?: string;
    businessType?: BusinessType;
    [key: string]: any;
  }): Promise<Restaurant> {
    return this.restaurant.createRestaurantForOwner(restData as any);
  }

  purgeDemoDataForRestaurant(restaurantId: string) {
    return this.restaurant.purgeDemoDataForRestaurant(restaurantId);
  }

  async submitRestaurantLaunch(setupData: any) {
    return this.restaurant.submitRestaurantLaunch(setupData);
  }

  async resubmitRestaurantLaunch(restaurantId: string) {
    return this.restaurant.resubmitRestaurantLaunch(restaurantId);
  }

  async createNewBranchOutlet(data: { name: string; branchName: string; city: string; address: string; phone: string; cuisine: string }) {
    return this.restaurant.createNewBranchOutlet(data);
  }

  async switchActiveRestaurant(restaurantId: string): Promise<Restaurant | null> {
    return this.restaurant.switchActiveRestaurant(restaurantId);
  }

  async getWorkspaceModules(restaurantId?: string) {
    return this.restaurant.getWorkspaceModules(restaurantId);
  }

  async updateWorkspaceModules(
    restaurantId: string,
    enabledModules: string[],
    moduleFlags?: any
  ) {
    return this.restaurant.updateWorkspaceModules(restaurantId, enabledModules, moduleFlags);
  }

  async syncRestaurantToBackend(rest: Restaurant) {
    return this.restaurant.syncRestaurantToBackend(rest);
  }

  async getRestaurantDetails(restaurantId?: string) {
    return this.restaurant.getRestaurantDetails(restaurantId);
  }

  async resolveRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    return this.restaurant.resolveRestaurantBySlug(slug);
  }

  async resolveRestaurantFromHostname(hostname?: string): Promise<Restaurant | null> {
    return this.restaurant.resolveRestaurantFromHostname(hostname);
  }

  async updateRestaurantDetails(restaurantId: string, updates: Partial<Restaurant>) {
    return this.restaurant.updateRestaurantDetails(restaurantId, updates);
  }

  async updateRestaurantTheme(restaurantId: string, theme: ThemeConfig) {
    return this.restaurant.updateRestaurantTheme(restaurantId, theme);
  }

  async getTables(restaurantId?: string): Promise<Table[]> {
    return this.restaurant.getTables(restaurantId);
  }

  async createTable(tableData: Partial<Table>): Promise<Table> {
    return this.restaurant.createTable(tableData);
  }

  async updateTable(tableId: string, updates: Partial<Table>): Promise<Table | null> {
    return this.restaurant.updateTable(tableId, updates);
  }

  async deleteTable(tableId: string, restaurantId?: string): Promise<boolean> {
    return this.restaurant.deleteTable(tableId, restaurantId);
  }

  async mergeTables(tableIds: string[], customLabel?: string) {
    return this.restaurant.mergeTables(tableIds, customLabel);
  }

  async unmergeTables(tableIds: string[]) {
    return this.restaurant.unmergeTables(tableIds);
  }

  async reserveTable(tableId: string, details: { reservedForName: string; reservedForPhone?: string; reservationTime: string; partySize: number; notes?: string }) {
    return this.restaurant.reserveTable(tableId, details);
  }

  async cancelTableReservation(tableId: string) {
    return this.restaurant.cancelTableReservation(tableId);
  }

  async checkInReservedTable(tableId: string) {
    return this.restaurant.checkInReservedTable(tableId);
  }

  async updateTableStatus(tableId: string, status: any, updatedBy?: any) {
    return this.restaurant.updateTableStatus(tableId, status, updatedBy);
  }

  async getActiveTableSessions(restaurantId?: string): Promise<TableSession[]> {
    return this.restaurant.getActiveTableSessions(restaurantId);
  }

  async getOrCreateTableSession(restaurantId?: string, tableId?: string, tableNumber?: string): Promise<TableSession | null> {
    return this.restaurant.getOrCreateTableSession(restaurantId, tableId, tableNumber);
  }

  async closeTableSession(
    arg1: string | { restaurantId?: string; tableId?: string; waiterName?: string; tableSessionId?: string },
    arg2?: string,
    arg3?: string,
    arg4?: string
  ) {
    return this.restaurant.closeTableSession(arg1, arg2, arg3, arg4);
  }

  async getCategories(restaurantId?: string): Promise<MenuCategory[]> {
    return this.restaurant.getCategories(restaurantId);
  }

  async createCategory(catData: Partial<MenuCategory>): Promise<MenuCategory> {
    return this.restaurant.createCategory(catData);
  }

  async addCategory(data: { restaurantId?: string; name: string; icon?: string }) {
    return this.restaurant.addCategory(data);
  }

  async updateCategory(id: string, updates: Partial<MenuCategory>) {
    return this.restaurant.updateCategory(id, updates);
  }

  async deleteCategory(id: string) {
    return this.restaurant.deleteCategory(id);
  }

  async toggleCategoryStatus(id: string) {
    return this.restaurant.toggleCategoryStatus(id);
  }

  async getMenuItems(restaurantId?: string): Promise<MenuItem[]> {
    return this.restaurant.getMenuItems(restaurantId);
  }

  async addMenuItem(itemData: Partial<MenuItem>) {
    return this.restaurant.addMenuItem(itemData);
  }

  async createMenuItem(itemData: Partial<MenuItem>): Promise<MenuItem> {
    return this.restaurant.createMenuItem(itemData);
  }

  async updateMenuItem(itemId: string, updates: Partial<MenuItem>) {
    return this.restaurant.updateMenuItem(itemId, updates);
  }

  async deleteMenuItem(itemId: string, restaurantId?: string) {
    return this.restaurant.deleteMenuItem(itemId, restaurantId);
  }

  async duplicateMenuItem(itemId: string) {
    return this.restaurant.duplicateMenuItem(itemId);
  }

  async toggleMenuItemAvailability(itemId: string, restaurantId?: string, currentStatus?: boolean) {
    return this.restaurant.toggleMenuItemAvailability(itemId, restaurantId, currentStatus);
  }

  async getBarCategories(restaurantId?: string) {
    return this.restaurant.getBarCategories(restaurantId);
  }

  async addBarCategory(data: { restaurantId?: string; name: string; isEnabled?: boolean }) {
    return this.restaurant.addBarCategory(data);
  }

  async updateBarCategory(id: string, updates: Partial<BarCategory>) {
    return this.restaurant.updateBarCategory(id, updates);
  }

  async deleteBarCategory(id: string) {
    return this.restaurant.deleteBarCategory(id);
  }

  async toggleBarCategoryStatus(id: string) {
    return this.restaurant.toggleBarCategoryStatus(id);
  }

  async getBarMenuItems(restaurantId?: string) {
    return this.restaurant.getBarMenuItems(restaurantId);
  }

  async addBarMenuItem(itemData: Partial<BarMenuItem>) {
    return this.restaurant.addBarMenuItem(itemData);
  }

  async updateBarMenuItem(itemId: string, updates: Partial<BarMenuItem>) {
    return this.restaurant.updateBarMenuItem(itemId, updates);
  }

  async duplicateBarMenuItem(itemId: string) {
    return this.restaurant.duplicateBarMenuItem(itemId);
  }

  async toggleBarMenuItemAvailability(itemId: string) {
    return this.restaurant.toggleBarMenuItemAvailability(itemId);
  }

  async deleteBarMenuItem(itemId: string) {
    return this.restaurant.deleteBarMenuItem(itemId);
  }

  async bulkImportBarMenuItems(restaurantId: string, items: Partial<BarMenuItem>[]) {
    return this.restaurant.bulkImportBarMenuItems(restaurantId, items);
  }

  async getEmployees(restaurantId?: string): Promise<Employee[]> {
    return this.restaurant.getEmployees(restaurantId);
  }

  async addEmployee(empData: Partial<Employee>): Promise<Employee> {
    return this.restaurant.addEmployee(empData);
  }

  async updateEmployee(empId: string, updates: Partial<Employee>) {
    return this.restaurant.updateEmployee(empId, updates);
  }

  async toggleEmployeeAccountStatus(empId: string) {
    return this.restaurant.toggleEmployeeAccountStatus(empId);
  }

  async resetEmployeePassword(empId: string, customPass?: string) {
    return this.restaurant.resetEmployeePassword(empId, customPass);
  }

  async deleteEmployee(empId: string) {
    return this.restaurant.deleteEmployee(empId);
  }

  async updateEmployeeStatus(empId: string, status: any) {
    return this.restaurant.updateEmployeeStatus(empId, status);
  }

  async getSuppliers(restaurantId?: string): Promise<Supplier[]> {
    return this.restaurant.getSuppliers(restaurantId);
  }

  async addSupplier(supData: Partial<Supplier>): Promise<Supplier> {
    return this.restaurant.addSupplier(supData);
  }

  async deleteSupplier(supplierId: string): Promise<void> {
    return this.restaurant.deleteSupplier(supplierId);
  }

  async getInventory(restaurantId?: string): Promise<InventoryItem[]> {
    return this.restaurant.getInventory(restaurantId);
  }

  async addInventoryItem(invData: Partial<InventoryItem>): Promise<InventoryItem> {
    return this.restaurant.addInventoryItem(invData);
  }

  async updateInventoryQuantity(itemId: string, delta: number) {
    return this.restaurant.updateInventoryQuantity(itemId, delta);
  }

  async deleteInventoryItem(itemId: string) {
    return this.restaurant.deleteInventoryItem(itemId);
  }

  async getCurrentBusinessDay(restaurantId?: string): Promise<BusinessDay | null> {
    return this.restaurant.getCurrentBusinessDay(restaurantId);
  }

  async getBusinessDayPrecheck(restaurantId?: string) {
    return this.restaurant.getBusinessDayPrecheck(restaurantId);
  }

  async openBusinessDay(restaurantId?: string, openedBy?: string) {
    return this.restaurant.openBusinessDay(restaurantId, openedBy);
  }

  async closeBusinessDay(
    restaurantId?: string,
    closedBy?: string,
    options?: any
  ) {
    return this.restaurant.closeBusinessDay(restaurantId, closedBy, options);
  }

  async getBusinessDayHistory(restaurantId?: string): Promise<BusinessDay[]> {
    return this.restaurant.getBusinessDayHistory(restaurantId);
  }

  async createOrganization(orgData: any) {
    return this.restaurant.createOrganization(orgData);
  }

  // ==========================================
  // ORDERS DOMAIN DELEGATES
  // ==========================================
  async getOrders(restaurantId?: string): Promise<Order[]> {
    return this.orderClient.getOrders(restaurantId);
  }

  async getCustomerOrders(restaurantId?: string, tableId?: string, tableSessionId?: string): Promise<Order[]> {
    return this.orderClient.getCustomerOrders(restaurantId, tableId, tableSessionId);
  }

  async getFulfillmentTickets(restaurantId?: string, station?: 'KITCHEN' | 'BAR') {
    return this.orderClient.getFulfillmentTickets(restaurantId, station);
  }

  async updateFulfillmentTicketStatus(
    ticketId: string,
    status: any,
    station?: any
  ) {
    return this.orderClient.updateFulfillmentTicketStatus(ticketId, status, station);
  }

  async createOrder(orderData: Partial<Order>): Promise<Order> {
    return this.orderClient.createOrder(orderData);
  }

  async createCustomerOrder(orderData: any) {
    return this.orderClient.createCustomerOrder(orderData);
  }

  async acceptOrder(orderId: string, prepTime: number) {
    return this.orderClient.acceptOrder(orderId, prepTime);
  }

  async updateOrderETA(orderId: string, deltaOrMins: number, reason?: string, note?: string) {
    return this.orderClient.updateOrderETA(orderId, deltaOrMins, reason, note);
  }

  async toggleOrderTimer(orderId: string) {
    return this.orderClient.toggleOrderTimer(orderId);
  }

  async markOrderReady(orderId: string) {
    return this.orderClient.markOrderReady(orderId);
  }

  async deliverOrder(orderId: string) {
    return this.orderClient.deliverOrder(orderId);
  }

  async updateOrderStatus(orderId: string, status: any) {
    return this.orderClient.updateOrderStatus(orderId, status);
  }

  async updateKitchenStatus(orderId: string, status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED') {
    return this.orderClient.updateKitchenStatus(orderId, status);
  }

  async updateBarStatus(orderId: string, status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED') {
    return this.orderClient.updateBarStatus(orderId, status);
  }

  async getKitchenAnalytics(restaurantId?: string) {
    return this.orderClient.getKitchenAnalytics(restaurantId);
  }

  async getSmartETARecommendation(itemNames?: any) {
    return this.orderClient.getSmartETARecommendation(itemNames);
  }

  async getBarAnalytics(restaurantId?: string) {
    return this.orderClient.getBarAnalytics(restaurantId);
  }

  // ==========================================
  // BILLING DOMAIN DELEGATES
  // ==========================================
  async getRunningTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    return this.billing.getRunningTableBill(restaurantId, tableNumber, targetSessionId);
  }

  async requestTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    return this.billing.requestTableBill(restaurantId, tableNumber, targetSessionId);
  }

  async recordBillPayment(billId: string, paymentMethod: PaymentMethod = 'CASH'): Promise<Bill | null> {
    return this.billing.recordBillPayment(billId, paymentMethod);
  }

  async closeTableSessionAndGenerateBill(
    sessionId: string,
    waiterName?: string,
    paymentMethod?: PaymentMethod
  ): Promise<{ session: TableSession | null; bill: Bill | null }> {
    return this.billing.closeTableSessionAndGenerateBill(sessionId, waiterName, paymentMethod);
  }

  async getBillingConfig(restaurantId?: string): Promise<BillingConfig> {
    return this.billing.getBillingConfig(restaurantId);
  }

  async updateBillingConfig(restaurantId: string, config: Partial<BillingConfig>): Promise<BillingConfig> {
    return this.billing.updateBillingConfig(restaurantId, config);
  }

  async uploadUpiQrImage(restaurantId: string, qrDataUrl: string, merchantName?: string, upiId?: string) {
    return this.billing.uploadUpiQrImage(restaurantId, qrDataUrl, merchantName, upiId);
  }

  async calculateTableBill(
    restaurantId: string,
    payload: { tableNumber: string; sessionId?: string; tipAmount?: number; discountAmount?: number; taxRate?: number }
  ) {
    return this.billing.calculateTableBill(restaurantId, payload);
  }

  async generateTableInvoice(
    restaurantId: string,
    payload: {
      tableNumber: string;
      tableId?: string;
      tableSessionId?: string;
      sessionId?: string;
      tipAmount?: number;
      discountAmount?: number;
      discountPercentage?: number;
      serviceChargePercentage?: number;
      taxRate?: number;
      paymentMethod?: string;
      waiterName?: string;
      customerName?: string;
      customerPhone?: string;
      orderType?: string;
      [key: string]: any;
    }
  ) {
    return this.billing.generateTableInvoice(restaurantId, payload);
  }

  async markBillPayment(
    restaurantId: string,
    billId: string,
    paymentMethod: PaymentMethod = 'CASH',
    verifiedBy: string = 'Staff',
    paymentReference?: string
  ): Promise<Bill> {
    return this.billing.markBillPayment(restaurantId, billId, paymentMethod, verifiedBy, paymentReference);
  }

  async reportCustomerPayment(restaurantId: string, billId: string, details?: any): Promise<any> {
    return this.billing.reportCustomerPayment(restaurantId, billId, details);
  }

  async closeTableSettlement(restaurantId: string, billId: string, closedBy: string = 'Staff') {
    return this.billing.closeTableSettlement(restaurantId, billId, closedBy);
  }

  async getBills(restaurantId?: string, statusFilter?: string, paymentStatus?: string, tableNumber?: string): Promise<Bill[]> {
    return this.billing.getBills(restaurantId, statusFilter, paymentStatus, tableNumber);
  }

  async getBillingStats(restaurantId?: string) {
    return this.billing.getBillingStats(restaurantId);
  }

  async getTaxes(restaurantId?: string): Promise<Tax[]> {
    return this.billing.getTaxes(restaurantId);
  }

  async createTax(restaurantId: string, taxData: Partial<Tax>): Promise<Tax> {
    return this.billing.createTax(restaurantId, taxData);
  }

  async updateTax(restaurantId: string, taxId: string, updates: Partial<Tax>): Promise<Tax> {
    return this.billing.updateTax(restaurantId, taxId, updates);
  }

  async activateTax(restaurantId: string, taxId: string): Promise<Tax> {
    return this.billing.activateTax(restaurantId, taxId);
  }

  async deactivateTax(restaurantId: string, taxId: string): Promise<Tax> {
    return this.billing.deactivateTax(restaurantId, taxId);
  }

  async calculateTaxes(restaurantId: string, items: any[], orderType: string = 'DINE_IN') {
    return this.billing.calculateTaxes(restaurantId, items, orderType);
  }

  // ==========================================
  // CUSTOMER DOMAIN DELEGATES
  // ==========================================
  async getWaiterNotifications(restaurantId?: string): Promise<WaiterNotification[]> {
    return this.customer.getWaiterNotifications(restaurantId);
  }

  async createCustomerRequest(data: {
    restaurantId?: string;
    tableId?: string;
    tableNumber: string;
    type?: 'CALL_WAITER' | 'REQUEST_BILL' | 'SERVICE' | string;
    requestType?: string;
    customTitle?: string;
    message?: string;
    customerNotes?: string;
    notes?: string;
    priority?: string;
    tableSessionId?: string;
    [key: string]: any;
  }) {
    return this.customer.createCustomerRequest(data);
  }

  async getCustomerRequests(restaurantId?: string, statusFilter?: string): Promise<CustomerRequest[]> {
    return this.customer.getCustomerRequests(restaurantId, statusFilter);
  }

  async updateCustomerRequest(requestId: string, statusVal: string, waiterName?: string): Promise<CustomerRequest> {
    return this.customer.updateCustomerRequest(requestId, statusVal, waiterName);
  }

  async requestBill(tableNumber: string, restaurantId?: string, tableId?: string, tableSessionId?: string) {
    return this.customer.requestBill(tableNumber, restaurantId, tableId, tableSessionId);
  }

  async callWaiter(tableNumber: string, reason: string, restaurantId?: string) {
    return this.customer.callWaiter(tableNumber, reason, restaurantId);
  }

  async acceptCustomerRequest(reqId: string, waiterName?: string) {
    return this.customer.acceptCustomerRequest(reqId, waiterName);
  }

  async rejectCustomerRequest(reqId: string, waiterName?: string) {
    return this.customer.rejectCustomerRequest(reqId, waiterName);
  }

  async updateCustomerRequestStatus(reqId: string, status: any, waiterName?: string) {
    return this.customer.updateCustomerRequestStatus(reqId, status, waiterName);
  }

  async transferCustomerRequest(reqId: string, newWaiterId: string) {
    return this.customer.transferCustomerRequest(reqId, newWaiterId);
  }

  async sendWaiterBroadcast(message: string, senderId?: string) {
    return this.customer.sendWaiterBroadcast(message, senderId);
  }

  async markAllNotificationsRead() {
    return this.customer.markAllNotificationsRead();
  }
}

// Single singleton facade instance consumed across the entire application
export const api = new DinelyApiClient();

// Standalone domain clients if callers prefer domain-specific dependency injection
export const authApi = api.auth;
export const adminApi = api.admin;
export const restaurantApi = api.restaurant;
export const orderApi = api.orderClient;
export const billingApi = api.billing;
export const customerApi = api.customer;
