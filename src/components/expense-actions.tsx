import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useActionSheet } from '@/components/action-sheet';
import { useDeleteExpense } from '@/hooks/use-delete-expense';
import { formatMoney } from '@/lib/money';
import type { Expense, Group } from '@/lib/types';

/** Long-press options for an expense: edit, duplicate, delete (with "Deshacer"). */
export function useExpenseActions(group: Group): { open: (expense: Expense) => void; sheet: ReactNode } {
  const { t } = useTranslation();
  const { show, sheet } = useActionSheet();
  const deleteExpense = useDeleteExpense();

  const open = (expense: Expense) =>
    show({
      title: expense.title,
      message: formatMoney(expense.amount, group.currency),
      actions: [
        {
          label: t('common.edit'),
          emoji: '✏️',
          onPress: () =>
            router.push({
              pathname: '/group/[id]/expense/[expenseId]',
              params: { id: group.id, expenseId: expense.id },
            }),
        },
        {
          label: t('expenseActions.duplicate'),
          emoji: '📄',
          onPress: () =>
            router.push({ pathname: '/group/[id]/expense/new', params: { id: group.id, from: expense.id } }),
        },
        { label: t('common.delete'), emoji: '🗑️', destructive: true, onPress: () => deleteExpense(group.id, expense) },
      ],
    });

  return { open, sheet };
}
