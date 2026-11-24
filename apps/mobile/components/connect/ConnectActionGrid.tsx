/**
 * The four cards under the Connect hero, as in the mockup: Find Nearby CSC and Share Document
 * as tall cards on the first row, My Connections and Request Help as compact rows on the
 * second. Each is a pastel tint of its icon's hue with a chevron.
 *
 * The two columns stay side by side on a phone; below `STACK_BELOW` there is no room for the
 * copy, so every card takes the full width.
 */

import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConnectAction } from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ArtIcon } from '../art-icon/ArtIcon';
import { artIconTint } from '../art-icon/tint';
import { connectPalette as palette } from './palette';

const GAP = 12;
/** Below this content width the cards stack in one column. */
const STACK_BELOW = 300;

const TALL: readonly ConnectAction[] = ['find_nearby', 'share_document'];
const COMPACT: readonly ConnectAction[] = ['connections', 'request_help'];

export type ConnectActionGridProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly onAction: (action: ConnectAction) => void;
};

export function ConnectActionGrid({ width, onAction }: ConnectActionGridProps) {
  const stacked = width < STACK_BELOW;
  const cardWidth = stacked ? width : Math.floor((width - GAP) / 2);

  return (
    <View style={styles.grid}>
      {TALL.map((action) => (
        <ActionCard key={action} action={action} width={cardWidth} tall onPress={onAction} />
      ))}
      {COMPACT.map((action) => (
        <ActionCard key={action} action={action} width={cardWidth} onPress={onAction} />
      ))}
    </View>
  );
}

type ActionCardProps = {
  readonly action: ConnectAction;
  readonly width: number;
  readonly tall?: boolean;
  readonly onPress: (action: ConnectAction) => void;
};

function ActionCard({ action, width, tall = false, onPress }: ActionCardProps) {
  const { t } = useTranslation();
  const tint = palette.actions[action];
  const title = t(`connect.actions.${action}.title`);
  const body = t(`connect.actions.${action}.body`);

  const badge = (
    <View style={[tall ? styles.badgeTall : styles.badgeCompact, { backgroundColor: artIconTint(action) }]}>
      <ArtIcon name={action} size={tall ? 34 : 30} />
    </View>
  );
  const chevron = (
    <View style={styles.chevron}>
      <ChevronRight
        color={action === 'find_nearby' ? palette.chevronIcon : tint.icon}
        size={18}
        strokeWidth={2.4}
      />
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      onPress={() => onPress(action)}
      style={({ pressed }) => [
        styles.card,
        tall ? styles.cardTall : styles.cardCompact,
        { width, backgroundColor: tint.tile, borderColor: tint.border },
        pressed && styles.pressed,
      ]}
    >
      {tall ? (
        <>
          <View style={styles.tallTop}>
            {badge}
            {chevron}
          </View>
          <Text numberOfLines={2} style={styles.titleTall}>
            {title}
          </Text>
          <Text numberOfLines={3} style={styles.body}>
            {body}
          </Text>
        </>
      ) : (
        <>
          {badge}
          <View style={styles.compactCopy}>
            <Text numberOfLines={2} style={styles.titleCompact}>
              {title}
            </Text>
            <Text numberOfLines={3} style={styles.bodyCompact}>
              {body}
            </Text>
          </View>
          {chevron}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
  },
  cardTall: {
    padding: 14,
  },
  cardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 10,
  },
  pressed: {
    opacity: 0.7,
  },

  tallTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeTall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.chevronWell,
  },

  titleTall: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: palette.heading,
  },
  body: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
  },

  compactCopy: {
    flex: 1,
  },
  titleCompact: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '800',
    color: palette.heading,
  },
  bodyCompact: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textSecondary,
  },
});
