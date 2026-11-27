import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Height of the screen area covered by the keyboard, in px (0 when hidden).
 *
 * Needed on Android: apps there are drawn edge-to-edge, so the window no longer shrinks
 * when the keyboard opens and content behind it would stay hidden.
 *
 * React Native's Android event reports the keyboard height *minus* the navigation bar
 * (ReactRootView: `imeInsets.bottom - barInsets.bottom`). Since the app is also drawn
 * behind that bar, the navigation bar height is added back.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (height === 0) return 0;
  return Platform.OS === 'android' ? height + insets.bottom : height;
}
