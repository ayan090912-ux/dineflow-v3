import { Organization, Restaurant, MenuItem, MenuCategory, Table, Order, Employee, InventoryItem, Subscription, AuditLog, ThemeConfig } from '../types';

export const DEFAULT_THEME: ThemeConfig = {
  restaurantId: 'rest-1787446097984',
  restaurantName: 'CAFE.CO',
  logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
  bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
  primaryColor: '#e11d48',
  secondaryColor: '#475569',
  accentColor: '#f59e0b',
  backgroundColor: '#f8fafc',
  textColor: '#0f172a',
  fontFamily: 'sans',
  borderRadius: 'lg',
  currency: 'INR (₹)',
};

export const MOCK_ORGANIZATIONS: Organization[] = [];
export const MOCK_RESTAURANTS: Restaurant[] = [];
export const MOCK_CATEGORIES: MenuCategory[] = [
  { id: 'cat-starters', restaurantId: 'rest-1', name: 'Starters & Appetizers', order: 1, isEnabled: true },
  { id: 'cat-mains', restaurantId: 'rest-1', name: 'Main Course', order: 2, isEnabled: true },
  { id: 'cat-burgers', restaurantId: 'rest-1', name: 'Gourmet Burgers', order: 3, isEnabled: true },
  { id: 'cat-pizza', restaurantId: 'rest-1', name: 'Wood-Fired Pizza', order: 4, isEnabled: true },
  { id: 'cat-salads', restaurantId: 'rest-1', name: 'Fresh Salads & Bowls', order: 5, isEnabled: true },
  { id: 'cat-pasta', restaurantId: 'rest-1', name: 'Pasta & Risotto', order: 6, isEnabled: true },
  { id: 'cat-desserts', restaurantId: 'rest-1', name: 'Desserts & Sweets', order: 7, isEnabled: true },
  { id: 'cat-drinks', restaurantId: 'rest-1', name: 'Beverages & Shakes', order: 8, isEnabled: true },
];
export const MOCK_MENU_ITEMS: MenuItem[] = [];
export const MOCK_TABLES: Table[] = [];
export const MOCK_ORDERS: Order[] = [];
export const MOCK_EMPLOYEES: Employee[] = [];
export const MOCK_INVENTORY: InventoryItem[] = [];
export const MOCK_AUDIT_LOGS: AuditLog[] = [];
export const MOCK_CUSTOMER_REQUESTS: any[] = [];
