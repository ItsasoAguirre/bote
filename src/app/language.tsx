import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deviceLanguage,
  LANGUAGE_NAMES,
  LANGUAGES,
  setLanguagePreference,
  useLanguagePreference,
  type LanguagePreference,
} from '@/i18n';

/** Language picker: the phone's language (default) or a fixed one. */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const current = useLanguagePreference();
  const insets = useSafeAreaInsets();

  const options: { value: LanguagePreference; label: string }[] = [
    {
      value: 'auto',
      label: t('common.language.auto', { language: LANGUAGE_NAMES[deviceLanguage()] }),
    },
    ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
  ];

  const choose = (value: LanguagePreference) => {
    // Changing the language rebuilds the navigation (see _layout), which closes this screen.
    if (router.canGoBack()) router.back();
    void setLanguagePreference(value);
  };

  return (
    // No flex: the sheet takes the height of this content.
    <View
      style={{
        backgroundColor: theme.background,
        padding: Spacing.md,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md + insets.bottom,
        gap: Spacing.sm,
      }}>
      <AppText variant="heading">{t('common.language.title')}</AppText>
      <Card style={{ padding: 0 }}>
        {options.map((o, i) => (
          <View key={o.value}>
            {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.border }]} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: current === o.value }}
              onPress={() => choose(o.value)}
              style={styles.row}>
              <AppText style={{ flex: 1 }}>{o.label}</AppText>
              {current === o.value ? (
                <AppText color={theme.primary} style={{ fontWeight: '700' }}>
                  ✓
                </AppText>
              ) : null}
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.md },
});
