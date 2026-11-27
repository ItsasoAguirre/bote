import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { userId, setArchived, deleteGroup, leaveGroup } = useGroups();
  const showToast = useToast();
  const { show, sheet } = useActionSheet();

  const isCreator = (group: Group) => Boolean(userId && group.createdBy === userId);

  const toggleArchive = (group: Group) => {
    const archived = !group.archived;
    void setArchived(group.id, archived);
    showToast({
      message: archived
        ? t('groupActions.archived', { name: group.name })
        : t('groupActions.unarchived', { name: group.name }),
      actionLabel: t('groupActions.undo'),
      onAction: () => void setArchived(group.id, !archived),
    });
  };

  const confirmDelete = (group: Group) => {
    const n = group.expenses.length;
    Alert.alert(
      t('groupActions.deleteTitle'),
      n > 0
        ? t('groupActions.deleteMessageWithExpenses', { name: group.name, count: n })
        : t('groupActions.deleteMessage', { name: group.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groupActions.deleteForAll'),
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
      t('groupActions.leaveTitle'),
      t('groupActions.leaveMessage', { name: group.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groupActions.leave'),
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
      ? { label: t('groupActions.unarchive'), emoji: '📤', onPress: () => toggleArchive(group) }
      : { label: t('groupActions.archive'), emoji: '🗄️', onPress: () => toggleArchive(group) },
    isCreator(group)
      ? { label: t('groupActions.deleteTitle'), emoji: '🗑️', destructive: true, onPress: () => confirmDelete(group) }
      : { label: t('groupActions.leaveTitle'), emoji: '🚪', destructive: true, onPress: () => confirmLeave(group) },
  ];

  /** Opens the long-press menu for a group. */
  const open = (group: Group) =>
    show({ title: `${groupEmoji(group)} ${group.name}`, actions: actionsFor(group) });

  return { open, sheet: sheet as ReactNode, toggleArchive, confirmDelete, confirmLeave, isCreator };
}
