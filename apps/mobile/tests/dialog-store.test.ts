/**
 * The app's popup queue (`lib/dialog/dialog-store.ts`): button layout, what the back button
 * does, one dialog at a time, and the copy the dialog host and the Vault menus render.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  arrangeButtons,
  createDialogStore,
  dismissButtonIndex,
  type AlertRequest,
  type DialogStore,
} from '../lib/dialog/dialog-store';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

const ok = { text: 'OK' } as const;
const cancel = { text: 'Cancel', style: 'cancel' } as const;
const remove = { text: 'Delete', style: 'destructive' } as const;

function head(store: DialogStore): AlertRequest {
  const current = store.current();
  if (current?.kind !== 'alert') throw new Error('expected an alert on screen');
  return current;
}

describe('arrangeButtons', () => {
  it('fills a lone button as the primary action', () => {
    expect(arrangeButtons([ok])).toEqual({
      direction: 'column',
      buttons: [{ index: 0, button: ok, variant: 'primary' }],
    });
  });

  it('puts Cancel on the left and a destructive action on the right, in red', () => {
    const layout = arrangeButtons([remove, cancel]);
    expect(layout.direction).toBe('row');
    expect(layout.buttons.map(({ index, variant }) => [index, variant])).toEqual([
      [1, 'secondary'],
      [0, 'danger'],
    ]);
  });

  it('emphasises the right-hand default action in a row', () => {
    const settings = { text: 'Open settings' };
    const layout = arrangeButtons([cancel, settings]);
    expect(layout.buttons.map(({ variant }) => variant)).toEqual(['secondary', 'primary']);
  });

  it('stacks three buttons with Cancel last and only the first action filled', () => {
    const a = { text: 'A' };
    const b = { text: 'B' };
    const layout = arrangeButtons([cancel, a, b]);
    expect(layout.direction).toBe('column');
    expect(layout.buttons.map(({ button, variant }) => [button.text, variant])).toEqual([
      ['A', 'primary'],
      ['B', 'secondary'],
      ['Cancel', 'secondary'],
    ]);
  });
});

describe('dialog store', () => {
  let store: DialogStore;

  beforeEach(() => {
    store = createDialogStore();
  });

  it('infers the danger tone from a destructive button, info otherwise', () => {
    store.alert('Delete?', undefined, [cancel, remove]);
    expect(head(store).tone).toBe('danger');
    store.reset();
    store.alert('Heads up', 'Body', [ok]);
    expect(head(store).tone).toBe('info');
    store.reset();
    store.alert('Coming soon', 'Body', [ok], { tone: 'brand' });
    expect(head(store).tone).toBe('brand');
  });

  it('shows one dialog at a time, in the order they were opened', () => {
    store.alert('First', undefined, [ok]);
    store.alert('Second', undefined, [ok]);
    expect(store.size()).toBe(2);
    expect(head(store).title).toBe('First');
    store.press(head(store).id, 0);
    expect(head(store).title).toBe('Second');
  });

  it('opens the same dialog once when it is asked for twice', () => {
    expect(store.alert('Coming soon', 'Body', [ok])).not.toBeNull();
    expect(store.alert('Coming soon', 'Body', [ok])).toBeNull();
    expect(store.size()).toBe(1);
  });

  it('closes the dialog before running the button, so the button can open the next one', () => {
    const order: string[] = [];
    store.alert('Delete?', undefined, [
      cancel,
      {
        ...remove,
        onPress: () => {
          order.push(`handler sees ${store.size()} open`);
          store.alert('Failed', undefined, [ok]);
        },
      },
    ]);
    store.press(head(store).id, 1);
    expect(order).toEqual(['handler sees 0 open']);
    expect(head(store).title).toBe('Failed');
  });

  it('runs a button once when it is tapped twice', () => {
    const onPress = vi.fn();
    store.alert('Delete?', undefined, [cancel, { ...remove, onPress }]);
    const { id } = head(store);
    store.press(id, 1);
    store.press(id, 1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses for a dialog that is not on screen', () => {
    const onPress = vi.fn();
    store.alert('First', undefined, [ok]);
    const secondId = store.alert('Second', undefined, [{ text: 'Go', onPress }]);
    store.press(secondId ?? -1, 0);
    expect(onPress).not.toHaveBeenCalled();
    expect(store.size()).toBe(2);
  });

  it('presses Cancel on back or a tap outside', () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    store.alert('Delete?', undefined, [
      { ...cancel, onPress: onCancel },
      { ...remove, onPress: onDelete },
    ]);
    store.dismiss(head(store).id);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(store.current()).toBeNull();
  });

  it('closes an informational dialog on back', () => {
    store.alert('Saved', 'Body', [ok]);
    store.dismiss(head(store).id);
    expect(store.current()).toBeNull();
  });

  it('keeps a choice without Cancel, or a non-dismissible dialog, open on back', () => {
    store.alert('Pick one', undefined, [{ text: 'A' }, { text: 'B' }]);
    store.dismiss(head(store).id);
    expect(store.size()).toBe(1);
    store.reset();
    store.alert('Must read', undefined, [ok], { dismissible: false });
    expect(dismissButtonIndex(head(store))).toBeNull();
    store.dismiss(head(store).id);
    expect(store.size()).toBe(1);
  });

  it('runs a sheet action after closing the sheet, and Cancel on back', () => {
    const scan = vi.fn(() => expect(store.current()).toBeNull());
    const onCancel = vi.fn();
    const id = store.actionSheet({
      title: 'More options',
      cancelLabel: 'Cancel',
      onCancel,
      actions: [{ key: 'scan', label: 'Scan', onPress: scan }],
    });
    store.choose(id, 'scan');
    expect(scan).toHaveBeenCalledTimes(1);

    const again = store.actionSheet({
      cancelLabel: 'Cancel',
      onCancel,
      actions: [{ key: 'scan', label: 'Scan', onPress: scan }],
    });
    store.dismiss(again);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('tells subscribers when the dialog on screen changes', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.alert('One', undefined, [ok]);
    store.press(head(store).id, 0);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.alert('Two', undefined, [ok]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

const RENDERED_KEYS = [
  'common.close',
  'vault.more',
  'vault.actions.cancel',
  'vault.actions.scan',
  'vault.actions.scanHint',
  'vault.actions.scanMulti',
  'vault.actions.scanMultiHint',
  'vault.actions.star',
  'vault.actions.unstar',
  'vault.actions.delete',
];

describe('dialog copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });
});
