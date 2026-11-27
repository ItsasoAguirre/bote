import { Pressable, Share, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { colorAt } from '@/lib/colors';
import { loanSummary } from '@/lib/loan';
import { formatMoney } from '@/lib/money';
import type { Group } from '@/lib/types';

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Header of a loan group: lent / returned / pending, overall progress and, with several borrowers, each one. */
export function LoanSummaryCard({ group, me }: { group: Group; me?: string }) {
  const theme = useTheme();
  const summary = loanSummary(group);
  const money = (cents: number) => formatMoney(cents, group.currency);
  const nameOf = (id?: string) => group.members.find((m) => m.id === id)?.name ?? '?';
  const lenderName = summary.lender === me ? 'Prestaste' : `${nameOf(summary.lender)} prestó`;

  const remind = (borrowerId: string, pending: number) => {
    const message =
      me === summary.lender
        ? `¡Hola ${nameOf(borrowerId)}! 👋 Del préstamo «${group.name}» quedan ${money(pending)} por devolver. Cuando puedas, ¡gracias!`
        : me === borrowerId
          ? `¡Hola ${nameOf(summary.lender)}! Del préstamo «${group.name}» me quedan ${money(pending)} por devolverte.`
          : `Préstamo «${group.name}»: a ${nameOf(borrowerId)} le quedan ${money(pending)} por devolver a ${nameOf(summary.lender)}.`;
    void Share.share({ message });
  };

  if (!summary.lender) {
    return (
      <Card>
        <AppText variant="caption">Todavía no hay ningún préstamo apuntado. Pulsa «Ampliar préstamo» para añadirlo.</AppText>
      </Card>
    );
  }

  const myRow = summary.borrowers.find((b) => b.memberId === me);
  const headline =
    me === summary.lender
      ? summary.pending > 0
        ? { text: `Te deben ${money(summary.pending)}`, color: theme.positive }
        : { text: 'Te lo han devuelto todo 🎉', color: theme.positive }
      : myRow
        ? myRow.pending > 0
          ? { text: `Debes ${money(myRow.pending)}`, color: theme.negative }
          : { text: 'Lo has devuelto todo 🎉', color: theme.positive }
        : null;

  return (
    <Card style={{ gap: Spacing.md }}>
      {headline ? (
        <AppText variant="heading" color={headline.color}>
          {headline.text}
        </AppText>
      ) : null}

      <View style={styles.figures}>
        <View style={styles.figure}>
          <AppText variant="caption">{lenderName}</AppText>
          <AppText style={styles.figureValue}>{money(summary.lent)}</AppText>
        </View>
        <View style={styles.figure}>
          <AppText variant="caption">Devuelto</AppText>
          <AppText style={styles.figureValue}>{money(summary.repaid)}</AppText>
        </View>
        <View style={[styles.figure, { alignItems: 'flex-end' }]}>
          <AppText variant="caption">Pendiente</AppText>
          <AppText style={styles.figureValue} color={summary.pending > 0 ? theme.negative : theme.positive}>
            {money(summary.pending)}
          </AppText>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <ProgressBar progress={summary.progress} color={theme.positive} />
        <AppText variant="caption">{Math.round(summary.progress * 100)}% devuelto</AppText>
      </View>

      {summary.borrowers.length > 1 || summary.borrowers.some((b) => b.pending > 0)
        ? summary.borrowers.map((b) => {
            const index = group.members.findIndex((m) => m.id === b.memberId);
            const progress = b.lent > 0 ? Math.min(Math.max(b.repaid / b.lent, 0), 1) : 0;
            return (
              <View key={b.memberId} style={{ gap: 6 }}>
                <View style={styles.row}>
                  <Avatar name={nameOf(b.memberId)} color={colorAt(group.members, index)} size={28} />
                  <AppText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                    {nameOf(b.memberId)}
                    {b.memberId === me ? ' (tú)' : ''}
                  </AppText>
                  <AppText variant="caption">
                    {b.pending > 0
                      ? `Debe ${money(b.pending)} de ${money(b.lent)}`
                      : b.pending < 0
                        ? `Devolvió ${money(-b.pending)} de más`
                        : 'Devuelto ✓'}
                  </AppText>
                </View>
                {summary.borrowers.length > 1 ? <ProgressBar progress={progress} color={colorAt(group.members, index)} /> : null}
                {b.pending > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => remind(b.memberId, b.pending)}
                    hitSlop={8}
                    style={{ alignSelf: 'flex-start' }}>
                    <AppText color={theme.primary} style={{ fontWeight: '600' }}>
                      Avisar
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', gap: Spacing.sm },
  figure: { flex: 1, gap: 2 },
  figureValue: { fontWeight: '700', fontSize: 16 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
