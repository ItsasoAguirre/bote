import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MEMBER_COLORS } from '@/lib/colors';

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
      {MEMBER_COLORS.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t('colorPicker.colorA11y', { color: c })}
            onPress={() => onChange(c)}
            hitSlop={4}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: selected ? theme.text : 'transparent',
            }}
          />
        );
      })}
    </View>
  );
}
