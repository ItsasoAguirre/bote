import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Button, Card, Field, FormScreen, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { colorAt } from '@/lib/colors';
import { useTheme } from '@/hooks/use-theme';
import { useGroup, useGroups, useMe } from '@/store/groups';

/** Lets the person using this device say which member of the group they are. */
export default function WhoAmIScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const current = useMe(id);
  const theme = useTheme();
  const { setMe, addMember } = useGroups();
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!group) return null;

  const done = () => router.dismissTo({ pathname: '/group/[id]', params: { id: group.id } });

  const choose = (memberId: string) => {
    setMe(group.id, memberId);
    done();
  };

  const nameTaken = group.members.some((m) => m.name.toLowerCase() === newName.trim().toLowerCase());

  const addMyself = async () => {
    setSaving(true);
    const memberId = await addMember(group.id, newName);
    setSaving(false);
    if (memberId) choose(memberId);
  };

  return (
    <FormScreen>
      <AppText variant="caption">
        {t('whoScreen.intro', { group: group.name })}
      </AppText>

      <View style={{ gap: Spacing.sm }}>
        {group.members.map((m, i) => {
          const selected = m.id === current;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => choose(m.id)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: Spacing.md,
                  borderColor: selected ? theme.primary : theme.border,
                  borderWidth: selected ? 2 : undefined,
                }}>
                <Avatar name={m.name} color={colorAt(group.members, i)} />
                <AppText variant="heading" style={{ flex: 1 }}>
                  {m.name}
                </AppText>
                {selected ? (
                  <AppText color={theme.primary} style={{ fontWeight: '700' }}>
                    {t('whoScreen.itsYou')}
                  </AppText>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Field label={t('whoScreen.notListed')}>
        <Input value={newName} onChangeText={setNewName} placeholder={t('whoScreen.namePlaceholder')} />
        {nameTaken ? <AppText variant="caption">{t('whoScreen.nameTaken')}</AppText> : null}
        <Button
          title={saving ? t('whoScreen.adding') : t('whoScreen.addMe')}
          variant="secondary"
          onPress={addMyself}
          disabled={!newName.trim() || nameTaken || saving}
        />
      </Field>
    </FormScreen>
  );
}
