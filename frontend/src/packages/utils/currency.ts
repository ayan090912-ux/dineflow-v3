export interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
  code: string;
  flagEmoji: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { value: 'INR (₹)', label: 'INR (₹) - Indian Rupee', symbol: '₹', code: 'INR', flagEmoji: '🇮🇳' },
];

export function getCurrencySymbol(currencyStr?: string): string {
  return '₹';
}

export function formatCurrency(amount: number, currencyStr?: string): string {
  const num = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `₹${num.toFixed(2)}`;
}
