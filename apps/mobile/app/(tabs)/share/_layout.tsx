/**
 * The Connect tab's own stack: the Connect screen, then Nearby CSC Centers and a centre's
 * details pushed over it. Each draws its own header. A stack inside the tab keeps the tab bar
 * showing on the pushed screens, as in their mockups.
 */

import { Stack } from 'expo-router';

export default function ConnectStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nearby" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="centre" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
