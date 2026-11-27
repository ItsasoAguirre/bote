import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { AppText, Button, Card, Chip, Field, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { groupCategories } from '@/lib/categories';
import type { Group } from '@/lib/types';
import { useGroups } from '@/store/groups';

/** Emoji + name inputs to create a custom category in the group. */
function NewCategoryForm({ group, onCreated }: { group: Group; onCreated?: (id: string) => void }) {
  const { t } = useTranslation();
  const { addCategory } = useGroups();
  const [emoji, setEmoji] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const taken = groupCategories(group).some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const canCreate = emoji.trim().length > 0 && name.trim().length > 0 && !taken && !saving;

  const create = async () => {
    if (!canCreate) return;
    setSaving(true);
    const id = await addCategory(group.id, { emoji, name });
    setSaving(false);
    if (id) {
      setEmoji('');
      setName('');
      onCreated?.(id);
    }
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Input
          value={emoji}
          onChangeText={setEmoji}
          placeholder="🙂"
          maxLength={16}
          accessibilityLabel={t('categories.emojiLabel')}
          style={{ width: 64, textAlign: 'center', fontSize: 22 }}
        />
        <Input
          value={name}
          onChangeText={setName}
          placeholder={t('categories.namePlaceholder')}
          maxLength={40}
          onSubmitEditing={create}
          style={{ flex: 1 }}
        />
      </View>
      {taken ? <AppText variant="caption">{t('categories.taken')}</AppText> : null}
      <Button
        title={saving ? t('categories.creating') : t('categories.create')}
        variant="secondary"
        onPress={create}
        disabled={!canCreate}
      />
    </View>
  );
}

/** Category chooser for the expense form. Tapping the selected category again clears it. */
export function CategoryPicker({
  group,
  value,
  onChange,
}: {
  group: Group;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  return (
    <Field label={t('categories.label')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {groupCategories(group).map((c) => (
          <Chip
            key={c.id}
            label={`${c.emoji} ${c.name}`}
            selected={value === c.id}
            onPress={() => onChange(value === c.id ? null : c.id)}
          />
        ))}
        <Chip label={t('categories.new')} selected={creating} onPress={() => setCreating(!creating)} />
      </View>
      {creating ? (
        <NewCategoryForm
          group={group}
          onCreated={(id) => {
            onChange(id);
            setCreating(false);
          }}
        />
      ) : null}
    </Field>
  );
}

/** Lists the group's custom categories with delete, plus a form to add new ones. */
export function CategoryManager({ group }: { group: Group }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { deleteCategory } = useGroups();
  const custom = group.categories ?? [];

  const confirmDelete = (id: string, label: string) => {
    const used = group.expenses.filter((e) => e.category === id).length;
    Alert.alert(
      t('categories.deleteTitle'),
      used > 0
        ? t('categories.deleteUsed', { label, count: used })
        : t('categories.deleteConfirm', { label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('categories.delete'), style: 'destructive', onPress: () => void deleteCategory(group.id, id) },
      ],
    );
  };

  return (
    <Field label={t('categories.customTitle', { count: custom.length })}>
      <AppText variant="caption">{t('categories.customHelp')}</AppText>
      {custom.length > 0 ? (
        <Card style={{ gap: Spacing.sm }}>
          {custom.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <AppText style={{ fontSize: 22 }}>{c.emoji}</AppText>
              <AppText style={{ flex: 1 }}>{c.name}</AppText>
              <Pressable
                onPress={() => confirmDelete(c.id, c.name)}
                accessibilityRole="button"
                accessibilityLabel={t('categories.deleteA11y', { name: c.name })}
                hitSlop={8}
                style={{ padding: Spacing.xs }}>
                <AppText color={theme.negative} style={{ fontSize: 22 }}>
                  ×
                </AppText>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      <NewCategoryForm group={group} />
    </Field>
  );
}
