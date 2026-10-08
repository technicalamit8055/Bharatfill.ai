import { LaunchNotice } from '@/components/launch/launch-notice';
import { launchState } from '@/lib/launch/state';
import { SignUpForm } from './sign-up-form';

/** Read per request, so flipping SIGNUPS_ENABLED takes effect without a rebuild. */
export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  const { signupsOpen, channelUrl } = launchState();
  return signupsOpen ? <SignUpForm /> : <LaunchNotice heading="h1" channelUrl={channelUrl} />;
}
