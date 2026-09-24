/**
 * The four steps of citizen registration, in order, as shown by the stepper at the top of the
 * sign-in screens. Each key has a label at `registration.steps.<key>`.
 */

export const REGISTRATION_STEPS = ['mobile', 'profile', 'security', 'done'] as const;

export type RegistrationStep = (typeof REGISTRATION_STEPS)[number];
