import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useTheme } from '@/hooks/use-theme';

export function AppText({
  variant = 'body',
  color,
  style,
  ...props
}: TextProps & { variant?: 'title' | 'heading' | 'body' | 'caption'; color?: string }) {
  const theme = useTheme();
  return (
    <Text
      {...props}
      style={[
        styles[variant],
        { color: color ?? (variant === 'caption' ? theme.textSecondary : theme.text) },
        style,
      ]}
    />
  );
}

/**
 * Scrollable form screen that keeps inputs, and the footer button, visible above the keyboard.
 * - iOS: KeyboardAvoidingView.
 * - Android: the app is drawn edge-to-edge, so the window doesn't shrink for the keyboard;
 *   we leave a gap of the keyboard's height at the bottom instead.
 */
export function FormScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const theme = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const content = (
    <>
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        // With the keyboard open, the footer sits right on it: no bottom safe-area inset needed.
        <SafeAreaView
          edges={keyboardHeight > 0 ? [] : ['bottom']}
          style={[styles.footer, { borderColor: theme.border, backgroundColor: theme.background }]}>
          {footer}
        </SafeAreaView>
      ) : null}
    </>
  );

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior="padding"
        keyboardVerticalOffset={100}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: theme.background, paddingBottom: keyboardHeight }}>{content}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="caption" style={styles.label}>
        {label.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
        props.style,
      ]}
    />
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : variant === 'secondary' ? theme.primarySoft : 'transparent';
  const fg = variant === 'primary' ? theme.onPrimary : variant === 'secondary' ? theme.primary : theme.negative;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}>
      <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: theme.card }]}>
            <Text style={{ color: active ? theme.text : theme.textSecondary, fontWeight: '600' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  caption: { fontSize: 13 },
  label: { fontWeight: '700', letterSpacing: 0.5 },
  formContent: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xl },
  footer: { padding: Spacing.md, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
});
