/**
 * The "Digital Bharat Stronger Citizens" ribbon that sits top-right beside the brand block on
 * the later sign-in steps.
 *
 * Render it as the first child of the screen's content column so it draws behind the brand
 * text. Decorative, so it ignores touches and screen readers.
 */

import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

/**
 * `digital-bharat-ribbon.png` is 360x428 with real transparency, cropped close around the
 * artwork. (The supplied file was a JPEG with a checkerboard baked in; the original is kept in
 * `Assests/profile/`.)
 */
const RIBBON_ASPECT = 360 / 428;

export function DigitalBharatRibbon() {
  const { width } = useWindowDimensions();
  const ribbonWidth = Math.max(64, Math.min(84, width * 0.18));

  return (
    <View style={styles.ribbon} pointerEvents="none" accessible={false}>
      <Image
        source={require('../../assets/profile/digital-bharat-ribbon.png')}
        style={{ width: ribbonWidth, height: ribbonWidth / RIBBON_ASPECT }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    position: 'absolute',
    top: 54,
    right: 12,
  },
});
