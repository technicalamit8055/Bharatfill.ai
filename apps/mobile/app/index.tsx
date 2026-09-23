/**
 * Entry route — the first frame of the app.
 *
 * This is the splash itself rather than a redirect, so the citizen sees branded content on the
 * very first frame instead of an empty screen that then pushes a splash. When it finishes it
 * replaces itself with onboarding, leaving nothing to go "back" to.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SplashScreen } from '../components/splash/SplashScreen';

export default function IndexScreen() {
  const router = useRouter();

  const handleFinish = useCallback(() => {
    router.replace('/(auth)/onboarding');
  }, [router]);

  return <SplashScreen onFinish={handleFinish} />;
}
