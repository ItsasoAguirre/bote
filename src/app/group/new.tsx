import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { GroupForm } from '@/components/group-form';
import { useGroups } from '@/store/groups';

export default function NewGroupScreen() {
  const { createGroup, addExpense } = useGroups();
  const [submitting, setSubmitting] = useState(false);

  return (
    <GroupForm
      submitLabel="Crear grupo"
      submitting={submitting}
      onSubmit={async (input, loan) => {
        setSubmitting(true);
        try {
          const id = await createGroup(input);
          if (loan) {
            // The loan is an expense paid by the lender and split among the borrowers.
            const borrowers = input.members.map((m) => m.id).filter((mid) => (loan.amounts[mid] ?? 0) > 0);
            const total = borrowers.reduce((s, mid) => s + loan.amounts[mid], 0);
            await addExpense(id, {
              kind: 'expense',
              title: 'Préstamo',
              amount: total,
              paidBy: loan.lender,
              splitAmong: borrowers,
              splitMode: borrowers.length > 1 ? 'amounts' : 'equal',
              splitValues: borrowers.length > 1 ? loan.amounts : null,
              payers: null,
              date: new Date().toISOString(),
              category: null,
            });
          }
          router.replace({ pathname: '/group/[id]/who', params: { id } });
        } catch {
          Alert.alert('No se ha podido crear el grupo', 'Necesitas conexión a internet para crear un grupo.');
          setSubmitting(false);
        }
      }}
    />
  );
}
