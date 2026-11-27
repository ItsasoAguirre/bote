import { router, useLocalSearchParams } from 'expo-router';

import { ExpenseForm } from '@/components/expense-form';
import { useDeleteExpense } from '@/hooks/use-delete-expense';
import { useGroup, useGroups } from '@/store/groups';

export default function EditExpenseScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const group = useGroup(id);
  const { updateExpense } = useGroups();
  const deleteExpense = useDeleteExpense();
  const expense = group?.expenses.find((e) => e.id === expenseId);

  if (!group || !expense) return null;

  return (
    <ExpenseForm
      group={group}
      expense={expense}
      onSubmit={(input) => {
        void updateExpense(group.id, expense.id, input);
        router.back();
      }}
      // No confirmation dialog: the toast offers "Deshacer" instead.
      onDelete={() => {
        router.back();
        deleteExpense(group.id, expense);
      }}
    />
  );
}
