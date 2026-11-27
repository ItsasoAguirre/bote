import { router, Stack, useLocalSearchParams } from 'expo-router';

import { ExpenseForm } from '@/components/expense-form';
import { loanSummary } from '@/lib/loan';
import type { Expense, Group } from '@/lib/types';
import { useGroup, useGroups, useMe } from '@/store/groups';

/** Prefilled forms for loan groups. Amount 0 means "left empty for you to type". */
function loanPreset(group: Group, preset: 'repay' | 'extend', me?: string): Expense | undefined {
  const summary = loanSummary(group);
  if (!summary.lender) return undefined;
  const base = { id: '', date: new Date().toISOString(), category: null, amount: 0, payers: null, splitValues: null };
  if (preset === 'repay') {
    // Who repays: me if I'm a borrower; otherwise the first person who still owes something.
    const owing = summary.borrowers.filter((b) => b.pending > 0);
    const from =
      summary.borrowers.find((b) => b.memberId === me)?.memberId ?? owing[0]?.memberId ?? summary.borrowers[0]?.memberId;
    if (!from) return undefined;
    return { ...base, kind: 'transfer', title: 'Devolución', paidBy: from, splitAmong: [summary.lender] };
  }
  return {
    ...base,
    kind: 'expense',
    title: 'Ampliación del préstamo',
    paidBy: summary.lender,
    splitAmong: summary.borrowers.map((b) => b.memberId),
  };
}

export default function NewExpenseScreen() {
  // `from`: id of an expense to duplicate. `preset`: loan shortcuts ("repay" / "extend").
  const { id, from, preset } = useLocalSearchParams<{ id: string; from?: string; preset?: 'repay' | 'extend' }>();
  const group = useGroup(id);
  const me = useMe(id);
  const { addExpense, addRecurring } = useGroups();

  if (!group) return null;

  const duplicate = from ? group.expenses.find((e) => e.id === from) : undefined;
  const fromPreset = preset ? loanPreset(group, preset, me) : undefined;
  const template = duplicate ?? fromPreset;
  const title = duplicate
    ? 'Duplicar gasto'
    : preset === 'repay'
      ? 'Registrar devolución'
      : preset === 'extend'
        ? 'Ampliar préstamo'
        : undefined;

  return (
    <>
      {title ? <Stack.Screen options={{ title }} /> : null}
      <ExpenseForm
        group={group}
        template={template}
        me={me}
        allowRepeat
        onSubmit={(input, options) => {
          void (options?.repeatMonthly ? addRecurring(group.id, input) : addExpense(group.id, input));
          router.back();
        }}
      />
    </>
  );
}
