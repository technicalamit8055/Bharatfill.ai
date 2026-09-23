/**
 * Splash as an addressable route inside the auth group.
 *
 * The entry route at `app/index.tsx` is what a cold start lands on; this exists so the auth
 * flow can return to the splash explicitly — for example after a sign-out, or while a session
 * is being restored — without reaching back into the root route.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { SplashScreen } from '../../components/splash/SplashScreen';

export default function AuthSplashScreen() {
  const router = useRouter();

  const handleFinish = useCallback(() => {
    router.replace('/(auth)/onboarding');
  }, [router]);

  return <SplashScreen onFinish={handleFinish} />;
}
