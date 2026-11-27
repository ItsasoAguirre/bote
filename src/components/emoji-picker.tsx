import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Field, Input } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Emoji chooser: a large preview, a grid of suggestions (all visible, no scrolling)
 * and "Otro" to type any emoji with the keyboard.
 */
export function EmojiPicker({
  label,
  value,
  onChange,
  suggestions,
  fallback,
}: {
  label: string;
  value: string;
  onChange: (emoji: string) => void;
  suggestions: string[];
  /** Shown in the preview when nothing is chosen. */
  fallback: string;
}) {
  const theme = useTheme();
  const isCustom = value.trim() !== '' && !suggestions.includes(value.trim());
  const [typing, setTyping] = useState(isCustom);

  return (
    <Field label={label}>
      <View style={styles.previewRow}>
        <View style={[styles.preview, { backgroundColor: theme.primarySoft }]}>
          <AppText style={{ fontSize: 36, opacity: value.trim() ? 1 : 0.4 }}>{value.trim() || fallback}</AppText>
        </View>
        <AppText variant="caption" style={{ flex: 1 }}>
          Elige uno de abajo o pulsa «Otro» para escribir cualquier emoji.
        </AppText>
      </View>

      <View style={styles.grid}>
        {suggestions.map((e) => {
          const selected = value.trim() === e;
          return (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Elegir ${e}`}
              onPress={() => {
                setTyping(false);
                onChange(e);
              }}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.card,
                  borderColor: selected ? theme.primary : theme.border,
                  borderWidth: selected ? 2 : 1,
                },
              ]}>
              <AppText style={{ fontSize: 24 }}>{e}</AppText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: typing }}
          onPress={() => {
            setTyping(true);
            if (!isCustom) onChange('');
          }}
          style={[
            styles.option,
            styles.other,
            {
              backgroundColor: typing ? theme.primarySoft : theme.card,
              borderColor: typing ? theme.primary : theme.border,
              borderWidth: typing ? 2 : 1,
            },
          ]}>
          <AppText style={{ fontWeight: '600' }} color={theme.primary}>
            Otro
          </AppText>
        </Pressable>
      </View>

      {typing ? (
        <Input
          value={isCustom ? value : ''}
          onChangeText={onChange}
          placeholder="Escribe un emoji 🙂"
          maxLength={16}
          autoFocus
          accessibilityLabel={label}
          style={{ fontSize: 22 }}
        />
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  preview: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  other: { width: 'auto', paddingHorizontal: Spacing.md },
});
