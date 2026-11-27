import { computeBalances } from './balances';
import { expensePayments, expenseShares } from './split';
import type { Group } from './types';

/**
 * Loan groups reuse the expense model:
 * - the loan (and any later increase) is an `expense` paid by the lender and split among
 *   the borrowers (the lender's own share is 0);
 * - each repayment is a `transfer` from a borrower to the lender.
 * So balances, settlements and reminders work unchanged.
 */

/** The lender: whoever paid the loan entries (the one who paid most, if ever unclear). */
export function loanLender(group: Group): string | undefined {
  const paid: Record<string, number> = {};
  for (const e of group.expenses) {
    if (e.kind !== 'expense') continue;
    for (const [id, cents] of Object.entries(expensePayments(e))) paid[id] = (paid[id] ?? 0) + cents;
  }
  const ranked = Object.entries(paid).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0];
}

export type BorrowerSummary = {
  memberId: string;
  /** Total lent to this person. */
  lent: number;
  /** Returned so far (lent − pending). */
  repaid: number;
  /** Still owed. Negative if they returned more than they were lent. */
  pending: number;
};

export type LoanSummary = {
  lender?: string;
  borrowers: BorrowerSummary[];
  lent: number;
  repaid: number;
  pending: number;
  /** 0–1 share already returned. */
  progress: number;
};

export function loanSummary(group: Group): LoanSummary {
  const lender = loanLender(group);
  const lentTo: Record<string, number> = {};
  for (const e of group.expenses) {
    if (e.kind !== 'expense') continue;
    for (const [id, cents] of Object.entries(expenseShares(e))) {
      if (id !== lender) lentTo[id] = (lentTo[id] ?? 0) + cents;
    }
  }
  const balances = computeBalances(group);
  const borrowers = group.members
    .filter((m) => m.id !== lender && (lentTo[m.id] ?? 0) > 0)
    .map((m) => {
      const lent = lentTo[m.id] ?? 0;
      // `0 - x` rather than `-x`: avoids -0, which would print as "-0,00 €".
      const pending = 0 - (balances[m.id] ?? 0);
      return { memberId: m.id, lent, pending, repaid: lent - pending };
    });
  const lent = borrowers.reduce((s, b) => s + b.lent, 0);
  const pending = borrowers.reduce((s, b) => s + Math.max(b.pending, 0), 0);
  const repaid = lent - pending;
  return { lender, borrowers, lent, repaid, pending, progress: lent > 0 ? Math.min(repaid / lent, 1) : 0 };
}
