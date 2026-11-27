import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Avatar, Button, Card, Field, FormScreen, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { colorAt } from '@/lib/colors';
import { useTheme } from '@/hooks/use-theme';
import { useGroup, useGroups, useMe } from '@/store/groups';

/** Lets the person using this device say which member of the group they are. */
export default function WhoAmIScreen() {
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
        Elige tu nombre en «{group.name}». Así la app sabe qué gastos son tuyos y cuánto debes. Solo se guarda en
        este móvil y puedes cambiarlo cuando quieras.
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
                    Eres tú
                  </AppText>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Field label="¿No estás en la lista?">
        <Input value={newName} onChangeText={setNewName} placeholder="Tu nombre" />
        {nameTaken ? <AppText variant="caption">Ese nombre ya está. Si eres tú, elígelo arriba.</AppText> : null}
        <Button
          title={saving ? 'Añadiendo…' : 'Añadirme al grupo'}
          variant="secondary"
          onPress={addMyself}
          disabled={!newName.trim() || nameTaken || saving}
        />
      </Field>
    </FormScreen>
  );
}
