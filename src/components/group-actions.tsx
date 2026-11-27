import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { useActionSheet, type SheetAction } from '@/components/action-sheet';
import { useToast } from '@/components/toast';
import { groupEmoji } from '@/lib/group-emoji';
import type { Group } from '@/lib/types';
import { useGroups } from '@/store/groups';

/**
 * Archive / delete / leave for a group, shared by the long-press menu in the group list and
 * the "Editar grupo" screen. `onGone` runs when the group stops being visible (deleted or left),
 * e.g. to navigate back to the list.
 */
export function useGroupActions(onGone?: () => void) {
  const { userId, setArchived, deleteGroup, leaveGroup } = useGroups();
  const showToast = useToast();
  const { show, sheet } = useActionSheet();

  const isCreator = (group: Group) => Boolean(userId && group.createdBy === userId);

  const toggleArchive = (group: Group) => {
    const archived = !group.archived;
    void setArchived(group.id, archived);
    showToast({
      message: archived ? `«${group.name}» archivado` : `«${group.name}» vuelve a tu lista`,
      actionLabel: 'Deshacer',
      onAction: () => void setArchived(group.id, !archived),
    });
  };

  const confirmDelete = (group: Group) => {
    const n = group.expenses.length;
    Alert.alert(
      'Eliminar grupo',
      `Se borrará «${group.name}»${n > 0 ? ` con sus ${n} ${n === 1 ? 'gasto' : 'gastos'}` : ''} para todos los participantes. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar para todos',
          style: 'destructive',
          onPress: () => {
            onGone?.();
            void deleteGroup(group.id);
          },
        },
      ],
    );
  };

  const confirmLeave = (group: Group) =>
    Alert.alert(
      'Salir del grupo',
      `«${group.name}» desaparecerá de este móvil. Los demás lo seguirán viendo, y podrás volver a entrar con el código de invitación. Si eres la última persona del grupo, se borrará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            onGone?.();
            void leaveGroup(group.id);
          },
        },
      ],
    );

  const actionsFor = (group: Group): SheetAction[] => [
    group.archived
      ? { label: 'Desarchivar', emoji: '📤', onPress: () => toggleArchive(group) }
      : { label: 'Archivar', emoji: '🗄️', onPress: () => toggleArchive(group) },
    isCreator(group)
      ? { label: 'Eliminar grupo', emoji: '🗑️', destructive: true, onPress: () => confirmDelete(group) }
      : { label: 'Salir del grupo', emoji: '🚪', destructive: true, onPress: () => confirmLeave(group) },
  ];

  /** Opens the long-press menu for a group. */
  const open = (group: Group) =>
    show({ title: `${groupEmoji(group)} ${group.name}`, actions: actionsFor(group) });

  return { open, sheet: sheet as ReactNode, toggleArchive, confirmDelete, confirmLeave, isCreator };
}
