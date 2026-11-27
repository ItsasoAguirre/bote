import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { AppText } from '@/components/ui';
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

const MENU_WIDTH = 240;

/**
 * Globe button for the header that opens a small dropdown under it with the languages:
 * the phone's language (default) or a fixed one.
 */
export function LanguageMenu() {
  const { t } = useTranslation();
  const theme = useTheme();
  const current = useLanguagePreference();
  const { width: screenWidth } = useWindowDimensions();
  const button = useRef<ComponentRef<typeof Pressable>>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () => {
    // Place the menu right under the button, aligned to its right edge.
    button.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + 4, right: Math.max(Spacing.sm, screenWidth - (x + width)) });
    });
  };

  const choose = (value: LanguagePreference) => {
    setAnchor(null);
    // Changing the language rebuilds the screens (see _layout), so close the menu first.
    if (value !== current) void setLanguagePreference(value);
  };

  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'auto', label: t('common.language.auto', { language: LANGUAGE_NAMES[deviceLanguage()] }) },
    ...LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
  ];

  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={t('common.language.title')}
        hitSlop={8}
        onPress={open}
        style={{ paddingHorizontal: Spacing.sm }}>
        <GlobeIcon color={theme.textSecondary} />
      </Pressable>

      <Modal
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        visible={anchor !== null}
        animationType="fade"
        onRequestClose={() => setAnchor(null)}>
        {/* Tapping outside the menu closes it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setAnchor(null)}
          accessibilityLabel={t('common.close')}
        />
        {anchor ? (
          <View
            accessibilityRole="menu"
            style={[
              styles.menu,
              { top: anchor.top, right: anchor.right, backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            {options.map((o, i) => (
              <View key={o.value}>
                {i > 0 ? <View style={[styles.separator, { backgroundColor: theme.border }]} /> : null}
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: current === o.value }}
                  onPress={() => choose(o.value)}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.primarySoft }]}>
                  <AppText style={{ flex: 1 }}>{o.label}</AppText>
                  {current === o.value ? (
                    <AppText color={theme.primary} style={{ fontWeight: '700' }}>
                      ✓
                    </AppText>
                  ) : null}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

/** Thin outline globe. */
function GlobeIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}>
      <Circle cx={12} cy={12} r={9} />
      <Ellipse cx={12} cy={12} rx={4} ry={9} />
      <Path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12 },
  separator: { height: StyleSheet.hairlineWidth },
});
