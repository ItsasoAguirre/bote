import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToastInput = { message: string; actionLabel?: string; onAction?: () => void };
type Toast = ToastInput & { id: number };

const DURATION_MS = 5000;
/** Leaves room for the bottom action button ("Añadir gasto") on the group screen. */
const BOTTOM_OFFSET = 84;

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Shows one message at a time at the bottom of the screen, with an optional action like "Deshacer". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const show = (input: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...input, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  };

  const runAction = () => {
    if (timer.current) clearTimeout(timer.current);
    toast?.onAction?.();
    setToast(null);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host]}>
          <View
            key={toast.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: theme.text, marginBottom: insets.bottom + BOTTOM_OFFSET }]}>
            <Text style={[styles.message, { color: theme.background }]}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable accessibilityRole="button" onPress={runAction} hitSlop={8}>
                <Text style={[styles.action, { color: theme.primarySoft }]}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: { justifyContent: 'flex-end', paddingHorizontal: Spacing.md },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  message: { flex: 1, fontSize: 15 },
  action: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase' },
});
