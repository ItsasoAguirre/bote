import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useExpenseActions } from '@/components/expense-actions';
import { LoanSummaryCard } from '@/components/loan-summary';
import { StatsView } from '@/components/stats-view';
import { useToast } from '@/components/toast';
import { AppText, Avatar, Button, Card, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { colorAt } from '@/lib/colors';
import { useTheme } from '@/hooks/use-theme';
import { computeBalances, computeSettlements, spentPerMember, totalSpent } from '@/lib/balances';
import { findCategory, INCOME_CATEGORY, TRANSFER_CATEGORY } from '@/lib/categories';
import { groupEmoji } from '@/lib/group-emoji';
import { formatMoney } from '@/lib/money';
import { expensePayments } from '@/lib/split';
import { appEnv } from '@/lib/supabase';
import { INVITE_HOST } from '@/config/environments';
import type { Expense, Group } from '@/lib/types';
import { useGroup, useGroups, useMe } from '@/store/groups';

type Tab = 'expenses' | 'balances' | 'stats';

/** "Ana", "Ana y Ben", "Ana, Ben y Cris". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function invite(group: Group) {
  if (!group.inviteCode) {
    Alert.alert('Sin código todavía', 'Conéctate a internet para obtener el código de invitación.');
    return;
  }
  // The link opens the app on Android (App Links) or, without it, the web version on the join
  // screen. The code is also included, for anyone who prefers to type it.
  const code = group.inviteCode;
  const link = appEnv === 'local' ? null : `https://${INVITE_HOST[appEnv]}/join?code=${encodeURIComponent(code)}`;
  void Share.share({
    message: link
      ? `Únete a «${group.name}» en Bote para apuntar los gastos juntos: ${link}

O abre la app, pulsa «Unirme con código» y escribe: ${code}`
      : `Únete a «${group.name}» para apuntar los gastos juntos. Abre la app, pulsa «Unirme con código» y escribe: ${code}`,
  });
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const me = useMe(id);
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('expenses');
  const askedWho = useRef(false);
  const { ready, setArchived } = useGroups();

  // The group can disappear while open (its creator deleted it, or I left it on another screen).
  useEffect(() => {
    if (ready && !group) router.dismissTo('/');
  }, [ready, group]);

  // The first time you open a group on this device, ask who you are.
  useEffect(() => {
    if (group && !me && !askedWho.current) {
      askedWho.current = true;
      router.push({ pathname: '/group/[id]/who', params: { id: group.id } });
    }
  }, [group, me]);

  if (!group) return null;

  const isLoan = group.type === 'loan';
  const myName = group.members.find((m) => m.id === me)?.name;
  const myBalance = me ? (computeBalances(group)[me] ?? 0) : 0;
  const money = (cents: number) => formatMoney(cents, group.currency);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: `${groupEmoji(group)} ${group.name}`,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => invite(group)}>
                <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                  Invitar
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.push({ pathname: '/group/[id]/edit', params: { id: group.id } })}>
                <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                  Editar
                </AppText>
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={{ padding: Spacing.md, gap: Spacing.md }}>
        {group.archived ? (
          <Card style={{ ...styles.row, backgroundColor: theme.primarySoft }}>
            <AppText style={{ flex: 1 }}>🗄️ Grupo archivado</AppText>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void setArchived(group.id, false)}>
              <AppText color={theme.primary} style={{ fontWeight: '700' }}>
                Desarchivar
              </AppText>
            </Pressable>
          </Card>
        ) : null}
        {isLoan ? (
          <LoanSummaryCard group={group} me={me} />
        ) : (
          <>
            <Card style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption">Gasto total</AppText>
                <AppText variant="heading">{money(totalSpent(group))}</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/group/[id]/who', params: { id: group.id } })}
                style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
                <AppText variant="caption">{myName ? `${myName} (tú)` : 'Elige quién eres'}</AppText>
                {me ? (
                  <AppText
                    variant="heading"
                    color={myBalance > 0 ? theme.positive : myBalance < 0 ? theme.negative : theme.textSecondary}>
                    {myBalance > 0 ? `Te deben ${money(myBalance)}` : myBalance < 0 ? `Debes ${money(-myBalance)}` : 'Estás al día'}
                  </AppText>
                ) : (
                  <AppText variant="heading" color={theme.primary}>
                    ¿Quién eres?
                  </AppText>
                )}
              </Pressable>
            </Card>
            <Segmented
              options={[
                { value: 'expenses', label: 'Gastos' },
                { value: 'balances', label: 'Saldos' },
                { value: 'stats', label: 'Estadísticas' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </>
        )}
      </View>

      {isLoan || tab === 'expenses' ? (
        <ExpensesList group={group} />
      ) : tab === 'balances' ? (
        <BalancesView group={group} me={me} />
      ) : (
        <StatsView group={group} me={me} />
      )}

      {isLoan ? (
        <SafeAreaView edges={['bottom']} style={{ padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Ampliar préstamo"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/group/[id]/expense/new', params: { id: group.id, preset: 'extend' } })
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Registrar devolución"
              onPress={() =>
                router.push({ pathname: '/group/[id]/expense/new', params: { id: group.id, preset: 'repay' } })
              }
            />
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView edges={['bottom']} style={{ padding: Spacing.md }}>
          <Button
            title="Añadir gasto"
            onPress={() => router.push({ pathname: '/group/[id]/expense/new', params: { id: group.id } })}
          />
        </SafeAreaView>
      )}
    </View>
  );
}

function ExpensesList({ group }: { group: Group }) {
  const theme = useTheme();
  const actions = useExpenseActions(group);
  const nameOf = (memberId: string) => group.members.find((m) => m.id === memberId)?.name ?? '?';
  const sorted = [...group.expenses].sort((a, b) => b.date.localeCompare(a.date));

  const subtitle = (e: Expense) =>
    e.kind === 'transfer'
      ? `${nameOf(e.paidBy)} → ${nameOf(e.splitAmong[0])}`
      : e.kind === 'income'
        ? `Recibido por ${nameOf(e.paidBy)} · para ${joinNames(e.splitAmong.map(nameOf))}`
        : `Pagado por ${joinNames(Object.keys(expensePayments(e)).map(nameOf))}`;

  const emojiOf = (e: Expense) =>
    e.kind === 'transfer'
      ? TRANSFER_CATEGORY.emoji
      : e.kind === 'income' && !e.category
        ? INCOME_CATEGORY.emoji
        : findCategory(group, e.category).emoji;

  return (
    <>
      <FlatList
        data={sorted}
        keyExtractor={(e) => e.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.sm, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="caption">Todavía no hay gastos. Añade el primero.</AppText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Mantén pulsado para editar, duplicar o eliminar"
            onPress={() =>
              router.push({
                pathname: '/group/[id]/expense/[expenseId]',
                params: { id: group.id, expenseId: item.id },
              })
            }
            onLongPress={() => actions.open(item)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Card style={styles.row}>
              <View style={[styles.emoji, { backgroundColor: theme.primarySoft }]}>
                <AppText style={{ fontSize: 20 }}>
                  {emojiOf(item)}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText style={{ fontWeight: '600' }} numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="caption" numberOfLines={1}>
                  {item.recurringId ? '🔁 ' : ''}
                {subtitle(item)} · {new Date(item.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </AppText>
              </View>
              <AppText
                style={{ fontWeight: '700' }}
                color={
                  item.kind === 'transfer' ? theme.textSecondary : item.kind === 'income' ? theme.positive : theme.text
                }>
                {item.kind === 'income' ? '+' : ''}
                {formatMoney(item.amount, group.currency)}
              </AppText>
            </Card>
          </Pressable>
        )}
      />
      {actions.sheet}
    </>
  );
}

function BalancesView({ group, me }: { group: Group; me?: string }) {
  const theme = useTheme();
  const { addExpense, deleteExpense } = useGroups();
  const showToast = useToast();
  const balances = computeBalances(group);
  const settlements = computeSettlements(balances);
  const spent = spentPerMember(group);
  const maxAbs = Math.max(1, ...Object.values(balances).map(Math.abs));
  const nameOf = (memberId: string) => group.members.find((m) => m.id === memberId)?.name ?? '?';
  const money = (cents: number) => formatMoney(cents, group.currency);

  // No confirmation dialog: the toast offers "Deshacer" instead.
  const markPaid = async (from: string, to: string, amount: number) => {
    const id = await addExpense(group.id, {
      kind: 'transfer',
      title: `Reembolso a ${nameOf(to)}`,
      amount,
      paidBy: from,
      splitAmong: [to],
      date: new Date().toISOString(),
    });
    if (id) {
      showToast({
        message: `Pago de ${nameOf(from)} a ${nameOf(to)} registrado`,
        actionLabel: 'Deshacer',
        onAction: () => void deleteExpense(group.id, id),
      });
    }
  };

  /** Opens the share sheet (WhatsApp, Telegram…) with a ready-made reminder message. */
  const remind = (from: string, to: string, amount: number) => {
    const message =
      me === to
        ? `¡Hola ${nameOf(from)}! 👋 En «${group.name}» me debes ${money(amount)}. ¿Me lo pasas cuando puedas? ¡Gracias!`
        : me === from
          ? `¡Hola ${nameOf(to)}! En «${group.name}» te debo ${money(amount)}. Te lo paso en cuanto pueda 🙂`
          : `Recordatorio de «${group.name}»: ${nameOf(from)} debe ${money(amount)} a ${nameOf(to)}.`;
    void Share.share({ message });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.md }}>
      <Card style={{ gap: Spacing.md }}>
        {group.members.map((m, i) => {
          const b = balances[m.id] ?? 0;
          const color = b > 0 ? theme.positive : b < 0 ? theme.negative : theme.textSecondary;
          return (
            <View key={m.id} style={{ gap: 6 }}>
              <View style={styles.row}>
                <Avatar name={m.name} color={colorAt(group.members, i)} size={32} />
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontWeight: '600' }}>
                    {m.name}
                    {m.id === me ? ' (tú)' : ''}
                  </AppText>
                  <AppText variant="caption">Su parte: {money(spent[m.id] ?? 0)}</AppText>
                </View>
                <AppText color={color} style={{ fontWeight: '700' }}>
                  {b > 0 ? '+' : ''}
                  {money(b)}
                </AppText>
              </View>
              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View
                  style={{
                    position: 'absolute',
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: color,
                    width: `${(Math.abs(b) / maxAbs) * 50}%`,
                    [b >= 0 ? 'left' : 'right']: '50%',
                  }}
                />
              </View>
            </View>
          );
        })}
      </Card>

      <AppText variant="heading">Cómo saldar cuentas</AppText>
      {settlements.length === 0 ? (
        <Card>
          <AppText variant="caption">Todo está saldado. Nadie debe nada.</AppText>
        </Card>
      ) : (
        settlements.map((s) => (
          <Card key={`${s.from}-${s.to}`} style={{ gap: Spacing.md }}>
            <View style={styles.row}>
              <AppText style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }}>{s.from === me ? 'Tú' : nameOf(s.from)}</AppText>
                {s.from === me ? ' debes a ' : ' debe a '}
                <AppText style={{ fontWeight: '700' }}>{s.to === me ? 'ti' : nameOf(s.to)}</AppText>
              </AppText>
              <AppText color={theme.negative} style={{ fontWeight: '700' }}>
                {money(s.amount)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Avisar" variant="secondary" onPress={() => remind(s.from, s.to, s.amount)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Pagado" variant="secondary" onPress={() => void markPaid(s.from, s.to, s.amount)} />
              </View>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.lg,
    // iOS already insets header buttons from the screen edge; Android and web do not.
    paddingHorizontal: Platform.OS === 'ios' ? 0 : Spacing.md,
  },
});
