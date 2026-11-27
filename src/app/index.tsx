import { router, Stack } from 'expo-router';
import { useState } from 'react';
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
        'Importar grupo',
        `Se creará un grupo nuevo «${g.name}» con ${g.members.length} personas y ${g.expenses.length} movimientos.` +
          (g.recurring.length ? ' Los pagos recurrentes se importan pausados.' : ''),
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar',
            onPress: async () => {
              setImporting(true);
              try {
                const id = await importGroup(backup);
                router.push({ pathname: '/group/[id]/who', params: { id } });
              } catch {
                Alert.alert('No se ha podido importar', 'Comprueba tu conexión a internet e inténtalo de nuevo.');
              } finally {
                setImporting(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert(
        'No se puede importar',
        e instanceof BackupError
          ? e.message
          : e instanceof ExportUnavailable
            ? 'Importar solo está disponible en la app del móvil.'
            : 'No se ha podido leer el archivo.',
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
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              disabled={importing}
              onPress={() => void startImport()}
              style={{ paddingHorizontal: Platform.OS === 'ios' ? 0 : Spacing.md }}>
              <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                {importing ? 'Importando…' : 'Importar'}
              </AppText>
            </Pressable>
          ),
        }}
      />
      {status === 'offline' || status === 'not-configured' ? (
        <View style={[styles.banner, { backgroundColor: theme.primarySoft }]}>
          <AppText variant="caption" color={theme.text}>
            {status === 'offline'
              ? 'Sin conexión: estás viendo la última copia guardada. Los cambios necesitan internet.'
              : 'Falta configurar el servidor (Supabase). Mira supabase/README.md.'}
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
                <AppText style={{ fontWeight: '600' }}>Estás al día en todos tus grupos 🎉</AppText>
              ) : (
                totals.map((t) => (
                  <View key={t.currency} style={styles.row}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="caption">Te deben</AppText>
                      <AppText variant="heading" color={t.owedToMe > 0 ? theme.positive : theme.textSecondary}>
                        {formatMoney(t.owedToMe, t.currency)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
                      <AppText variant="caption">Debes</AppText>
                      <AppText variant="heading" color={t.iOwe > 0 ? theme.negative : theme.textSecondary}>
                        {formatMoney(t.iOwe, t.currency)}
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
                Todos tus grupos están archivados.
              </AppText>
            ) : (
              <>
                <AppText variant="heading">Aún no tienes grupos</AppText>
                <AppText variant="caption" style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                  Crea un grupo para un viaje, el piso compartido o una cena, o únete al de otra persona con su
                  código de invitación.
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
                  {showArchived ? '▾' : '▸'} ARCHIVADOS ({archived.length})
                </AppText>
              </Pressable>
              {showArchived ? <View style={{ gap: Spacing.sm, opacity: 0.7 }}>{archived.map(renderRow)}</View> : null}
            </View>
          ) : undefined
        }
      />
      <SafeAreaView edges={['bottom']} style={{ padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Unirme con código" variant="secondary" onPress={() => router.push('/join')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Nuevo grupo" onPress={() => router.push('/group/new')} />
        </View>
      </SafeAreaView>
      {actions.sheet}
    </View>
  );
}

function GroupRow({
  group,
  balance,
  onLongPress,
}: {
  group: Group;
  balance?: number;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Mantén pulsado para archivar o eliminar"
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
  const theme = useTheme();
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      {balance === undefined ? (
        <AppText variant="caption" color={theme.primary}>
          ¿Quién eres?
        </AppText>
      ) : (
        <AppText
          style={{ fontWeight: '700' }}
          color={balance > 0 ? theme.positive : balance < 0 ? theme.negative : theme.textSecondary}>
          {balance > 0 ? `+${money(balance)}` : balance < 0 ? money(balance) : 'Al día'}
        </AppText>
      )}
      <AppText variant="caption">Total {money(total)}</AppText>
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
