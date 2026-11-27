import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ToastProvider } from '@/components/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { groupIdFrom, Notifications } from '@/lib/push';
import { appEnv } from '@/lib/supabase';
import { GroupsProvider } from '@/store/groups';

/**
 * Keeps the group list under any screen opened directly (page reload on web, a link…),
 * so there is always a back button to return to it.
 */
export const unstable_settings = { anchor: 'index' };

/** Opens the group a tapped notification is about, whether the app was open or closed. */
function useNotificationTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = groupIdFrom(response);
      if (!id) return;
      router.push({ pathname: '/group/[id]', params: { id } });
      Notifications.clearLastNotificationResponse();
    };
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  useNotificationTaps();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: c.primary, background: c.background, card: c.card, text: c.text, border: c.border },
      }}>
      <GroupsProvider>
        <ToastProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            {/* Outside prod, the title says which environment this is, so they're never confused. */}
            <Stack.Screen
              name="index"
              options={{ title: appEnv === 'prod' ? 'Mis grupos' : `Mis grupos · ${appEnv.toUpperCase()}` }}
            />
            <Stack.Screen name="group/new" options={{ title: 'Nuevo grupo', presentation: 'modal' }} />
            <Stack.Screen name="join" options={{ title: 'Unirme a un grupo', presentation: 'modal' }} />
            <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
            <Stack.Screen name="group/[id]/who" options={{ title: '¿Quién eres?', presentation: 'modal' }} />
            <Stack.Screen name="group/[id]/edit" options={{ title: 'Editar grupo', presentation: 'modal' }} />
            <Stack.Screen name="group/[id]/expense/new" options={{ title: 'Nuevo gasto', presentation: 'modal' }} />
            <Stack.Screen name="group/[id]/expense/[expenseId]" options={{ title: 'Editar', presentation: 'modal' }} />
          </Stack>
        </ToastProvider>
      </GroupsProvider>
    </ThemeProvider>
  );
}
