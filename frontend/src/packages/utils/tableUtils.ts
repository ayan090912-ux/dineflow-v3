export function cleanTableNumber(input?: string): string {
  if (!input) return '';
  return String(input).replace(/^(?:(?:table|tbl)[\s_-]*)+/gi, '').trim();
}

export function matchTableNumber(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const strA = String(a).trim().toLowerCase();
  const strB = String(b).trim().toLowerCase();
  if (strA === strB) return true;
  const cleanA = cleanTableNumber(strA);
  const cleanB = cleanTableNumber(strB);
  if (cleanA && cleanB && cleanA.toLowerCase() === cleanB.toLowerCase()) return true;
  const numA = parseInt(cleanA, 10);
  const numB = parseInt(cleanB, 10);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA === numB;
  }
  return false;
}

export function formatStandardTableNumber(input?: string, fallback = 'Table 01'): string {
  if (!input) return fallback;
  const clean = String(input).trim();
  if (
    clean.toUpperCase() === 'COUNTER' ||
    clean.toUpperCase() === 'PICKUP' ||
    clean.toUpperCase() === 'BAR' ||
    clean.toUpperCase() === 'LOUNGE'
  ) {
    return clean.toUpperCase();
  }
  const digitsOnly = cleanTableNumber(clean);
  const num = parseInt(digitsOnly, 10);
  if (!isNaN(num)) {
    return `Table ${String(num).padStart(2, '0')}`;
  }
  return digitsOnly ? `Table ${digitsOnly}` : fallback;
}

