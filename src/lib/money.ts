import { currentLanguage, intlLocale } from '@/i18n';

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP', 'CLP', 'CHF'] as const;

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Turns what people type into a plain "1234.5" string. Accepts Spanish-style thousands:
 * "3.000" → "3000", "3.000,50" → "3000.50", "12,5" → "12.5", "12.50" → "12.50".
 * Spaces and currency symbols are ignored.
 */
function normalizeAmount(text: string): string {
  let t = text.trim().replace(/[\s€$£]/g, '');
  if (t.includes(',')) {
    // Comma is the decimal separator, so any dots are thousands separators.
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // "3.000" or "1.250.000": dots grouping exactly 3 digits are thousands, not decimals.
    t = t.replace(/\./g, '');
  }
  return t;
}

/** Parses user input such as "12,5", "12.50" or "3.000" into cents. Null if not a positive amount. */
export function parseAmount(text: string): number | null {
  const normalized = normalizeAmount(text);
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Like parseAmount, but for per-person fields where empty or zero is allowed (returns 0).
 * Returns null only if the text isn't a valid amount.
 */
export function parseOptionalAmount(text: string): number | null {
  const normalized = normalizeAmount(text);
  if (normalized === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

/** Inverse of parseAmount, for pre-filling an edit form (decimal comma except in English). */
export function centsToInput(cents: number): string {
  const text = (cents / 100).toFixed(2);
  return currentLanguage() === 'en' ? text : text.replace('.', ',');
}

/**
 * Splits `cents` equally among `ids`. Leftover cents go to the first members,
 * so the shares always add up exactly to the total.
 */
export function splitEqually(cents: number, ids: string[]): Record<string, number> {
  const shares: Record<string, number> = {};
  if (ids.length === 0) return shares;
  const base = Math.floor(cents / ids.length);
  let remainder = cents - base * ids.length;
  for (const id of ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return shares;
}
