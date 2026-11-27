import { useToast } from '@/components/toast';
import type { Expense } from '@/lib/types';
import { useGroups } from '@/store/groups';

/** Deletes an expense right away and shows a toast with "Deshacer" (no confirmation dialog). */
export function useDeleteExpense() {
  const { deleteExpense, restoreExpense } = useGroups();
  const showToast = useToast();

  return (groupId: string, expense: Expense) => {
    void deleteExpense(groupId, expense.id);
    showToast({
      message: `«${expense.title}» eliminado`,
      actionLabel: 'Deshacer',
      onAction: () => void restoreExpense(groupId, expense),
    });
  };
}
