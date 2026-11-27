import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGroupActions } from '@/components/group-actions';
import { AppText, Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { balanceTotals, myBalance, totalSpent } from '@/lib/balances';
import { BackupError } from '@/lib/backup';
import { ExportUnavailable, pickBackup } from '@/lib/export';
import { groupEmoji } from '@/lib/group-emoji';
import { formatMoney } from '@/lib/money';
import type { Group } from '@/lib/types';
import { useGroups } from '@/store/groups';

export default function GroupsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { ready, groups, status, refresh, me, importGroup } = useGroups();
  const [importing, setImporting] = useState(false);

  /** Pick a backup file, show what it contains, and create the group if confirmed. */
  const startImport = async () => {
    try {
      const backup = await pickBackup();
      if (!backup) return;
      const g = backup.group;
      Alert.alert(
        t('groupsScreen.import.title'),
        t('groupsScreen.import.message', {
          name: g.name,
          members: t('groupsScreen.import.members', { count: g.members.length }),
          movements: t('groupsScreen.import.movements', { count: g.expenses.length }),
        }) + (g.recurring.length ? ` ${t('groupsScreen.import.recurringPaused')}` : ''),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('groupsScreen.import.confirm'),
            onPress: async () => {
              setImporting(true);
              try {
                const id = await importGroup(backup);
                router.push({ pathname: '/group/[id]/who', params: { id } });
              } catch {
                Alert.alert(t('groupsScreen.import.failedTitle'), t('groupsScreen.import.failedMessage'));
              } finally {
                setImporting(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert(
        t('groupsScreen.import.cannotTitle'),
        e instanceof BackupError
          ? e.message
          : e instanceof ExportUnavailable
            ? t('groupsScreen.import.mobileOnly')
            : t('groupsScreen.import.unreadable'),
      );
    }
  };
  const actions = useGroupActions();
  const [showArchived, setShowArchived] = useState(false);

  // Archived groups still count in the totals: the money is owed all the same.
  const totals = balanceTotals(groups, me);
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const renderRow = (item: Group) => (
    <GroupRow
      key={item.id}
      group={item}
      balance={myBalance(item, me[item.id])}
      onLongPress={() => actions.open(item)}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.language.title')}
                hitSlop={8}
                onPress={() => router.push('/language')}
                style={{ paddingHorizontal: Spacing.sm }}>
                <AppText style={{ fontSize: 20 }}>🌐</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                disabled={importing}
                onPress={() => void startImport()}
                style={{ paddingHorizontal: Platform.OS === 'ios' ? 0 : Spacing.md }}>
                <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                  {importing ? t('groupsScreen.import.importing') : t('groupsScreen.import.button')}
                </AppText>
              </Pressable>
            </View>
          ),
        }}
      />
      {status === 'offline' || status === 'not-configured' ? (
        <View style={[styles.banner, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="caption" color={theme.text}>
            {status === 'offline' ? t('groupsScreen.offline') : t('groupsScreen.notConfigured')}
          </AppText>
        </View>
      ) : null}
      <FlatList
        data={active}
        keyExtractor={(g) => g.id}
        refreshing={false}
        onRefresh={() => void refresh()}
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 }}
        ListHeaderComponent={
          groups.length > 0 ? (
            <Card style={{ gap: Spacing.sm, marginBottom: Spacing.sm }}>
              {totals.length === 0 ? (
                <AppText style={{ fontWeight: '600' }}>{t('groupsScreen.allSettled')}</AppText>
              ) : (
                totals.map((total) => (
                  <View key={total.currency} style={styles.row}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="caption">{t('groupsScreen.owedToMe')}</AppText>
                      <AppText variant="heading" color={total.owedToMe > 0 ? theme.positive : theme.textSecondary}>
                        {formatMoney(total.owedToMe, total.currency)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
                      <AppText variant="caption">{t('groupsScreen.iOwe')}</AppText>
                      <AppText variant="heading" color={total.iOwe > 0 ? theme.negative : theme.textSecondary}>
                        {formatMoney(total.iOwe, total.currency)}
                      </AppText>
                    </View>
                  </View>
                ))
              )}
            </Card>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.center}>
            {archived.length > 0 ? (
              <AppText variant="caption" style={{ textAlign: 'center' }}>
                {t('groupsScreen.allArchived')}
              </AppText>
            ) : (
              <>
                <AppText variant="heading">{t('groupsScreen.emptyTitle')}</AppText>
                <AppText variant="caption" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                  {t('groupsScreen.emptyText')}
                </AppText>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => renderRow(item)}
        ListFooterComponent={
          archived.length > 0 ? (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showArchived }}
                onPress={() => setShowArchived(!showArchived)}
                hitSlop={8}
                style={styles.archivedToggle}>
                <AppText variant="caption" style={{ fontWeight: '700' }}>
                  {showArchived ? '▾' : '▸'} {t('groupsScreen.archivedHeader', { count: archived.length })}
                </AppText>
              </Pressable>
              {showArchived ? <View style={{ gap: Spacing.sm, opacity: 0.7 }}>{archived.map(renderRow)}</View> : null}
            </View>
          ) : undefined
        }
      />
      <SafeAreaView edges={['bottom']} style={{ padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title={t('groupsScreen.joinWithCode')} variant="secondary" onPress={() => router.push('/join')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={t('groupsScreen.newGroup')} onPress={() => router.push('/group/new')} />
        </View>
      </SafeAreaView>
      {actions.sheet}
    </View>
  );
}

function GroupRow({ group, balance, onLongPress }: { group: Group; balance?: number; onLongPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('groupsScreen.rowHint')}
      onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        <View style={[styles.emoji, { backgroundColor: theme.primarySoft }]}>
          <AppText style={{ fontSize: 24 }}>{groupEmoji(group)}</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" numberOfLines={1}>
            {group.name}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {group.members.map((m) => m.name).join(', ')}
          </AppText>
        </View>
        <GroupBalance balance={balance} currency={group.currency} total={totalSpent(group)} />
      </Card>
    </Pressable>
  );
}

/** Right side of a group row: my balance in that group, with the group's total below. */
function GroupBalance({ balance, currency, total }: { balance?: number; currency: string; total: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      {balance === undefined ? (
        <AppText variant="caption" color={theme.primary}>
          {t('groupsScreen.whoAreYou')}
        </AppText>
      ) : (
        <AppText
          style={{ fontWeight: '700' }}
          color={balance > 0 ? theme.positive : balance < 0 ? theme.negative : theme.textSecondary}>
          {balance > 0 ? `+${money(balance)}` : balance < 0 ? money(balance) : t('groupsScreen.settled')}
        </AppText>
      )}
      <AppText variant="caption">{t('groupsScreen.total', { amount: money(total) })}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  banner: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  emoji: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  archivedToggle: { paddingVertical: Spacing.sm },
});
