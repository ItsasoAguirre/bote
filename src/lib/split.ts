import { splitEqually } from './money';
import type { Expense } from './types';

/**
 * Splits `cents` proportionally to whole-number weights, so the parts always add up exactly.
 * Uses the largest-remainder method; ties go to the member listed first.
 */
export function splitByWeights(cents: number, weights: [string, number][]): Record<string, number> {
  const positive = weights.filter(([, w]) => w > 0);
  const total = positive.reduce((sum, [, w]) => sum + w, 0);
  const result: Record<string, number> = {};
  if (total === 0) return result;

  const parts = positive.map(([id, w], index) => {
    const exact = (cents * w) / total;
    return { id, index, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = cents - parts.reduce((sum, p) => sum + p.floor, 0);
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const p of byRemainder) {
    result[p.id] = p.floor + (left > 0 ? 1 : 0);
    if (left > 0) left--;
  }
  return result;
}

/** What each member consumed from this expense, in cents. Always adds up to `amount`. */
export function expenseShares(e: Expense): Record<string, number> {
  const mode = e.splitMode ?? 'equal';
  if (mode === 'equal' || !e.splitValues) return splitEqually(e.amount, e.splitAmong);
  if (mode === 'amounts') {
    const result: Record<string, number> = {};
    for (const id of e.splitAmong) {
      const cents = e.splitValues[id] ?? 0;
      if (cents > 0) result[id] = cents;
    }
    return result;
  }
  return splitByWeights(
    e.amount,
    e.splitAmong.map((id) => [id, e.splitValues?.[id] ?? 0]),
  );
}

/** What each member paid for this expense, in cents. Always adds up to `amount`. */
export function expensePayments(e: Expense): Record<string, number> {
  if (e.payers && Object.keys(e.payers).length > 0) {
    const result: Record<string, number> = {};
    for (const [id, cents] of Object.entries(e.payers)) if (cents > 0) result[id] = cents;
    return result;
  }
  return { [e.paidBy]: e.amount };
}

/** Every member the expense refers to, as payer or participant. */
export function expenseMembers(e: Expense): Set<string> {
  return new Set([...Object.keys(expensePayments(e)), ...e.splitAmong]);
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((s, v) => s + v, 0);

/** Why an expense can't be saved, or null if it's consistent. Mirrors the database checks. */
export function validateExpense(e: Omit<Expense, 'id'>): string | null {
  if (!(e.amount > 0)) return 'Escribe un importe.';
  if (e.splitAmong.length === 0) return 'Elige al menos una persona.';
  if (e.payers && Object.keys(e.payers).length > 0 && sum(e.payers) !== e.amount) {
    return 'Lo que pagó cada uno no suma el total.';
  }
  const mode = e.splitMode ?? 'equal';
  if (mode === 'amounts' && sum(e.splitValues ?? {}) !== e.amount) {
    return 'Los importes de cada uno no suman el total.';
  }
  if (mode === 'shares' && sum(e.splitValues ?? {}) <= 0) return 'Pon al menos una parte.';
  return null;
}
