export function matchTableNumber(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const strA = String(a).trim().toLowerCase();
  const strB = String(b).trim().toLowerCase();
  if (strA === strB) return true;
  const cleanA = strA.replace(/^table\s*/i, '');
  const cleanB = strB.replace(/^table\s*/i, '');
  if (cleanA === cleanB) return true;
  const numA = parseInt(cleanA, 10);
  const numB = parseInt(cleanB, 10);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA === numB;
  }
  return false;
}

export function formatStandardTableNumber(input?: string): string {
  if (!input) return 'Table 01';
  const clean = String(input).trim();
  if (clean.toUpperCase() === 'COUNTER') return 'COUNTER';
  const num = parseInt(clean.replace(/^table\s*/i, ''), 10);
  if (!isNaN(num)) {
    return `Table ${String(num).padStart(2, '0')}`;
  }
  return clean.startsWith('Table ') ? clean : `Table ${clean}`;
}
