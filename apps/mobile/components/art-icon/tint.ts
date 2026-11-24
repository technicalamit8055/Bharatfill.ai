import type { ColorScheme } from '../../theme';
import { ART_ICONS, ART_TINTS, type ArtIconName } from './art-icons.generated';

/**
 * The soft tint behind an icon. Home, the vault, Connect and onboarding are light-only artwork,
 * so they take the default; a themed screen passes its own scheme.
 */
export function artIconTint(name: ArtIconName, scheme: ColorScheme = 'light'): string {
  return ART_TINTS[ART_ICONS[name].hue][scheme];
}
