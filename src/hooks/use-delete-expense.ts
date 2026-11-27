import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast';
import type { Expense } from '@/lib/types';
import { useGroups } from '@/store/groups';

/** Deletes an expense right away and shows a toast with "Deshacer" (no confirmation dialog). */
export function useDeleteExpense() {
  const { t } = useTranslation();
  const { deleteExpense, restoreExpense } = useGroups();
  const showToast = useToast();

  return (groupId: string, expense: Expense) => {
    void deleteExpense(groupId, expense.id);
    showToast({
      message: t('useDeleteExpense.deleted', { title: expense.title }),
      actionLabel: t('useDeleteExpense.undo'),
      onAction: () => void restoreExpense(groupId, expense),
    });
  };
}
