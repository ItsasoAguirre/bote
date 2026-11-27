export type Member = {
  id: string;
  name: string;
  /** Hex color like "#3B5BDB". If missing, one is picked from the palette by position. */
  color?: string | null;
};

/** Built-in categories have fixed ids ("food"…); custom ones are per group, with generated ids. */
export type Category = {
  id: string;
  emoji: string;
  name: string;
};

/**
 * `expense`: a shared cost paid by one or more members and split among `splitAmong`.
 * `transfer`: a reimbursement; `paidBy` gives money to the single member in `splitAmong`.
 * `income`: money coming into the group from outside. `paidBy` received it and it belongs to
 *   `splitAmong` (split like an expense), e.g. a Bizum Ana got that is for Beto.
 *   It works like an expense with the opposite sign (see computeBalances), and is never counted
 *   as spending.
 */
export type ExpenseKind = 'expense' | 'transfer' | 'income';

/**
 * How an expense is divided:
 * - `equal`: equally among `splitAmong` (the default; older expenses have no mode).
 * - `shares`: proportionally to whole-number weights in `splitValues` ("Ana counts double").
 * - `amounts`: exact cents per member in `splitValues`, adding up to the amount.
 */
export type SplitMode = 'equal' | 'shares' | 'amounts';

export type Expense = {
  id: string;
  kind: ExpenseKind;
  title: string;
  /** Amount in cents (integer) to avoid floating-point rounding errors. */
  amount: number;
  /** Who paid; with several payers, the one who paid most (see `payers`). */
  paidBy: string;
  /** Members who take part in the expense (those with a share > 0). */
  splitAmong: string[];
  splitMode?: SplitMode;
  /** Weights (`shares`) or cents (`amounts`) per member. Unused for `equal`. */
  splitValues?: Record<string, number> | null;
  /** Cents paid by each member when several paid. Null/missing: `paidBy` paid everything. */
  payers?: Record<string, number> | null;
  /** ISO date string. */
  date: string;
  /** Category id (built-in or custom). Null for transfers and uncategorized expenses. */
  category?: string | null;
  /** Set when the expense was created by a monthly rule (see RecurringExpense). */
  recurringId?: string | null;
};

/** A monthly rule: the expense to repeat, created by the server on `dayOfMonth`. */
export type RecurringExpense = Omit<Expense, 'id' | 'date' | 'recurringId'> & {
  id: string;
  /** 1–31; in shorter months, the last day. */
  dayOfMonth: number;
  /** "YYYY-MM-DD": when the next expense will be created. */
  nextDate: string;
  active: boolean;
  /** Why the server paused the rule, if it did. */
  lastError?: string | null;
};

/** `expenses`: shared expenses (default). `loan`: a lender and borrowers who repay (lib/loan.ts). */
export type GroupType = 'expenses' | 'loan';

export type Group = {
  id: string;
  name: string;
  /** Fixed when the group is created. Missing in old caches: treat as `expenses`. */
  type?: GroupType;
  /** Optional emoji shown next to the name. */
  emoji?: string | null;
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
  /** Code other people type to join the group. Missing until the server has created it. */
  inviteCode?: string;
  /** Archived by me (per user): hidden from the main list. */
  archived?: boolean;
  /** I muted this group's push notifications (per user). */
  muted?: boolean;
  /** Who I am in this group according to the server (synced from "¿Quién eres?"). */
  serverMe?: string | null;
  /** User id of whoever created the group; only they can delete it for everyone. */
  createdBy?: string | null;
  members: Member[];
  /** Custom categories created in this group (the built-in ones are not stored here). */
  categories: Category[];
  /** Monthly recurring expenses. Missing in old caches. */
  recurring?: RecurringExpense[];
  expenses: Expense[];
  createdAt: string;
};

export type Settlement = {
  from: string;
  to: string;
  amount: number;
};
