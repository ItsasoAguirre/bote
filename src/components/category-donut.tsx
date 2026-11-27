import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { ChartColors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryTotal } from '@/lib/stats';

/** Named categories in the donut; the rest are folded into "Otras" (the 6th color). */
export const DONUT_SLOTS = 5;

/** Categories that get their own color, ranked on the whole group so colors follow the category. */
export function donutSlotIds(groupTotals: CategoryTotal[]): string[] {
  // With exactly 6 categories, all of them fit: no need for an "Otras" slice.
  const count = groupTotals.length <= DONUT_SLOTS + 1 ? DONUT_SLOTS + 1 : DONUT_SLOTS;
  return groupTotals.slice(0, count).map((t) => t.category.id);
}
const OTHER_ID = '__other__';

const SIZE = 180;
const STROKE = 28;
/** Leaves room for the selected slice, which is drawn thicker. */
const RADIUS = (SIZE - STROKE - 8) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface-colored gap between slices, in px along the ring. */
const GAP = 2;

type Slice = {
  id: string;
  emoji: string;
  name: string;
  amount: number;
  color: string;
  /** Categories folded into "Otras". */
  folded?: CategoryTotal[];
};

/**
 * Donut of spending by category. `slotIds` fixes which categories get their own color
 * (decided from the whole group), so switching to "Solo yo" never repaints a category.
 */
export function CategoryDonut({
  totals,
  slotIds,
  money,
}: {
  totals: CategoryTotal[];
  slotIds: string[];
  money: (cents: number) => string;
}) {
  const theme = useTheme();
  const palette = ChartColors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [selected, setSelected] = useState<string | null>(null);

  const total = totals.reduce((sum, t) => sum + t.amount, 0);
  const slices: Slice[] = [];
  slotIds.forEach((id, i) => {
    const t = totals.find((x) => x.category.id === id);
    if (t) slices.push({ id, emoji: t.category.emoji, name: t.category.name, amount: t.amount, color: palette[i] });
  });
  const folded = totals.filter((t) => !slotIds.includes(t.category.id));
  if (folded.length > 0) {
    slices.push({
      id: OTHER_ID,
      emoji: '➕',
      name: folded.length === 1 ? folded[0].category.name : `Otras (${folded.length})`,
      amount: folded.reduce((sum, t) => sum + t.amount, 0),
      color: palette[DONUT_SLOTS],
      folded,
    });
  }
  slices.sort((a, b) => (a.id === OTHER_ID ? 1 : b.id === OTHER_ID ? -1 : b.amount - a.amount));

  const active = slices.find((s) => s.id === selected) ?? null;
  const toggle = (id: string) => setSelected(selected === id ? null : id);
  const pct = (amount: number) => (total > 0 ? Math.round((amount / total) * 100) : 0);

  // Each arc starts where the previous ones end; the gap is taken from its own length.
  const arcs = slices.map((s, i) => {
    const start = slices.slice(0, i).reduce((sum, x) => sum + (x.amount / total) * CIRCUMFERENCE, 0);
    const length = (s.amount / total) * CIRCUMFERENCE;
    return { ...s, start, length: slices.length > 1 ? Math.max(length - GAP, 0.5) : length };
  });

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.chart}>
        <Svg width={SIZE} height={SIZE} accessibilityLabel="Gráfico de gasto por categoría">
          {arcs.map((a) => (
            <Circle
              key={a.id}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={a.color}
              strokeWidth={active?.id === a.id ? STROKE + 6 : STROKE}
              strokeOpacity={active && active.id !== a.id ? 0.35 : 1}
              strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
              // A circle's stroke starts at 3 o'clock; shifting by a quarter turn starts it at 12.
              // (Done with the offset rather than rotating a <G>, whose `origin` breaks on web.)
              strokeDashoffset={CIRCUMFERENCE / 4 - a.start}
              // react-native-svg can't handle touches on web (it logs unknown responder props);
              // there the legend rows below do the same.
              onPress={Platform.OS === 'web' ? undefined : () => toggle(a.id)}
            />
          ))}
        </Svg>
        <View pointerEvents="none" style={styles.center}>
          <AppText variant="caption" numberOfLines={1} style={{ maxWidth: SIZE - STROKE * 2 - 8 }}>
            {active ? `${active.emoji} ${active.name}` : 'Total'}
          </AppText>
          <AppText variant="heading" numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: SIZE - STROKE * 2 - 8 }}>
            {money(active ? active.amount : total)}
          </AppText>
          {active ? <AppText variant="caption">{pct(active.amount)}%</AppText> : null}
        </View>
      </View>

      <View style={{ gap: 2 }}>
        {slices.map((s) => {
          const isActive = active?.id === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => toggle(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${s.name}: ${money(s.amount)}, ${pct(s.amount)}%`}
              style={[styles.legendRow, isActive && { backgroundColor: theme.primarySoft }]}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <AppText style={{ fontSize: 16 }}>{s.emoji}</AppText>
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {s.name}
              </AppText>
              <AppText variant="caption" style={styles.pct}>
                {pct(s.amount)}%
              </AppText>
              <AppText style={styles.amount}>{money(s.amount)}</AppText>
            </Pressable>
          );
        })}
      </View>

      {active?.folded && active.folded.length > 1 ? (
        <AppText variant="caption">
          {active.folded.map((t) => `${t.category.emoji} ${t.category.name} ${money(t.amount)}`).join(' · ')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { alignSelf: 'center', width: SIZE + 6, height: SIZE + 6, alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
  },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  pct: { width: 40, textAlign: 'right' },
  amount: { minWidth: 80, textAlign: 'right', fontWeight: '600' },
});
