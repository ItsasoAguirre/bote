import { groupCategories, UNCATEGORIZED } from './categories';
import { expensePayments, expenseShares } from './split';
import type { Category, Expense, Group, Member } from './types';

/**
 * How much of an expense counts for the statistics: the full amount for the whole group,
 * or only this member's share when `memberId` is given. Reimbursements never count.
 */
function counted(e: Expense, memberId?: string): number {
  if (e.kind !== 'expense') return 0;
  if (!memberId) return e.amount;
  return expenseShares(e)[memberId] ?? 0;
}

export type CategoryTotal = { category: Category; amount: number; count: number };

/** Spending per category, highest first. Deleted custom categories fall into "Sin categoría". */
export function categoryTotals(group: Group, memberId?: string): CategoryTotal[] {
  const categories = new Map(groupCategories(group).map((c) => [c.id, c]));
  const totals = new Map<string, CategoryTotal>();
  for (const e of group.expenses) {
    const amount = counted(e, memberId);
    if (amount === 0) continue;
    const category = (e.category && categories.get(e.category)) || UNCATEGORIZED;
    const t = totals.get(category.id) ?? { category, amount: 0, count: 0 };
    totals.set(category.id, { category, amount: t.amount + amount, count: t.count + 1 });
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

export type MonthTotal = { month: string; amount: number };

/** Spending per calendar month ("2026-11"), oldest first, including empty months in between. */
export function monthlyTotals(group: Group, memberId?: string): MonthTotal[] {
  const totals = new Map<string, number>();
  for (const e of group.expenses) {
    const amount = counted(e, memberId);
    if (amount === 0) continue;
    const month = monthKey(new Date(e.date));
    totals.set(month, (totals.get(month) ?? 0) + amount);
  }
  if (totals.size === 0) return [];
  const months = [...totals.keys()].sort();
  const result: MonthTotal[] = [];
  const cursor = parseMonth(months[0]);
  const last = months[months.length - 1];
  while (monthKey(cursor) <= last) {
    const key = monthKey(cursor);
    result.push({ month: key, amount: totals.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

export type MemberTotal = { member: Member; paid: number; share: number };

/** What each member paid out of pocket and what their share of the expenses was. */
export function memberTotals(group: Group): MemberTotal[] {
  return group.members.map((member) => {
    let paid = 0;
    let share = 0;
    for (const e of group.expenses) {
      if (e.kind !== 'expense') continue;
      paid += expensePayments(e)[member.id] ?? 0;
      share += counted(e, member.id);
    }
    return { member, paid, share };
  });
}

/**
 * Money that came into the group from outside (incomes), in total or, with `memberId`,
 * the part that belongs to that member. Shown apart: it never reduces the spending figures.
 */
export function totalIncome(group: Group, memberId?: string): number {
  return group.expenses
    .filter((e) => e.kind === 'income')
    .reduce((sum, e) => sum + (memberId ? (expenseShares(e)[memberId] ?? 0) : e.amount), 0);
}

export function expenseCount(group: Group, memberId?: string): number {
  return group.expenses.filter((e) => counted(e, memberId) > 0).length;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
