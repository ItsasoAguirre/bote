import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryDonut, donutSlotIds } from '@/components/category-donut';
import { AppText, Avatar, Button, Card, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useExport } from '@/hooks/use-export';
import { useTheme } from '@/hooks/use-theme';
import { colorAt } from '@/lib/colors';
import { formatMoney } from '@/lib/money';
import { categoryTotals, expenseCount, memberTotals, monthlyTotals, totalIncome } from '@/lib/stats';
import type { Group } from '@/lib/types';

type Scope = 'group' | 'me';

/** Horizontal bar anchored at the left; length is the value relative to the largest one. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const theme = useTheme();
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, paddingVertical: Spacing.sm + 4 }}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </Card>
  );
}

export function StatsView({ group, me }: { group: Group; me?: string }) {
  const theme = useTheme();
  const [scope, setScope] = useState<Scope>('group');
  const { exporting, run: exportPdf } = useExport(group);
  const memberId = scope === 'me' ? me : undefined;
  const money = (cents: number) => formatMoney(cents, group.currency);

  const byCategory = categoryTotals(group, memberId);
  const total = byCategory.reduce((sum, c) => sum + c.amount, 0);
  const count = expenseCount(group, memberId);
  const members = memberTotals(group);
  const months = monthlyTotals(group, memberId);

  // Incomes are shown apart: they never reduce the spending figures.
  const income = totalIncome(group, memberId);

  if (group.expenses.every((e) => e.kind === 'transfer')) {
    return (
      <View style={styles.empty}>
        <AppText variant="caption">Añade algún gasto para ver las estadísticas.</AppText>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.md }}>
      <Button
        title={exporting === 'pdf' ? 'Generando PDF…' : '📄 Exportar resumen en PDF'}
        variant="secondary"
        disabled={exporting !== null}
        onPress={() => void exportPdf('pdf')}
      />
      {me ? (
        <Segmented
          options={[
            { value: 'group', label: 'Todo el grupo' },
            { value: 'me', label: 'Solo yo' },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <StatTile label={scope === 'me' ? 'Tu gasto' : 'Gasto total'} value={money(total)} />
        <StatTile label="Gastos" value={String(count)} />
        {scope === 'group' ? (
          <StatTile label="Por persona" value={money(Math.round(total / Math.max(group.members.length, 1)))} />
        ) : null}
      </View>

      {income > 0 ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <AppText style={{ fontSize: 18 }}>💰</AppText>
          <AppText style={{ flex: 1 }}>{scope === 'me' ? 'Tus ingresos' : 'Ingresos'}</AppText>
          <AppText style={{ fontWeight: '700' }} color={theme.positive}>
            +{money(income)}
          </AppText>
        </Card>
      ) : null}

      <AppText variant="heading">Por categoría</AppText>
      {byCategory.length === 0 ? (
        <Card>
          <AppText variant="caption">No tienes gastos en este grupo.</AppText>
        </Card>
      ) : (
        <Card>
          <CategoryDonut totals={byCategory} slotIds={donutSlotIds(categoryTotals(group))} money={money} />
        </Card>
      )}

      {scope === 'group' ? (
        <>
          <AppText variant="heading">Por persona</AppText>
          <Card style={{ gap: Spacing.md }}>
            {members.map(({ member, paid, share }, i) => {
              const max = Math.max(...members.map((m) => Math.max(m.paid, m.share)), 1);
              const color = colorAt(group.members, i);
              return (
                <View key={member.id} style={{ gap: 6 }}>
                  <View style={styles.row}>
                    <Avatar name={member.name} color={color} size={28} />
                    <AppText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                      {member.name}
                      {member.id === me ? ' (tú)' : ''}
                    </AppText>
                  </View>
                  <View style={styles.row}>
                    <AppText variant="caption" style={styles.barLabel}>
                      Pagó
                    </AppText>
                    <View style={{ flex: 1 }}>
                      <Bar value={paid} max={max} color={color} />
                    </View>
                    <AppText variant="caption" style={styles.barValue}>
                      {money(paid)}
                    </AppText>
                  </View>
                  <View style={styles.row}>
                    <AppText variant="caption" style={styles.barLabel}>
                      Su parte
                    </AppText>
                    <View style={{ flex: 1 }}>
                      <Bar value={share} max={max} color={theme.textSecondary} />
                    </View>
                    <AppText variant="caption" style={styles.barValue}>
                      {money(share)}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {months.length >= 2 ? <MonthlyChart months={months} money={money} /> : null}
    </ScrollView>
  );
}

const MONTH_FORMAT = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const LONG_MONTH_FORMAT = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

function monthDate(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** Column chart by month. Tapping a column shows its value in the caption above. */
function MonthlyChart({
  months,
  money,
}: {
  months: { month: string; amount: number }[];
  money: (cents: number) => string;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState(months.length - 1);
  const current = months[Math.min(selected, months.length - 1)];
  const max = Math.max(...months.map((m) => m.amount), 1);
  const visible = months.slice(-12);
  const offset = months.length - visible.length;

  return (
    <>
      <AppText variant="heading">Por mes</AppText>
      <Card style={{ gap: Spacing.sm }}>
        <AppText variant="caption">
          {LONG_MONTH_FORMAT.format(monthDate(current.month))}:{' '}
          <AppText style={{ fontWeight: '700' }}>{money(current.amount)}</AppText>
        </AppText>
        <View style={styles.columns}>
          {visible.map((m, i) => {
            const index = i + offset;
            const active = index === selected;
            return (
              <Pressable
                key={m.month}
                onPress={() => setSelected(index)}
                accessibilityRole="button"
                accessibilityLabel={`${LONG_MONTH_FORMAT.format(monthDate(m.month))}: ${money(m.amount)}`}
                style={styles.column}>
                <View style={styles.columnArea}>
                  <View
                    style={{
                      height: `${Math.max((m.amount / max) * 100, m.amount > 0 ? 2 : 0)}%`,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                      backgroundColor: theme.primary,
                      opacity: active ? 1 : 0.45,
                    }}
                  />
                </View>
                <AppText
                  variant="caption"
                  style={{ fontSize: 11, fontWeight: active ? '700' : '400' }}
                  numberOfLines={1}>
                  {MONTH_FORMAT.format(monthDate(m.month)).replace('.', '')}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  barLabel: { width: 56 },
  barValue: { minWidth: 72, textAlign: 'right' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 140 },
  column: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  columnArea: { flex: 1, width: '70%', justifyContent: 'flex-end' },
});
