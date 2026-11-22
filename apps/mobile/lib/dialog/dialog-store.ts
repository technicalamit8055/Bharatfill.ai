/**
 * The app's popups: a queue of dialogs and action sheets that `<DialogHost>` draws in the
 * app's own style, in place of the platform's `Alert.alert`.
 *
 * `showDialog` takes the same arguments as `Alert.alert` (title, message, buttons) plus a tone
 * and an icon, so a call site moves over without changing its logic. `showActionSheet` is for a
 * list of things to do, which an alert's button row cannot lay out well.
 *
 * Pure TypeScript with no React Native import, so the queue's rules are unit tested in Node.
 * One dialog shows at a time; a dialog opened while another is up waits its turn, and one opened
 * from a button's handler shows once the first has closed.
 */

import type { ComponentType } from 'react';

/** Anything that draws an icon: a lucide-react-native icon, typically. */
export type DialogIcon = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

/** Sets the icon badge colour. `danger` is inferred when a button is destructive. */
export type DialogTone = 'info' | 'success' | 'warning' | 'danger' | 'brand';

export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export type DialogButton = {
  readonly text: string;
  readonly style?: DialogButtonStyle;
  readonly onPress?: () => void;
};

export type DialogOptions = {
  readonly tone?: DialogTone;
  readonly icon?: DialogIcon;
  /**
   * Whether the back button and a tap outside close the dialog, as its cancel button would.
   * Defaults to true. A dialog with several buttons and none marked `cancel` never closes this
   * way, so the citizen has to choose.
   */
  readonly dismissible?: boolean;
};

export type AlertRequest = {
  readonly kind: 'alert';
  readonly id: number;
  readonly title: string;
  readonly message?: string;
  readonly buttons: readonly DialogButton[];
  readonly tone: DialogTone;
  readonly icon?: DialogIcon;
  readonly dismissible: boolean;
};

export type SheetAction = {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: DialogIcon;
  readonly destructive?: boolean;
  readonly onPress: () => void;
};

export type ActionSheetInput = {
  readonly title?: string;
  readonly message?: string;
  readonly actions: readonly SheetAction[];
  readonly cancelLabel: string;
  readonly onCancel?: () => void;
};

export type SheetRequest = ActionSheetInput & {
  readonly kind: 'sheet';
  readonly id: number;
};

export type DialogRequest = AlertRequest | SheetRequest;

/** How a button is drawn. */
export type ButtonVariant = 'primary' | 'danger' | 'secondary';

export type ArrangedButton = {
  /** Position in the caller's `buttons` array; what `press` takes. */
  readonly index: number;
  readonly button: DialogButton;
  readonly variant: ButtonVariant;
};

export type ButtonLayout = {
  readonly direction: 'row' | 'column';
  readonly buttons: readonly ArrangedButton[];
};

/**
 * Lays out an alert's buttons the way platform dialogs do: two buttons share a row with Cancel
 * on the left and the action on the right; one, or three and more, stack full width with Cancel
 * at the bottom. The first non-cancel button is filled (red when destructive); the rest are quiet.
 */
export function arrangeButtons(buttons: readonly DialogButton[]): ButtonLayout {
  const indexed = buttons.map((button, index) => ({ button, index }));
  const cancels = indexed.filter(({ button }) => button.style === 'cancel');
  const actions = indexed.filter(({ button }) => button.style !== 'cancel');

  const variantOf = (button: DialogButton, emphasised: boolean): ButtonVariant => {
    if (button.style === 'cancel') return 'secondary';
    if (button.style === 'destructive') return 'danger';
    return emphasised ? 'primary' : 'secondary';
  };

  // A lone button (an informational "OK") is the dialog's action, even if marked cancel.
  if (buttons.length === 1) {
    const [only] = indexed;
    if (!only) return { direction: 'column', buttons: [] };
    const variant = only.button.style === 'destructive' ? 'danger' : 'primary';
    return { direction: 'column', buttons: [{ ...only, variant }] };
  }

  if (buttons.length === 2) {
    const ordered = [...cancels, ...actions];
    return {
      direction: 'row',
      buttons: ordered.map(({ button, index }, position) => ({
        index,
        button,
        // In a row the right-hand button is the action.
        variant: variantOf(button, position === ordered.length - 1),
      })),
    };
  }

  return {
    direction: 'column',
    buttons: [...actions, ...cancels].map(({ button, index }, position) => ({
      index,
      button,
      variant: variantOf(button, position === 0),
    })),
  };
}

