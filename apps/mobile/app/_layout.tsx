/**
 * Root layout — wraps every route in the theme, locale and safe-area providers.
 *
 * Navigation itself stays thin: the tab shell lives in `(tabs)/_layout.tsx`, and future
 * full-screen flows (scanner camera, OTP sign-in, consent prompts) are registered here as
 * siblings so they can present over the tabs.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '../lib/i18n/I18nProvider';
import { ThemeProvider, useTheme } from '../theme';

function RootNavigator() {
  const { scheme, navigation } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={navigation.header}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <RootNavigator />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
