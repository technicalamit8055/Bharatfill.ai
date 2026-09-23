/**
 * Auth group layout.
 *
 * Every screen in this group is full-bleed branded content (splash, onboarding, and later the
 * mobile-number sign-in), so the group hides the stack header rather than each screen opting
 * out individually.
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