/** Which button the back button or a tap outside presses, or null when neither may close it. */
export function dismissButtonIndex(request: AlertRequest): number | null {
  if (!request.dismissible) return null;
  const cancel = request.buttons.findIndex((button) => button.style === 'cancel');
  if (cancel !== -1) return cancel;
  return request.buttons.length === 1 ? 0 : null;
}

export type DialogStore = ReturnType<typeof createDialogStore>;

export function createDialogStore() {
  let queue: readonly DialogRequest[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const remove = (id: number) => {
    queue = queue.filter((request) => request.id !== id);
    notify();
  };

  const headWith = (id: number): DialogRequest | undefined => {
    const head = queue[0];
    return head?.id === id ? head : undefined;
  };

  const press = (id: number, index: number): void => {
    const request = headWith(id);
    if (request?.kind !== 'alert') return;
    const button = request.buttons[index];
    if (!button) return;
    remove(id);
    button.onPress?.();
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** The dialog on screen, or null. Stable between changes, for `useSyncExternalStore`. */
    current(): DialogRequest | null {
      return queue[0] ?? null;
    },

    /** How many dialogs are waiting, the one on screen included. */
    size(): number {
      return queue.length;
    },

    /**
     * Shows a dialog. Same arguments as `Alert.alert`, plus options. Returns its id, or null
     * when the same dialog is already up or waiting (a double tap opens it once).
     */
    alert(
      title: string,
      message: string | undefined,
      buttons: readonly [DialogButton, ...DialogButton[]],
      options: DialogOptions = {},
    ): number | null {
      const duplicate = queue.some(
        (request) =>
          request.kind === 'alert' && request.title === title && request.message === message,
      );
      if (duplicate) return null;

      const tone =
        options.tone ??
        (buttons.some((button) => button.style === 'destructive') ? 'danger' : 'info');
      const request: AlertRequest = {
        kind: 'alert',
        id: nextId++,
        title,
        message: message && message.length > 0 ? message : undefined,
        buttons,
        tone,
        icon: options.icon,
        dismissible: options.dismissible ?? true,
      };
      queue = [...queue, request];
      notify();
      return request.id;
    },

    /** Shows a list of actions in a sheet from the bottom of the screen. Returns its id. */
    actionSheet(input: ActionSheetInput): number {
      const request: SheetRequest = { ...input, kind: 'sheet', id: nextId++ };
      queue = [...queue, request];
      notify();
      return request.id;
    },

    /**
     * Presses a dialog's button: closes the dialog, then runs the button's handler. Ignored
     * unless the dialog is the one on screen, so a double tap runs the handler once.
     */
    press,

    /** Picks an action from a sheet: closes the sheet, then runs it. */
    choose(id: number, key: string): void {
      const request = headWith(id);
      if (request?.kind !== 'sheet') return;
      const action = request.actions.find((each) => each.key === key);
      if (!action) return;
      remove(id);
      action.onPress();
    },

    /**
     * The back button, or a tap outside. A sheet closes as if Cancel was tapped; a dialog presses
     * its cancel button, or does nothing when it may not be dismissed (see `dismissButtonIndex`).
     */
    dismiss(id: number): void {
      const request = headWith(id);
      if (!request) return;
      if (request.kind === 'sheet') {
        remove(id);
        request.onCancel?.();
        return;
      }
      const index = dismissButtonIndex(request);
      if (index !== null) press(id, index);
    },

    /** Drops every dialog without running a handler. For tests. */
    reset(): void {
      queue = [];
      notify();
    },
  };
}

/** The app's one queue, drawn by `<DialogHost>` in the root layout. */
export const dialogStore = createDialogStore();

/** Shows a dialog in the app's style. Same arguments as `Alert.alert`, plus options. */
export const showDialog = dialogStore.alert.bind(dialogStore);

/** Shows a list of actions in a bottom sheet. */
export const showActionSheet = dialogStore.actionSheet.bind(dialogStore);
