/**
 * The Profile mockup's account, for development builds only, so the layout can be reviewed full
 * before sign-in exists. The Profile route never shows it in a production build.
 *
 * Sample data, not a real citizen's: "Amit Kumar" is the mockup's placeholder name (as on
 * Home), the number is the registration screen's placeholder, and the email is on the reserved
 * `example.com` domain rather than the mockup's address.
 */

import type { ProfileState } from '../../lib/profile/profile-screen';

export const DEMO_PROFILE: ProfileState = {
  status: 'signed_in',
  account: {
    fullName: 'Amit Kumar',
    phoneNumber: '9876543210',
    phoneVerified: true,
    email: 'amit.kumar@example.com',
    plan: 'free',
  },
};
