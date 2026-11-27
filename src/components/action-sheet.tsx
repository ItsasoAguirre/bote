import { BottomSheet, ListItem, Text } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type SheetAction = {
  label: string;
  /** Shown before the label on Android (iOS action sheets have no icons). */
  emoji: string;
  destructive?: boolean;
  onPress: () => void;
};

type SheetOptions = { title: string; message?: string; actions: SheetAction[] };

/**
 * Long-press style options menu. One per screen:
 * - iOS: the system action sheet.
 * - Android (and web): a Material bottom sheet from @expo/ui.
 *
 * Returns `show(options)` and the `sheet` element to render once in the screen.
 */
export function useActionSheet(): { show: (options: SheetOptions) => void; sheet: ReactNode } {
  const theme = useTheme();
  const [current, setCurrent] = useState<SheetOptions | null>(null);

  const show = (options: SheetOptions) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (Platform.OS === 'ios') {
      const destructive = options.actions.flatMap((a, i) => (a.destructive ? [i] : []));
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: options.title,
          message: options.message,
          options: [...options.actions.map((a) => a.label), 'Cancelar'],
          destructiveButtonIndex: destructive,
          cancelButtonIndex: options.actions.length,
        },
        (index) => options.actions[index]?.onPress(),
      );
    } else {
      setCurrent(options);
    }
  };

  const choose = (action: SheetAction) => {
    setCurrent(null); // close the sheet first, then act
    action.onPress();
  };

  const sheet =
    Platform.OS === 'ios' ? null : (
      <BottomSheet isPresented={current !== null} onDismiss={() => setCurrent(null)}>
        {current ? (
          <ListItem supportingText={current.message} colors={{ containerColor: 'transparent' }}>
            <Text textStyle={{ fontWeight: '700' }}>{current.title}</Text>
          </ListItem>
        ) : null}
        {(current?.actions ?? []).map((a) => (
          <ListItem
            key={a.label}
            onPress={() => choose(a)}
            leading={<Text textStyle={{ fontSize: 20 }}>{a.emoji}</Text>}
            colors={{ containerColor: 'transparent' }}>
            <Text textStyle={{ fontSize: 16, color: a.destructive ? theme.negative : undefined }}>{a.label}</Text>
          </ListItem>
        ))}
      </BottomSheet>
    );

  return { show, sheet };
}
