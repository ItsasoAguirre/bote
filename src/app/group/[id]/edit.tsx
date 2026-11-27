import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CategoryManager } from '@/components/categories';
import { useGroupActions } from '@/components/group-actions';
import { GroupForm } from '@/components/group-form';
import { RecurringManager } from '@/components/recurring-manager';
import { AppText, Button, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useExport } from '@/hooks/use-export';
import { useGroup, useGroups } from '@/store/groups';

export default function EditGroupScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const { updateGroup, setMuted } = useGroups();
  const { exporting, run: runExport } = useExport(group);
  const actions = useGroupActions(() => router.dismissTo('/'));

  if (!group) return null;

  const creator = actions.isCreator(group);

  return (
    <GroupForm
      group={group}
      submitLabel={t('editGroup.saveChanges')}
      onSubmit={(input) => {
        void updateGroup(group.id, input);
        router.back();
      }}
      extra={
        <>
          <CategoryManager group={group} />
          <RecurringManager group={group} />
          <Field label={t('editGroup.notifications')}>
            <View style={{ flexDirection: 'row' }}>
              <Chip
                label={group.muted ? t('editGroup.muted') : t('editGroup.unmuted')}
                selected={!group.muted}
                onPress={() => void setMuted(group.id, !group.muted)}
              />
            </View>
            <AppText variant="caption">
              {group.muted
                ? t('editGroup.mutedHint')
                : t('editGroup.unmutedHint')}
            </AppText>
          </Field>
          <Field label={t('editGroup.export')}>
            <View style={{ gap: Spacing.sm }}>
              <Button
                title={exporting === 'pdf' ? t('editGroup.generatingPdf') : t('editGroup.pdf')}
                variant="secondary"
                disabled={exporting !== null}
                onPress={() => void runExport('pdf')}
              />
              <Button
                title={exporting === 'backup' ? t('editGroup.preparingBackup') : t('editGroup.backup')}
                variant="secondary"
                disabled={exporting !== null}
                onPress={() => void runExport('backup')}
              />
              <AppText variant="caption">
                {t('editGroup.exportHint')}
              </AppText>
            </View>
          </Field>
          <Field label={t('editGroup.manage')}>
            <View style={{ gap: Spacing.sm }}>
              <Button
                title={group.archived ? t('editGroup.unarchive') : t('editGroup.archive')}
                variant="secondary"
                onPress={() => {
                  actions.toggleArchive(group);
                  router.back();
                }}
              />
              <AppText variant="caption">
                {group.archived
                  ? t('editGroup.unarchiveHint')
                  : t('editGroup.archiveHint')}
              </AppText>
              {creator ? (
                <>
                  <Button title={t('editGroup.deleteGroup')} variant="danger" onPress={() => actions.confirmDelete(group)} />
                  <AppText variant="caption">
                    {t('editGroup.deleteHint')}
                  </AppText>
                </>
              ) : (
                <>
                  <Button title={t('editGroup.leaveGroup')} variant="danger" onPress={() => actions.confirmLeave(group)} />
                  <AppText variant="caption">
                    {t('editGroup.leaveHint')}
                  </AppText>
                </>
              )}
            </View>
          </Field>
        </>
      }
    />
  );
}
