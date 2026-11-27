import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LONG_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Noon local time, so the stored ISO date never shifts to another day across time zones. */
function dayToIso(year: number, month: number, day: number): string {
  return new Date(year, month, day, 12).toISOString();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Date picker built from plain views, so it behaves the same on Android, iOS and web. */
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const theme = useTheme();
  const selected = new Date(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  const pick = (d: Date) => {
    onChange(dayToIso(d.getFullYear(), d.getMonth(), d.getDate()));
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const today = new Date();
  const yesterday = daysAgo(1);
  const isToday = sameDay(selected, today);
  const isYesterday = sameDay(selected, yesterday);

  const year = view.getFullYear();
  const month = view.getMonth();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7; // weeks start on Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Field label="Fecha">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <Chip label="Hoy" selected={isToday} onPress={() => pick(today)} />
        <Chip label="Ayer" selected={isYesterday} onPress={() => pick(yesterday)} />
        <Chip
          label={isToday || isYesterday ? 'Otro día' : LONG_DATE.format(selected)}
          selected={!isToday && !isYesterday}
          onPress={() => setOpen(!open)}
        />
      </View>
      {isToday || isYesterday ? (
        <AppText variant="caption">{LONG_DATE.format(selected)}</AppText>
      ) : null}

      {open ? (
        <View style={[styles.calendar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mes anterior"
              hitSlop={8}
              onPress={() => setView(new Date(year, month - 1, 1))}
              style={styles.nav}>
              <AppText color={theme.primary} style={styles.navText}>
                ‹
              </AppText>
            </Pressable>
            <AppText style={{ fontWeight: '700', textTransform: 'capitalize' }}>{MONTH_YEAR.format(view)}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mes siguiente"
              hitSlop={8}
              onPress={() => setView(new Date(year, month + 1, 1))}
              style={styles.nav}>
              <AppText color={theme.primary} style={styles.navText}>
                ›
              </AppText>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={styles.cell}>
                <AppText variant="caption" style={{ fontWeight: '700' }}>
                  {d}
                </AppText>
              </View>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
              const date = new Date(year, month, day);
              const active = sameDay(date, selected);
              const current = sameDay(date, today);
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={LONG_DATE.format(date)}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    pick(date);
                    setOpen(false);
                  }}
                  style={styles.cell}>
                  <View
                    style={[
                      styles.day,
                      active && { backgroundColor: theme.primary },
                      !active && current && { borderWidth: 1, borderColor: theme.primary },
                    ]}>
                    <AppText color={active ? theme.onPrimary : theme.text} style={{ fontWeight: active ? '700' : '400' }}>
                      {day}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  calendar: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.sm },
  nav: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  navText: { fontSize: 24, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
