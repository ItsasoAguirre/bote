import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { ToastProvider } from '@/components/toast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadLanguagePreference } from '@/i18n';
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
  const { t, i18n } = useTranslation();
  useNotificationTaps();
  useEffect(() => {
    void loadLanguagePreference();
  }, []);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: c.primary,
          background: c.background,
          card: c.card,
          text: c.text,
          border: c.border,
        },
      }}>
      <GroupsProvider>
        <ToastProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {/* Keyed by language: changing it rebuilds every screen, so nothing keeps old texts. */}
          <Stack key={i18n.language} screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            {/* Outside prod, the title says which environment this is, so they're never confused. */}
            <Stack.Screen
              name="index"
              options={{
                title:
                  appEnv === 'prod'
                    ? t('rootLayout.myGroups')
                    : `${t('rootLayout.myGroups')} · ${appEnv.toUpperCase()}`,
              }}
            />
            <Stack.Screen name="group/new" options={{ title: t('rootLayout.newGroup'), presentation: 'modal' }} />
            {/* A small sheet the height of its options, over the group list. */}
            <Stack.Screen
              name="language"
              options={{
                title: t('common.language.title'),
                presentation: 'formSheet',
                headerShown: false,
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: 20,
              }}
            />
            <Stack.Screen name="join" options={{ title: t('rootLayout.joinGroup'), presentation: 'modal' }} />
            <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
            <Stack.Screen name="group/[id]/who" options={{ title: t('rootLayout.whoAreYou'), presentation: 'modal' }} />
            <Stack.Screen
              name="group/[id]/edit"
              options={{ title: t('rootLayout.editGroup'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="group/[id]/expense/new"
              options={{ title: t('rootLayout.newExpense'), presentation: 'modal' }}
            />
            <Stack.Screen
              name="group/[id]/expense/[expenseId]"
              options={{ title: t('common.edit'), presentation: 'modal' }}
            />
          </Stack>
        </ToastProvider>
      </GroupsProvider>
    </ThemeProvider>
  );
}
