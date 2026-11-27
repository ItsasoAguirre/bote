import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Chip, Field, Input, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { colorAt } from '@/lib/colors';
import { formatMoney } from '@/lib/money';
import type { Group, SplitMode } from '@/lib/types';

/** One line per member: avatar + name on the left, a control and/or value on the right. */
function MemberLine({
  group,
  memberId,
  dimmed,
  onPress,
  children,
}: {
  group: Group;
  memberId: string;
  dimmed?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const index = group.members.findIndex((m) => m.id === memberId);
  const member = group.members[index];
  const content = (
    <View style={[styles.line, dimmed && { opacity: 0.45 }]}>
      <Avatar name={member?.name ?? '?'} color={colorAt(group.members, index)} size={30} />
      <AppText style={{ flex: 1 }} numberOfLines={1}>
        {member?.name ?? '?'}
      </AppText>
      {children}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !dimmed }} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** "Falta 3,00 € / Sobra 2,00 € / ✓ Cuadra" for per-person amounts that must add up to the total. */
function Remaining({ total, assigned, currency }: { total: number | null; assigned: number | null; currency: string }) {
  const theme = useTheme();
  if (total === null) return null;
  if (assigned === null) return <AppText variant="caption" color={theme.negative}>Hay algún importe no válido.</AppText>;
  const diff = total - assigned;
  if (diff === 0) return <AppText variant="caption" color={theme.positive}>✓ Cuadra con el total</AppText>;
  return (
    <AppText variant="caption" color={theme.negative}>
      {diff > 0 ? `Falta ${formatMoney(diff, currency)}` : `Sobra ${formatMoney(-diff, currency)}`} (total{' '}
      {formatMoney(total, currency)})
    </AppText>
  );
}

function AmountInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Input
      value={value}
      onChangeText={onChange}
      placeholder="0,00"
      keyboardType="decimal-pad"
      accessibilityLabel={label}
      style={styles.amountInput}
    />
  );
}

// ─── Paid by ──────────────────────────────────────────────────────────────

export function PayersEditor({
  group,
  total,
  multi,
  onMultiChange,
  paidBy,
  onPaidByChange,
  amounts,
  onAmountChange,
  assigned,
  label = 'Pagado por',
  allowMulti = true,
}: {
  group: Group;
  /** Expense total in cents, or null while not typed. */
  total: number | null;
  multi: boolean;
  onMultiChange: (multi: boolean) => void;
  paidBy: string;
  onPaidByChange: (id: string) => void;
  /** Text per member when several paid. */
  amounts: Record<string, string>;
  onAmountChange: (id: string, text: string) => void;
  /** Sum of `amounts` in cents, or null if any is invalid. */
  assigned: number | null;
  /** "Pagado por" for expenses, "Recibido por" for incomes. */
  label?: string;
  /** Offer "Pagaron varias personas" (not for incomes: one person receives the money). */
  allowMulti?: boolean;
}) {
  const theme = useTheme();
  return (
    <Field label={label}>
      {multi ? (
        <View style={{ gap: Spacing.xs }}>
          {group.members.map((m) => (
            <MemberLine key={m.id} group={group} memberId={m.id}>
              <AmountInput
                value={amounts[m.id] ?? ''}
                onChange={(v) => onAmountChange(m.id, v)}
                label={`Lo que pagó ${m.name}`}
              />
            </MemberLine>
          ))}
          <Remaining total={total} assigned={assigned} currency={group.currency} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {group.members.map((m) => (
            <Chip key={m.id} label={m.name} selected={paidBy === m.id} onPress={() => onPaidByChange(m.id)} />
          ))}
        </View>
      )}
      {allowMulti ? (
        <Pressable accessibilityRole="button" onPress={() => onMultiChange(!multi)} hitSlop={8}>
          <AppText color={theme.primary} style={{ fontWeight: '600' }}>
            {multi ? 'Solo pagó una persona' : '＋ Pagaron varias personas'}
          </AppText>
        </Pressable>
      ) : null}
    </Field>
  );
}

// ─── For whom ─────────────────────────────────────────────────────────────

