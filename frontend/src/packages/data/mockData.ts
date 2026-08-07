import { Organization, Restaurant, MenuItem, MenuCategory, Table, Order, Employee, InventoryItem, Subscription, AuditLog, ThemeConfig } from '../types';

export const DEFAULT_THEME: ThemeConfig = {
  restaurantId: 'rest-default',
  restaurantName: 'New Restaurant',
  logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
  bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
  primaryColor: '#e11d48',
  secondaryColor: '#475569',
  accentColor: '#f59e0b',
  backgroundColor: '#f8fafc',
  textColor: '#0f172a',
  fontFamily: 'sans',
  borderRadius: 'lg',
  currency: 'USD ($)',
};

export const MOCK_ORGANIZATIONS: Organization[] = [];
export const MOCK_RESTAURANTS: Restaurant[] = [];
export const MOCK_CATEGORIES: MenuCategory[] = [];
export const MOCK_MENU_ITEMS: MenuItem[] = [];
export const MOCK_TABLES: Table[] = [];
export const MOCK_ORDERS: Order[] = [];
export const MOCK_EMPLOYEES: Employee[] = [];
export const MOCK_INVENTORY: InventoryItem[] = [];
export const MOCK_AUDIT_LOGS: AuditLog[] = [];
export const MOCK_CUSTOMER_REQUESTS: any[] = [];
