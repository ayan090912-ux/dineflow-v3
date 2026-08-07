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
  { value: 'AED (AED)', label: 'AED (AED) - UAE Dirham', symbol: 'AED ', code: 'AED', flagEmoji: '🇦🇪' },
  { value: 'CAD ($)', label: 'CAD ($) - Canadian Dollar', symbol: 'C$', code: 'CAD', flagEmoji: '🇨🇦' },
  { value: 'AUD ($)', label: 'AUD ($) - Australian Dollar', symbol: 'A$', code: 'AUD', flagEmoji: '🇦🇺' },
  { value: 'SGD ($)', label: 'SGD ($) - Singapore Dollar', symbol: 'S$', code: 'SGD', flagEmoji: '🇸🇬' },
  { value: 'JPY (¥)', label: 'JPY (¥) - Japanese Yen', symbol: '¥', code: 'JPY', flagEmoji: '🇯🇵' },
];

export function getCurrencySymbol(currencyStr?: string): string {
  if (!currencyStr) return '₹';

  const found = CURRENCY_OPTIONS.find(
    (c) => c.value === currencyStr || c.code === currencyStr
  );
  if (found) return found.symbol;

  const match = currencyStr.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    return match[1];
  }

  if (currencyStr.includes('INR') || currencyStr.includes('₹')) return '₹';
  if (currencyStr.includes('USD')) return '$';
  if (currencyStr.includes('EUR')) return '€';
  if (currencyStr.includes('GBP')) return '£';
  if (currencyStr.includes('AED')) return 'AED ';
  if (currencyStr.includes('JPY') || currencyStr.includes('¥')) return '¥';

  return '₹';
}

export function formatCurrency(amount: number, currencyStr?: string): string {
  const symbol = getCurrencySymbol(currencyStr);
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${symbol}${num.toFixed(2)}`;
}
