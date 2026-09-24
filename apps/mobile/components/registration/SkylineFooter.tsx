/**
 * The monument skyline, "MADE FOR A DIGITAL INDIA" caption and tricolour bar that close the
 * sign-in screens.
 *
 * Render it as the last child of a ScrollView whose content container has `flexGrow: 1`: it
 * grows to fill the leftover space and sits at the bottom, and simply follows the content when
 * the page is taller than the screen. Decorative, so it ignores touches.
 */

import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { registrationPalette as palette } from './palette';

/**
 * `india-skyline-tricolor.jpg` is 1376x768 with an English caption baked in below the ribbon.
 * Only the band from the skyline to the ribbon is shown; the caption is drawn as text instead
 * so it can be translated.
 */
const SKYLINE_SOURCE_WIDTH = 1376;
const SKYLINE_SOURCE_HEIGHT = 768;
const SKYLINE_CROP_TOP = 190;
const SKYLINE_CROP_BOTTOM = 600;

export function SkylineFooter() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const skylineScale = width / SKYLINE_SOURCE_WIDTH;
  const skylineCropHeight = (SKYLINE_CROP_BOTTOM - SKYLINE_CROP_TOP) * skylineScale;

  return (
    <View style={styles.footer} pointerEvents="none">
      <View style={{ width, height: skylineCropHeight, overflow: 'hidden' }}>
        <Image
          source={require('../../assets/registration/india-skyline-tricolor.jpg')}
          style={{
            width,
            height: SKYLINE_SOURCE_HEIGHT * skylineScale,
            marginTop: -SKYLINE_CROP_TOP * skylineScale,
          }}
          resizeMode="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      </View>
      <Text style={styles.footerText}>{t('splash.footer')}</Text>
      <View style={styles.footerBar}>
        <View style={[styles.footerBarSegment, { backgroundColor: palette.saffron }]} />
        <View style={[styles.footerBarSegment, { backgroundColor: palette.neutralBar }]} />
        <View style={[styles.footerBarSegment, { backgroundColor: palette.green }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  footerText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    color: palette.footerText,
  },
  footerBar: {
    flexDirection: 'row',
    width: 132,
    height: 3,
    marginTop: 9,
    borderRadius: 2,
    overflow: 'hidden',
  },
  footerBarSegment: {
    flex: 1,
  },
});
