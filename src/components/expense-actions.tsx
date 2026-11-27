import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useActionSheet } from '@/components/action-sheet';
import { useDeleteExpense } from '@/hooks/use-delete-expense';
import { formatMoney } from '@/lib/money';
import type { Expense, Group } from '@/lib/types';

/** Long-press options for an expense: edit, duplicate, delete (with "Deshacer"). */
export function useExpenseActions(group: Group): { open: (expense: Expense) => void; sheet: ReactNode } {
  const { show, sheet } = useActionSheet();
  const deleteExpense = useDeleteExpense();

  const open = (expense: Expense) =>
    show({
      title: expense.title,
      message: formatMoney(expense.amount, group.currency),
      actions: [
        {
          label: 'Editar',
          emoji: '✏️',
          onPress: () =>
            router.push({
              pathname: '/group/[id]/expense/[expenseId]',
              params: { id: group.id, expenseId: expense.id },
            }),
        },
        {
          label: 'Duplicar',
          emoji: '📄',
          onPress: () =>
            router.push({ pathname: '/group/[id]/expense/new', params: { id: group.id, from: expense.id } }),
        },
        { label: 'Eliminar', emoji: '🗑️', destructive: true, onPress: () => deleteExpense(group.id, expense) },
      ],
    });

  return { open, sheet };
}
