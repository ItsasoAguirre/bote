import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import i18n, { currentLanguage, t } from '@/i18n';

import { supabase } from './supabase';

/**
 * Push notifications. The database sends them (see the push_notifications migration);
 * the app only registers this device's token and opens the group when one is tapped.
 *
 * They don't work in Expo Go on Android (Expo removed it): use an APK (eas build).
 */

/** Must match the `channelId` the database sends and the plugin's defaultChannel. */
const CHANNEL_ID = 'default';

// Show notifications while the app is open too. On Android, without sound there's no pop-up.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registered = false;

// When the language changes, tell the server (and rename the Android channel).
i18n.on('languageChanged', () => {
  if (registered) void registerForPushNotifications();
});

/**
 * Asks for permission (once) and saves this device's push token for the signed-in user.
 * Never throws: without permission, in Expo Go or on web it simply does nothing.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;

    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: t('push.channelName'),
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // The language makes the server write this device's notifications in it.
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS, p_locale: currentLanguage() });
    registered = true;
  } catch {
    // Expo Go on Android, no Google Play services, offline… Notifications are optional.
  }
}

/** Group id carried by a notification, if any. */
export function groupIdFrom(response: Notifications.NotificationResponse | null): string | null {
  const id = response?.notification.request.content.data?.groupId;
  return typeof id === 'string' ? id : null;
}

export { Notifications };