export function SplitEditor({
  group,
  total,
  mode,
  onModeChange,
  included,
  onToggle,
  weights,
  onWeightChange,
  amounts,
  onAmountChange,
  assigned,
  shares,
}: {
  group: Group;
  total: number | null;
  mode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  /** `equal` mode: who takes part. */
  included: string[];
  onToggle: (id: string) => void;
  /** `shares` mode: whole-number weight per member (0 = not included). */
  weights: Record<string, number>;
  onWeightChange: (id: string, weight: number) => void;
  /** `amounts` mode: text per member. */
  amounts: Record<string, string>;
  onAmountChange: (id: string, text: string) => void;
  /** `amounts` mode: sum in cents, or null if any is invalid. */
  assigned: number | null;
  /** Resulting cents per member (live preview), or null while the total isn't typed. */
  shares: Record<string, number> | null;
}) {
  const theme = useTheme();
  const money = (cents: number) => formatMoney(cents, group.currency);
  const preview = (id: string) =>
    shares ? (
      <AppText variant="caption" style={styles.preview}>
        {shares[id] ? money(shares[id]) : '—'}
      </AppText>
    ) : null;

  return (
    <Field label="Para quién">
      <Segmented
        options={[
          { value: 'equal', label: 'Iguales' },
          { value: 'shares', label: 'Partes' },
          { value: 'amounts', label: 'Importes' },
        ]}
        value={mode}
        onChange={onModeChange}
      />
      <AppText variant="caption">
        {mode === 'equal'
          ? 'Se reparte a partes iguales entre las personas marcadas.'
          : mode === 'shares'
            ? 'Cada parte vale lo mismo: quien tiene 2 paga el doble que quien tiene 1. Con 0 no participa.'
            : 'Escribe lo que le toca a cada persona. Tiene que sumar el total.'}
      </AppText>

      <View style={{ gap: Spacing.xs }}>
        {group.members.map((m) => {
          if (mode === 'equal') {
            const on = included.includes(m.id);
            return (
              <MemberLine key={m.id} group={group} memberId={m.id} dimmed={!on} onPress={() => onToggle(m.id)}>
                <View
                  style={[
                    styles.check,
                    { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' },
                  ]}>
                  {on ? <AppText color={theme.onPrimary} style={{ fontSize: 14, fontWeight: '800' }}>✓</AppText> : null}
                </View>
                {preview(m.id)}
              </MemberLine>
            );
          }
          if (mode === 'shares') {
            const w = weights[m.id] ?? 0;
            return (
              <MemberLine key={m.id} group={group} memberId={m.id} dimmed={w === 0}>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Una parte menos para ${m.name}`}
                    disabled={w === 0}
                    onPress={() => onWeightChange(m.id, Math.max(0, w - 1))}
                    hitSlop={6}
                    style={[styles.stepButton, { borderColor: theme.border, opacity: w === 0 ? 0.3 : 1 }]}>
                    <AppText style={styles.stepText}>−</AppText>
                  </Pressable>
                  <AppText style={styles.weight} accessibilityLabel={`${w} partes`}>
                    ×{w}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Una parte más para ${m.name}`}
                    onPress={() => onWeightChange(m.id, w + 1)}
                    hitSlop={6}
                    style={[styles.stepButton, { borderColor: theme.border }]}>
                    <AppText style={styles.stepText}>+</AppText>
                  </Pressable>
                </View>
                {preview(m.id)}
              </MemberLine>
            );
          }
          return (
            <MemberLine key={m.id} group={group} memberId={m.id}>
              <AmountInput
                value={amounts[m.id] ?? ''}
                onChange={(v) => onAmountChange(m.id, v)}
                label={`Lo que le toca a ${m.name}`}
              />
            </MemberLine>
          );
        })}
      </View>
      {mode === 'amounts' ? <Remaining total={total} assigned={assigned} currency={group.currency} /> : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  amountInput: { width: 116, textAlign: 'right', paddingVertical: 8 },
  preview: { minWidth: 72, textAlign: 'right' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepButton: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '700' },
  weight: { minWidth: 28, textAlign: 'center', fontWeight: '700' },
});
