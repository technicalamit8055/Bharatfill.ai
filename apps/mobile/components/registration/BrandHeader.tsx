/**
 * The BharatDoc brand block shared by the sign-in screens: the app icon with its blue glow,
 * the two-tone wordmark and the subtitle. Each screen passes its own copy of the logo asset.
 */

import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { registrationPalette as palette } from './palette';

export function BrandHeader({ logo }: { readonly logo: ImageSourcePropType }) {
  const { t } = useTranslation();

  return (
    <View style={styles.brand}>
      <View style={styles.logoShadow}>
        <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
      </View>
      <View style={styles.brandCopy}>
        <Text style={styles.wordmark}>
          <Text style={{ color: palette.brandNavy }}>{t('splash.brandPrimary')}</Text>
          <Text style={{ color: palette.brandBlue }}>{t('splash.brandAccent')}</Text>
        </Text>
        <Text style={styles.brandSubtitle}>{t('splash.subtitle')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },
  logoShadow: {
    borderRadius: 16,
    shadowColor: palette.logoShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
    // Android drops the shadow unless the layer is opaque.
    backgroundColor: palette.background,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  brandCopy: {
    flex: 1,
    marginLeft: 12,
  },
  wordmark: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
    color: palette.textSecondary,
  },
});
