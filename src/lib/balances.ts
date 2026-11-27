import { expenseMembers, expensePayments, expenseShares } from './split';
import type { Group, Settlement } from './types';

/**
 * Net balance per member in cents.
 * Positive: the group owes this member money. Negative: this member owes money.
 */
export function computeBalances(group: Group): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of group.members) balances[m.id] = 0;

  for (const e of group.expenses) {
    // An income is the mirror of an expense: whoever received it now holds money that
    // belongs to the others (they owe it), and each owner is owed their share.
    const sign = e.kind === 'income' ? -1 : 1;
    for (const [id, paid] of Object.entries(expensePayments(e))) {
      balances[id] = (balances[id] ?? 0) + sign * paid;
    }
    for (const [id, share] of Object.entries(expenseShares(e))) {
      balances[id] = (balances[id] ?? 0) - sign * share;
    }
  }
  return balances;
}

/** Minimal-ish list of transfers that brings every balance to zero (greedy matching). */
export function computeSettlements(balances: Record<string, number>): Settlement[] {
  const debtors = Object.entries(balances)
    .filter(([, b]) => b < 0)
    .map(([id, b]) => ({ id, amount: -b }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balances)
    .filter(([, b]) => b > 0)
    .map(([id, b]) => ({ id, amount: b }))
    .sort((a, b) => b.amount - a.amount);

  const result: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) result.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return result;
}

/** Total real spending of the group (reimbursements and incomes excluded). */
export function totalSpent(group: Group): number {
  return group.expenses.filter((e) => e.kind === 'expense').reduce((sum, e) => sum + e.amount, 0);
}

/** What each member has consumed (their share of the expenses, reimbursements excluded). */
export function spentPerMember(group: Group): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const m of group.members) spent[m.id] = 0;
  for (const e of group.expenses) {
    if (e.kind !== 'expense') continue;
    for (const [id, share] of Object.entries(expenseShares(e))) {
      spent[id] = (spent[id] ?? 0) + share;
    }
  }
  return spent;
}

/** Members referenced by any expense can't be removed without breaking the balances. */
export function memberIsUsed(group: Group, memberId: string): boolean {
  return [...group.expenses, ...(group.recurring ?? []).map((r) => ({ ...r, date: '' }))].some((e) =>
    expenseMembers(e).has(memberId),
  );
}


/** My balance in a group, or undefined if I haven't said who I am there. */
export function myBalance(group: Group, memberId: string | undefined): number | undefined {
  if (!memberId || !group.members.some((m) => m.id === memberId)) return undefined;
  return computeBalances(group)[memberId] ?? 0;
}

export type CurrencyTotals = { currency: string; owedToMe: number; iOwe: number };

/**
 * What I'm owed and what I owe across all my groups, one entry per currency
 * (amounts in different currencies are never added together).
 */
export function balanceTotals(groups: Group[], me: Record<string, string>): CurrencyTotals[] {
  const totals = new Map<string, CurrencyTotals>();
  for (const g of groups) {
    const b = myBalance(g, me[g.id]);
    if (b === undefined || b === 0) continue;
    const t = totals.get(g.currency) ?? { currency: g.currency, owedToMe: 0, iOwe: 0 };
    if (b > 0) t.owedToMe += b;
    else t.iOwe += -b;
    totals.set(g.currency, t);
  }
  return [...totals.values()];
}
