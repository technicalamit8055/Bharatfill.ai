/**
 * The account card at the top of Profile: initials avatar with a camera badge, the name, email
 * and number, and the "Verified Account" pill once the number has passed OTP. Signed out, it is
 * a prompt to sign in with a person icon in place of the initials.
 *
 * Signed in, the name and details open the account and the camera badge is its own button
 * beside them — not nested inside — so a screen reader can reach both.
 */

import { Camera, ChevronRight, ShieldCheck, User } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { displayNameOf, phoneLineOf, type ProfileState } from '../../lib/profile/profile-screen';
import { profilePalette as palette } from './palette';

const AVATAR_SIZE = 92;
const BADGE_SIZE = 34;

export type ProfileAccountCardProps = {
  readonly state: ProfileState;
  readonly onOpen: () => void;
  readonly onChangePhoto: () => void;
};

export function ProfileAccountCard({ state, onOpen, onChangePhoto }: ProfileAccountCardProps) {
  const { t } = useTranslation();

  if (state.status === 'signed_out') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.signIn')}
        onPress={onOpen}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <User color={palette.avatarText} size={40} strokeWidth={2} />
        </View>
        <View style={styles.details}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.name}>
            {t('profile.signedOutTitle')}
          </Text>
          <Text numberOfLines={3} style={styles.line}>
            {t('profile.signedOutBody')}
          </Text>
        </View>
        <ChevronRight color={palette.chevron} size={24} strokeWidth={2} />
      </Pressable>
    );
  }

  const { account } = state;
  const name = displayNameOf(account.fullName);
  const initials = initialsOf(account.fullName);
  const phone = phoneLineOf(account.phoneNumber);

  return (
    <View style={styles.card}>
      <View>
        <View style={styles.avatar}>
          {initials ? (
            <Text numberOfLines={1} style={styles.initials}>
              {initials}
            </Text>
          ) : (
            <User color={palette.avatarText} size={40} strokeWidth={2} />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profile.changePhoto')}
          hitSlop={6}
          onPress={onChangePhoto}
          style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
        >
          <Camera color={palette.onBrand} size={17} strokeWidth={2.2} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.openAccount')}
        onPress={onOpen}
        style={({ pressed }) => [styles.opener, pressed && styles.pressed]}
      >
        <View style={styles.details}>
          {name ? (
            <Text accessibilityRole="header" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          ) : null}
          {account.email ? (
            <Text numberOfLines={1} style={styles.line}>
              {account.email}
            </Text>
          ) : null}
          {phone ? (
            <Text numberOfLines={1} style={styles.line}>
              {phone}
            </Text>
          ) : null}
          {account.phoneVerified ? (
            <View style={styles.verified}>
              <ShieldCheck
                color={palette.onBrand}
                fill={palette.verifiedIcon}
                size={20}
                strokeWidth={2.2}
              />
              <Text numberOfLines={1} style={styles.verifiedLabel}>
                {t('profile.verified')}
              </Text>
            </View>
          ) : null}
        </View>

        <ChevronRight color={palette.chevron} size={24} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  opener: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.avatarSurface,
  },
  initials: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.avatarText,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 2,
    borderColor: palette.avatarBadgeRing,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.avatarBadge,
  },

  details: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    color: palette.heading,
  },
  line: {
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.textSecondary,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: palette.verifiedSurface,
  },
  verifiedLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.verifiedText,
  },
});
