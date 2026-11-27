import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Field, FormScreen, Input } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useGroups } from '@/store/groups';

export default function JoinScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const { joinGroup } = useGroups();
  const [code, setCode] = useState(params.code ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const id = await joinGroup(code);
      router.replace({ pathname: '/group/[id]/who', params: { id } });
    } catch {
      setError(t('joinScreen.error'));
      setSubmitting(false);
    }
  };

  return (
    <FormScreen
      footer={
        <Button
          title={submitting ? t('joinScreen.joining') : t('joinScreen.join')}
          onPress={join}
          disabled={code.trim().length < 6 || submitting}
        />
      }>
      <AppText variant="caption">
        {t('joinScreen.intro')}
      </AppText>
      <Field label={t('joinScreen.codeLabel')}>
        <Input
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="A1B2C3D4"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          onSubmitEditing={join}
          style={{ fontSize: 24, fontWeight: '700', letterSpacing: 4 }}
        />
      </Field>
      {error ? <AppText color={theme.negative}>{error}</AppText> : null}
    </FormScreen>
  );
}
