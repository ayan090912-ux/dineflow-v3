export interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
  code: string;
  flagEmoji: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { value: 'INR (₹)', label: 'INR (₹) - Indian Rupee', symbol: '₹', code: 'INR', flagEmoji: '🇮🇳' },
  { value: 'USD ($)', label: 'USD ($) - US Dollar', symbol: '$', code: 'USD', flagEmoji: '🇺🇸' },
  { value: 'EUR (€)', label: 'EUR (€) - Euro', symbol: '€', code: 'EUR', flagEmoji: '🇪🇺' },
  { value: 'GBP (£)', label: 'GBP (£) - British Pound', symbol: '£', code: 'GBP', flagEmoji: '🇬🇧' },
  { value: 'AED (AED)', label: 'AED (AED) - UAE Dirham', symbol: 'AED', code: 'AED', flagEmoji: '🇦🇪' },
];

export function getCurrencySymbol(currencyStr?: string): string {
  if (!currencyStr) return '₹';
  if (currencyStr.includes('₹') || currencyStr.includes('INR')) return '₹';
  if (currencyStr.includes('$') || currencyStr.includes('USD')) return '$';
  if (currencyStr.includes('€') || currencyStr.includes('EUR')) return '€';
  if (currencyStr.includes('£') || currencyStr.includes('GBP')) return '£';
  if (currencyStr.includes('AED')) return 'AED ';
  if (currencyStr.includes('¥') || currencyStr.includes('JPY')) return '¥';
  if (currencyStr.includes('SAR')) return 'SAR ';

  const match = currencyStr.match(/\(([^)]+)\)/);
  if (match && match[1]) return match[1];

  return currencyStr.trim() ? `${currencyStr.trim()} ` : '₹';
}

export function formatCurrency(amount: number, currencyStr?: string): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const symbol = getCurrencySymbol(currencyStr);
  return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
