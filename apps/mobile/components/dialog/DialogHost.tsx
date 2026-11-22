/**
 * Draws the app's popups from `lib/dialog`: a centred dialog with a tone badge, a title, a
 * message and its buttons, or an action sheet that rises from the bottom.
 *
 * Mounted once, in the root layout, inside the theme, locale and safe-area providers. One
 * `Modal` hosts every popup, so it sits above the tabs, the full-screen scanner and the keyboard,
 * and Android's back button closes a popup the way its Cancel would. When one popup follows
 * another (a menu action that asks to confirm), the first animates out before the next comes in.
 */

import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  Sparkles,
  TriangleAlert,
} from 'lucide-react-native';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  arrangeButtons,
  dialogStore,
  type AlertRequest,
  type ButtonVariant,
  type DialogIcon,
  type DialogRequest,
  type DialogTone,
  type SheetRequest,
} from '../../lib/dialog/dialog-store';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { dialogPalette as palette } from './palette';

const ENTER_MS = 240;
const EXIT_MS = 160;
/** How far below its resting place a sheet starts; more than any sheet is tall. */
const SHEET_TRAVEL = 520;

const TONE_ICON: Record<DialogTone, DialogIcon> = {
  info: Info,
  brand: Sparkles,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export function DialogHost() {
  const { t } = useTranslation();
  const head = useSyncExternalStore(
    dialogStore.subscribe,
    dialogStore.current,
    dialogStore.current,
  );
  const [shown, setShown] = useState<DialogRequest | null>(head);
  const progress = useRef(new Animated.Value(0)).current;

  // The queue moved on: let the popup on screen leave, then show whatever is current by then.
  useEffect(() => {
    if (head?.id === shown?.id) return;
    if (!shown) {
      setShown(head);
      return;
    }
    const exit = Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    exit.start(() => setShown(dialogStore.current()));
    return () => exit.stop();
  }, [head, shown, progress]);

  useEffect(() => {
    if (!shown) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shown, progress]);

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const dismiss = () => {
    if (shown) dialogStore.dismiss(shown.id);
  };

  return (
    <Modal
      visible={shown !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={dismiss}
        />
      </Animated.View>
      {shown?.kind === 'alert' ? <AlertCard request={shown} progress={progress} /> : null}
      {shown?.kind === 'sheet' ? <ActionSheet request={shown} progress={progress} /> : null}
    </Modal>
  );
}

function ToneBadge({ tone, icon }: { readonly tone: DialogTone; readonly icon?: DialogIcon }) {
  const colors = palette.tones[tone];
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <View style={[styles.halo, { backgroundColor: colors.halo }]}>
      <View style={[styles.disc, { backgroundColor: colors.disc }]}>
        <Icon color={colors.icon} size={26} strokeWidth={2.2} />
      </View>
    </View>
  );
}

const BUTTON_COLORS: Record<
  ButtonVariant,
  { readonly fill: string; readonly pressed: string; readonly label: string }
> = {
  primary: { fill: palette.primary, pressed: palette.primaryPressed, label: palette.onPrimary },
  danger: { fill: palette.danger, pressed: palette.dangerPressed, label: palette.onDanger },
  secondary: {
    fill: palette.secondary,
    pressed: palette.secondaryPressed,
    label: palette.onSecondary,
  },
};

function AlertCard({
  request,
  progress,
}: {
  readonly request: AlertRequest;
  readonly progress: Animated.Value;
}) {
  const { height } = useWindowDimensions();
  const layout = arrangeButtons(request.buttons);
  const row = layout.direction === 'row';

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <View style={styles.centre} pointerEvents="box-none">
      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
        style={[styles.card, { opacity, transform: [{ translateY }, { scale }] }]}
      >
        <ToneBadge tone={request.tone} icon={request.icon} />
        <Text accessibilityRole="header" style={styles.title}>
          {request.title}
        </Text>
        {request.message ? (
          <ScrollView
            style={{ maxHeight: height * 0.4 }}
            contentContainerStyle={styles.messageContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.message}>{request.message}</Text>
          </ScrollView>
        ) : null}
        <View style={[styles.buttons, row ? styles.buttonsRow : styles.buttonsColumn]}>
          {layout.buttons.map(({ index, button, variant }) => {
            const colors = BUTTON_COLORS[variant];
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                onPress={() => dialogStore.press(request.id, index)}
                style={({ pressed }) => [
                  styles.button,
                  row && styles.buttonInRow,
                  { backgroundColor: pressed ? colors.pressed : colors.fill },
                ]}
              >
                <Text
                  style={[styles.buttonLabel, { color: colors.label }]}
                  numberOfLines={row ? 1 : 2}
                  adjustsFontSizeToFit={row}
                  minimumFontScale={0.8}
                >
                  {button.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

function ActionSheet({
  request,
  progress,
}: {
  readonly request: SheetRequest;
  readonly progress: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_TRAVEL, 0],
  });

  return (
    <View style={styles.sheetAnchor} pointerEvents="box-none">
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 8, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.handle} />
        {request.title ? (
          <Text accessibilityRole="header" style={styles.sheetTitle} numberOfLines={2}>
            {request.title}
          </Text>
        ) : null}
        {request.message ? <Text style={styles.sheetMessage}>{request.message}</Text> : null}

        {/* A long list (the portal presets) scrolls; the cancel button stays in reach. */}
        <ScrollView
          style={{ maxHeight: height * 0.6 }}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.actions}>
            {request.actions.map((action, position) => {
              const tile = action.destructive ? palette.actionTileDanger : palette.actionTile;
              const Icon = action.icon;
              return (
                <View key={action.key}>
                  {position > 0 ? <View style={styles.actionDivider} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      action.description ? `${action.label}. ${action.description}` : action.label
                    }
                    onPress={() => dialogStore.choose(request.id, action.key)}
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                  >
                    {Icon ? (
                      <View style={[styles.actionTile, { backgroundColor: tile.background }]}>
                        <Icon color={tile.icon} size={21} strokeWidth={2.1} />
                      </View>
                    ) : null}
                    <View style={styles.actionText}>
                      <Text
                        style={[styles.actionLabel, action.destructive && styles.actionLabelDanger]}
                      >
                        {action.label}
                      </Text>
                      {action.description ? (
                        <Text style={styles.actionDescription}>{action.description}</Text>
                      ) : null}
                    </View>
                    {action.destructive ? null : (
                      <ChevronRight color={palette.chevron} size={20} strokeWidth={2} />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={() => dialogStore.dismiss(request.id)}
          style={({ pressed }) => [
            styles.button,
            styles.sheetCancel,
            { backgroundColor: pressed ? palette.secondaryPressed : palette.secondary },
          ]}
        >
          <Text style={[styles.buttonLabel, { color: palette.onSecondary }]}>
            {request.cancelLabel}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.backdrop,
  },

  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  halo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 18,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: palette.heading,
  },
  messageContent: {
    paddingTop: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: palette.body,
  },
  buttons: {
    alignSelf: 'stretch',
    marginTop: 24,
    gap: 10,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInRow: {
    flex: 1,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  sheetAnchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.handle,
  },
  sheetTitle: {
    marginTop: 16,
    paddingHorizontal: 8,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: palette.heading,
  },
  sheetMessage: {
    marginTop: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
  },
  actions: {
    marginTop: 12,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
    backgroundColor: palette.divider,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 16,
  },
  actionRowPressed: {
    backgroundColor: palette.rowPressed,
  },
  actionTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: palette.heading,
  },
  actionLabelDanger: {
    color: palette.danger,
  },
  actionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
  },
  sheetCancel: {
    marginTop: 12,
  },
});
