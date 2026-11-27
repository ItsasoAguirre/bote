import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { ColorPicker } from '@/components/color-picker';
import { EmojiPicker } from '@/components/emoji-picker';
import { AppText, Avatar, Button, Chip, Field, FormScreen, Input, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { memberIsUsed } from '@/lib/balances';
import { colorAt, nextColor } from '@/lib/colors';
import { DEFAULT_GROUP_EMOJI, GROUP_EMOJI_SUGGESTIONS, LOAN_EMOJI } from '@/lib/group-emoji';
import { newId } from '@/lib/id';
import { CURRENCIES, formatMoney, parseOptionalAmount } from '@/lib/money';
import type { Group, GroupType, Member } from '@/lib/types';
import type { GroupInput } from '@/store/groups';

/** Initial loan of a new loan group. */
export type LoanSetup = { lender: string; amounts: Record<string, number> };

export function GroupForm({
  group,
  submitLabel,
  onSubmit,
  onLeave,
  submitting,
  extra,
}: {
  /** Existing group when editing. */
  group?: Group;
  submitLabel: string;
  /** `loan` is set when creating a loan group: who lends and the cents lent to each borrower. */
  onSubmit: (input: GroupInput, loan?: LoanSetup) => void;
  onLeave?: () => void;
  /** Disables the submit button while the server call runs. */
  submitting?: boolean;
  /** Extra sections shown after the participants (e.g. category management). */
  extra?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name ?? '');
  const [emoji, setEmoji] = useState(group ? (group.emoji ?? '') : GROUP_EMOJI_SUGGESTIONS[0]);
  const [currency, setCurrency] = useState(group?.currency ?? 'EUR');
  const [members, setMembers] = useState<Member[]>(group?.members ?? []);
  const [newMember, setNewMember] = useState('');
  /** Member whose color palette is open. */
  const [colorFor, setColorFor] = useState<string | null>(null);
  // Group type and initial loan: only chosen when creating.
  const [type, setType] = useState<GroupType>(group?.type ?? 'expenses');
  const [lender, setLender] = useState<string | null>(null);
  const [loanTexts, setLoanTexts] = useState<Record<string, string>>({});
  const isLoan = type === 'loan';
  const creatingLoan = !group && isLoan;

  const lenderId = lender && members.some((m) => m.id === lender) ? lender : null;
  const borrowers = members.filter((m) => m.id !== lenderId);
  const loanCents: Record<string, number> | null = (() => {
    const result: Record<string, number> = {};
    for (const m of borrowers) {
      const cents = parseOptionalAmount(loanTexts[m.id] ?? '');
      if (cents === null) return null;
      if (cents > 0) result[m.id] = cents;
    }
    return result;
  })();
  const loanTotal = loanCents ? Object.values(loanCents).reduce((s, c) => s + c, 0) : 0;
  const loanReady = !creatingLoan || (lenderId !== null && loanCents !== null && loanTotal > 0);

  const changeType = (next: GroupType) => {
    setType(next);
    // Swap the default emoji to match, unless the user picked another one.
    if (next === 'loan' && emoji === GROUP_EMOJI_SUGGESTIONS[0]) setEmoji(LOAN_EMOJI);
    if (next === 'expenses' && emoji === LOAN_EMOJI) setEmoji(GROUP_EMOJI_SUGGESTIONS[0]);
  };

  const addMember = () => {
    const trimmed = newMember.trim();
    if (!trimmed) return;
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert(t('groupForm.duplicateNameTitle'), t('groupForm.duplicateNameMessage', { name: trimmed }));
      return;
    }
    setMembers([...members, { id: newId(), name: trimmed, color: nextColor(members) }]);
    setNewMember('');
  };

  const removeMember = (m: Member) => {
    if (group && memberIsUsed(group, m.id)) {
      Alert.alert(t('groupForm.cantRemoveTitle'), t('groupForm.cantRemoveMessage', { name: m.name }));
      return;
    }
    setMembers(members.filter((x) => x.id !== m.id));
  };

  const renameMember = (id: string, value: string) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, name: value } : m)));

  const recolorMember = (id: string, color: string) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, color } : m)));

  /** What's still missing, shown above the button so it's clear why it's disabled. */
  const missing = !name.trim()
    ? t('groupForm.missingName')
    : members.length < 2
      ? newMember.trim()
        ? t('groupForm.pressAdd', { name: newMember.trim() })
        : t('groupForm.twoMembers')
      : !members.every((m) => m.name.trim())
        ? t('groupForm.unnamedMember')
        : creatingLoan && !lenderId
          ? t('groupForm.chooseLender')
          : creatingLoan && loanCents === null
            ? t('groupForm.invalidLoanAmounts')
            : creatingLoan && loanTotal === 0
              ? t('groupForm.missingLoanAmount')
              : null;
  const canSubmit = missing === null && loanReady;

  // Form sections, rendered in order below (the loan section only shows when creating a loan).
  const typeBlock = (
    <>
      {!group ? (
        <Field label={t('groupForm.typeLabel')}>
          <Segmented
            options={[
              { value: 'expenses', label: t('groupForm.typeExpenses') },
              { value: 'loan', label: t('groupForm.typeLoan') },
            ]}
            value={type}
            onChange={changeType}
          />
          <AppText variant="caption">
            {isLoan
              ? t('groupForm.typeLoanHelp')
              : t('groupForm.typeExpensesHelp')}
          </AppText>
        </Field>
      ) : null}
    </>
  );
  const emojiBlock = (
    <>
      <EmojiPicker
        label={t('groupForm.emojiLabel')}
        value={emoji}
        onChange={setEmoji}
        suggestions={GROUP_EMOJI_SUGGESTIONS}
        fallback={DEFAULT_GROUP_EMOJI}
      />
    </>
  );
  const nameBlock = (
    <>
      <Field label={t('groupForm.nameLabel')}>
        <Input value={name} onChangeText={setName} placeholder={isLoan ? t('groupForm.namePlaceholderLoan') : t('groupForm.namePlaceholder')} />
      </Field>
    </>
  );
  const currencyBlock = (
    <>
      <Field label={t('groupForm.currencyLabel')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {CURRENCIES.map((c) => (
            <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </View>
      </Field>
    </>
  );
  const membersBlock = (
    <>
      <Field label={t('groupForm.membersLabel', { count: members.length })}>
        {members.length > 0 ? (
          <AppText variant="caption">{t('groupForm.colorHint')}</AppText>
        ) : null}
        {members.map((m, i) => (
          <View key={m.id} style={{ gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Pressable
                onPress={() => setColorFor(colorFor === m.id ? null : m.id)}
                accessibilityRole="button"
                accessibilityLabel={t('groupForm.changeColorA11y', { name: m.name })}
                hitSlop={4}>
                <Avatar name={m.name} color={colorAt(members, i)} />
              </Pressable>
              <Input
                value={m.name}
                onChangeText={(v) => renameMember(m.id, v)}
                style={{ flex: 1 }}
                accessibilityLabel={t('groupForm.memberNameA11y', { number: i + 1 })}
              />
              <Pressable
                onPress={() => removeMember(m)}
                accessibilityRole="button"
                accessibilityLabel={t('groupForm.removeA11y', { name: m.name })}
                hitSlop={8}
                style={{ padding: Spacing.sm }}>
                <AppText color={theme.negative} style={{ fontSize: 22 }}>
                  ×
                </AppText>
              </Pressable>
            </View>
            {colorFor === m.id ? (
              <ColorPicker
                value={colorAt(members, i)}
                onChange={(c) => {
                  recolorMember(m.id, c);
                  setColorFor(null);
                }}
              />
            ) : null}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Input
            value={newMember}
            onChangeText={setNewMember}
            placeholder={t('groupForm.addMemberPlaceholder')}
            onSubmitEditing={addMember}
            submitBehavior="submit"
            returnKeyType="done"
            style={{ flex: 1 }}
          />
          <View style={{ width: 100 }}>
            <Button title={t('common.add')} variant="secondary" onPress={addMember} disabled={!newMember.trim()} />
          </View>
        </View>
        {members.length < 2 ? (
          <AppText variant="caption">{t('groupForm.twoMembers')}</AppText>
        ) : null}
      </Field>
    </>
  );
  const loanBlock = (
    <>
      {creatingLoan ? (
        <>
          {members.length < 2 ? (
            <Field label={t('groupForm.whoLends')}>
              <AppText variant="caption">{t('groupForm.whoLendsHelp')}</AppText>
            </Field>
          ) : null}
          {members.length >= 2 ? (
            <>
              <Field label={t('groupForm.whoLends')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {members.map((m) => (
                    <Chip key={m.id} label={m.name} selected={lenderId === m.id} onPress={() => setLender(m.id)} />
                  ))}
                </View>
              </Field>
              {lenderId ? (
                <Field label={t('groupForm.howMuch', { currency })}>
                  <AppText variant="caption">{t('groupForm.howMuchHelp')}</AppText>
                  {borrowers.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                      <Avatar name={m.name} color={colorAt(members, members.indexOf(m))} size={30} />
                      <AppText style={{ flex: 1 }} numberOfLines={1}>
                        {m.name}
                      </AppText>
                      <Input
                        value={loanTexts[m.id] ?? ''}
                        onChangeText={(v) => setLoanTexts({ ...loanTexts, [m.id]: v })}
                        placeholder={t('groupForm.amountPlaceholder')}
                        keyboardType="decimal-pad"
                        accessibilityLabel={t('groupForm.loanAmountA11y', { name: m.name })}
                        style={{ width: 130, textAlign: 'right', paddingVertical: 8 }}
                      />
                    </View>
                  ))}
                  {loanCents === null ? (
                    <AppText variant="caption" color={theme.negative}>
                      {t('groupForm.invalidAmount')}
                    </AppText>
                  ) : loanTotal > 0 ? (
                    <AppText variant="caption">
                      {t('groupForm.totalLent', { amount: formatMoney(loanTotal, currency) })}
                    </AppText>
                  ) : null}
                </Field>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <FormScreen
      footer={
        <>
          {missing ? (
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              {missing}
            </AppText>
          ) : null}
          <Button
            title={submitting ? t('groupForm.saving') : submitLabel}
            disabled={!canSubmit || submitting}
            onPress={() =>
              onSubmit(
                {
                  name: name.trim(),
                  emoji: emoji.trim() || null,
                  currency,
                  // Save the visible color for everyone, so colors don't shift if someone is removed.
                  members: members.map((m, i) => ({ ...m, name: m.name.trim(), color: colorAt(members, i) })),
                  // The type is only sent when creating (it can't change afterwards).
                  ...(group ? {} : { type }),
                },
                creatingLoan && lenderId && loanCents ? { lender: lenderId, amounts: loanCents } : undefined,
              )
            }
          />
          {onLeave ? <Button title={t('groupForm.leave')} variant="danger" onPress={onLeave} /> : null}
        </>
      }>
      {typeBlock}
      {emojiBlock}
      {nameBlock}
      {currencyBlock}
      {membersBlock}
      {loanBlock}
      {extra}
    </FormScreen>
  );
}

