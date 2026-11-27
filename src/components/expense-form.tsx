import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CategoryPicker } from '@/components/categories';
import { DateField } from '@/components/date-field';
import { PayersEditor, SplitEditor } from '@/components/split-editor';
import { AppText, Button, Chip, Field, FormScreen, Input, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { centsToInput, parseAmount, parseOptionalAmount } from '@/lib/money';
import { dateKey, formatDateKey, planRecurrence } from '@/lib/recurring';
import { expenseShares, validateExpense } from '@/lib/split';
import type { Expense, ExpenseKind, Group, SplitMode } from '@/lib/types';
import type { ExpenseInput } from '@/store/groups';

/** Parses a text-per-member map into cents (zeros dropped). Null if any text is invalid. */
function parseCentsMap(texts: Record<string, string>, ids: string[]): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const id of ids) {
    const cents = parseOptionalAmount(texts[id] ?? '');
    if (cents === null) return null;
    if (cents > 0) result[id] = cents;
  }
  return result;
}

const sumValues = (values: Record<string, number>) => Object.values(values).reduce((s, v) => s + v, 0);

function toTexts(cents: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(cents).map(([id, c]) => [id, centsToInput(c)]));
}

export function ExpenseForm({
  group,
  expense,
  template,
  me,
  allowRepeat,
  onSubmit,
  onDelete,
}: {
  group: Group;
  /** Existing expense when editing. */
  expense?: Expense;
  /** Expense to copy when duplicating: fills the form, but saves as a new expense dated today. */
  template?: Expense;
  /** Member id of the person using this device; default payer for new expenses. */
  me?: string;
  /** Offer "Repetir cada mes" (only when creating). */
  allowRepeat?: boolean;
  onSubmit: (input: ExpenseInput, options?: { repeatMonthly: boolean }) => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const allIds = group.members.map((m) => m.id);
  const known = (id: string) => allIds.includes(id);
  const initial = expense ?? template;
  const initialIsExpense = initial?.kind !== 'transfer';
  const initialPayers =
    initialIsExpense && initial?.payers && Object.keys(initial.payers).length > 1 ? initial.payers : null;
  const initialMode: SplitMode = (initialIsExpense && initial?.splitMode) || 'equal';

  const [kind, setKind] = useState<ExpenseKind>(initial?.kind ?? 'expense');
  const [title, setTitle] = useState(initial?.title ?? '');
  // A template with amount 0 (e.g. a loan repayment preset) leaves the amount empty to type.
  const [amountText, setAmountText] = useState(initial && initial.amount > 0 ? centsToInput(initial.amount) : '');
  const [category, setCategory] = useState<string | null>(initial?.category ?? null);
  const [date, setDate] = useState(() => expense?.date ?? new Date().toISOString());
  const [repeat, setRepeat] = useState(false);

  // Who paid
  const [paidBy, setPaidBy] = useState(initial && known(initial.paidBy) ? initial.paidBy : (me ?? allIds[0]));
  const [multiPay, setMultiPay] = useState(initialPayers !== null);
  const [payTexts, setPayTexts] = useState<Record<string, string>>(() => (initialPayers ? toTexts(initialPayers) : {}));

  // For whom. Members who left the group since the original expense are dropped.
  const [splitMode, setSplitMode] = useState<SplitMode>(initialMode);
  const [splitAmong, setSplitAmong] = useState<string[]>(initial?.splitAmong.filter(known) ?? allIds);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    initialMode === 'shares' && initial?.splitValues
      ? Object.fromEntries(allIds.map((id) => [id, initial.splitValues?.[id] ?? 0]))
      : Object.fromEntries(allIds.map((id) => [id, 1])),
  );
  const [shareTexts, setShareTexts] = useState<Record<string, string>>(() =>
    initialMode === 'amounts' && initial?.splitValues ? toTexts(initial.splitValues) : {},
  );

  const amount = parseAmount(amountText);
  const isTransfer = kind === 'transfer';
  // An income has one receiver (no "several paid") and is split among its owners like an expense.
  const isIncome = kind === 'income';
  const multiPayActive = multiPay && !isIncome;
  // A transfer goes to exactly one person, who can't be the sender.
  const recipients = splitAmong.filter((id) => id !== paidBy).slice(0, 1);

  // ── Build the expense from the form state ──
  const payCents = parseCentsMap(payTexts, allIds);
  const shareCents = parseCentsMap(shareTexts, allIds);
  const payers = multiPayActive ? payCents : null;
  const mainPayer =
    multiPayActive && payCents && Object.keys(payCents).length > 0
      ? Object.entries(payCents).sort((a, b) => b[1] - a[1])[0][0]
      : paidBy;
  const participants =
    splitMode === 'equal'
      ? allIds.filter((id) => splitAmong.includes(id))
      : splitMode === 'shares'
        ? allIds.filter((id) => (weights[id] ?? 0) > 0)
        : allIds.filter((id) => (shareCents?.[id] ?? 0) > 0);
  const splitValues =
    splitMode === 'shares'
      ? Object.fromEntries(participants.map((id) => [id, weights[id]]))
      : splitMode === 'amounts'
        ? (shareCents ?? {})
        : null;

  const draft: ExpenseInput = isTransfer
    ? {
        kind,
        title: title.trim() ||
          t('expenseForm.transferTitle', { name: group.members.find((m) => m.id === recipients[0])?.name ?? '' }),
        amount: amount ?? 0,
        paidBy,
        splitAmong: recipients,
        date,
        category: null,
        splitMode: 'equal',
        splitValues: null,
        payers: null,
      }
    : {
        kind,
        title: title.trim(),
        amount: amount ?? 0,
        paidBy: mainPayer,
        splitAmong: participants,
        date,
        category,
        splitMode,
        splitValues,
        payers: payers && Object.keys(payers).length > 1 ? payers : null,
      };

  const invalidTexts =
    !isTransfer && ((multiPayActive && payCents === null) || (splitMode === 'amounts' && shareCents === null));
  // With a single amount filled in, `payers` collapses to one payer, so check the sum here too.
  const payersOff =
    !isTransfer && multiPayActive && payCents !== null && amount !== null && sumValues(payCents) !== amount;
  const error =
    amount === null
      ? null
      : invalidTexts
        ? t('expenseForm.invalidAmounts')
        : payersOff
          ? t('expenseForm.payersOff')
          : validateExpense(draft);
  // With one payer chosen through the multi-payer view, it's simply a single payer.
  const canSubmit =
    amount !== null && !error && (isTransfer ? recipients.length > 0 : title.trim().length > 0);
  const preview = amount !== null && !isTransfer && splitMode !== 'amounts' ? expenseShares(draft as Expense) : null;

  // ── Handlers ──
  const changeKind = (k: ExpenseKind) => {
    setKind(k);
    if (k === 'transfer') {
      setMultiPay(false);
      const firstOther = allIds.find((id) => id !== paidBy);
      setSplitAmong(firstOther ? [firstOther] : []);
    } else {
      setSplitAmong(allIds);
    }
  };

  const choosePayer = (id: string) => {
    setPaidBy(id);
    if (isTransfer && splitAmong.includes(id)) {
      const firstOther = allIds.find((x) => x !== id);
      setSplitAmong(firstOther ? [firstOther] : []);
    }
  };

  const changeMultiPay = (multi: boolean) => {
    if (multi) {
      // Start from the current single payer paying everything, so it already adds up.
      setPayTexts(amount !== null ? { [paidBy]: centsToInput(amount) } : {});
    } else {
      setPaidBy(mainPayer);
    }
    setMultiPay(multi);
  };

  const changeMode = (mode: SplitMode) => {
    // Start "Importes" from the current split, so it already adds up and you only adjust.
    if (mode === 'amounts' && amount !== null) setShareTexts(toTexts(expenseShares(draft as Expense)));
    if (mode === 'equal' && participants.length > 0) setSplitAmong(participants);
    setSplitMode(mode);
  };

  return (
    <FormScreen
      footer={
        <>
          {error ? (
            <AppText variant="caption" color={theme.negative} style={{ textAlign: 'center' }}>
              {error}
            </AppText>
          ) : null}
          <Button
            title={expense ? t('expenseForm.saveChanges') : t('common.add')}
            onPress={() => canSubmit && onSubmit(draft, { repeatMonthly: Boolean(allowRepeat && repeat) })}
            disabled={!canSubmit}
          />
          {onDelete ? <Button title={t('common.delete')} variant="danger" onPress={onDelete} /> : null}
        </>
      }>
      <Segmented
        options={[
          { value: 'expense', label: t('expenseForm.kindExpense') },
          { value: 'income', label: t('expenseForm.kindIncome') },
          { value: 'transfer', label: t('expenseForm.kindTransfer') },
        ]}
        value={kind}
        onChange={changeKind}
      />

      <Field label={t('expenseForm.titleLabel')}>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder={
            isTransfer
              ? t('expenseForm.titlePlaceholderTransfer')
              : isIncome
                ? t('expenseForm.titlePlaceholderIncome')
                : t('expenseForm.titlePlaceholderExpense')
          }
          autoFocus={!initial}
        />
      </Field>

      <Field label={t('expenseForm.amountLabel', { currency: group.currency })}>
        <Input
          value={amountText}
          onChangeText={setAmountText}
          placeholder={t('expenseForm.amountPlaceholder')}
          keyboardType="decimal-pad"
          style={{ fontSize: 24, fontWeight: '700' }}
        />
      </Field>

      <DateField value={date} onChange={setDate} />

      {allowRepeat ? <RepeatField date={date} repeat={repeat} onChange={setRepeat} /> : null}

      {isTransfer ? (
        <>
          <Field label={t('expenseForm.from')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              {group.members.map((m) => (
                <Chip key={m.id} label={m.name} selected={paidBy === m.id} onPress={() => choosePayer(m.id)} />
              ))}
            </View>
          </Field>
          <Field label={t('expenseForm.to')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              {group.members
                .filter((m) => m.id !== paidBy)
                .map((m) => (
                  <Chip
                    key={m.id}
                    label={m.name}
                    selected={recipients.includes(m.id)}
                    onPress={() => setSplitAmong([m.id])}
                  />
                ))}
            </View>
          </Field>
        </>
      ) : (
        <>
          <CategoryPicker group={group} value={category} onChange={setCategory} />
          {isIncome ? (
            <AppText variant="caption">{t('expenseForm.incomeHelp')}</AppText>
          ) : null}
          <PayersEditor
            group={group}
            total={amount}
            label={isIncome ? t('expenseForm.receivedBy') : t('expenseForm.paidBy')}
            allowMulti={!isIncome}
            multi={multiPayActive}
            onMultiChange={changeMultiPay}
            paidBy={paidBy}
            onPaidByChange={setPaidBy}
            amounts={payTexts}
            onAmountChange={(id, text) => setPayTexts({ ...payTexts, [id]: text })}
            assigned={payCents ? sumValues(payCents) : null}
          />
          <SplitEditor
            group={group}
            total={amount}
            mode={splitMode}
            onModeChange={changeMode}
            included={splitAmong}
            onToggle={(id) =>
              setSplitAmong(splitAmong.includes(id) ? splitAmong.filter((x) => x !== id) : [...splitAmong, id])
            }
            weights={weights}
            onWeightChange={(id, w) => setWeights({ ...weights, [id]: w })}
            amounts={shareTexts}
            onAmountChange={(id, text) => setShareTexts({ ...shareTexts, [id]: text })}
            assigned={shareCents ? sumValues(shareCents) : null}
            shares={preview}
          />
        </>
      )}
    </FormScreen>
  );
}

/** "🔁 Cada mes" toggle. The day of the month is the expense's date. */
function RepeatField({ date, repeat, onChange }: { date: string; repeat: boolean; onChange: (r: boolean) => void }) {
  const { t } = useTranslation();
  const day = new Date(date).getDate();
  const first = dateKey(new Date(date));
  const plan = planRecurrence(first, day, dateKey(new Date()));
  const short = day > 28 ? ` ${t('expenseForm.repeatShortMonths')}` : '';
  return (
    <Field label={t('expenseForm.repeatLabel')}>
      <View style={{ flexDirection: 'row' }}>
        <Chip label={t('expenseForm.everyMonth')} selected={repeat} onPress={() => onChange(!repeat)} />
      </View>
      {repeat ? (
        <AppText variant="caption">
          {plan.createNow
            ? t('expenseForm.repeatNow', { day })
            : t('expenseForm.repeatLater', { date: formatDateKey(first), day })}
          {short} {t('expenseForm.repeatAuto')}
        </AppText>
      ) : null}
    </Field>
  );
}
