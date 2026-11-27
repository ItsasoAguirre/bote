import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { AppText, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import { formatDateKey } from '@/lib/recurring';
import type { Group } from '@/lib/types';
import { useGroups } from '@/store/groups';

/** "Pagos recurrentes" in Editar grupo: list, pause/resume and delete monthly rules. */
export function RecurringManager({ group }: { group: Group }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { setRecurringActive, deleteRecurring } = useGroups();
  const rules = group.recurring ?? [];
  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?';

  const confirmDelete = (id: string, title: string) =>
    Alert.alert(
      t('recurringManager.deleteTitle'),
      t('recurringManager.deleteMessage', { title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('recurringManager.delete'), style: 'destructive', onPress: () => void deleteRecurring(group.id, id) },
      ],
    );

  return (
    <Field label={t('recurringManager.label', { count: rules.length })}>
      {rules.length === 0 ? (
        <AppText variant="caption">{t('recurringManager.empty')}</AppText>
      ) : (
        <Card style={{ gap: Spacing.md }}>
          {rules.map((r) => (
            <View key={r.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <AppText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                  🔁 {r.title}
                </AppText>
                <AppText style={{ fontWeight: '700' }}>{formatMoney(r.amount, group.currency)}</AppText>
              </View>
              <AppText variant="caption">
                {r.kind === 'transfer'
                  ? `${nameOf(r.paidBy)} → ${nameOf(r.splitAmong[0])}`
                  : r.kind === 'income'
                    ? t('recurringManager.receives', { name: nameOf(r.paidBy) })
                    : t('recurringManager.pays', { name: nameOf(r.paidBy) })}{' '}
                · {t('recurringManager.dayOfMonth', { day: r.dayOfMonth })}
              </AppText>
              {r.active ? (
                <AppText variant="caption">{t('recurringManager.next', { date: formatDateKey(r.nextDate) })}</AppText>
              ) : (
                <AppText variant="caption" color={theme.negative}>
                  {r.lastError
                    ? t('recurringManager.autoPaused')
                    : t('recurringManager.paused')}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', gap: Spacing.lg, marginTop: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => void setRecurringActive(group.id, r.id, !r.active)}>
                  <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                    {r.active ? t('recurringManager.pause') : t('recurringManager.resume')}
                  </AppText>
                </Pressable>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => confirmDelete(r.id, r.title)}>
                  <AppText color={theme.negative} style={{ fontWeight: '600' }}>
                    {t('recurringManager.delete')}
                  </AppText>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Field>
  );
}
