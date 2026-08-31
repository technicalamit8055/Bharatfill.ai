/**
 * jsdom shims for the two browser primitives file attachment needs.
 *
 * Chrome gives a content script `DataTransfer` and an assignable `input.files`. jsdom has
 * neither: there is no `DataTransfer` at all, and its `files` setter demands a genuine
 * `FileList`, which cannot be constructed outside a browser.
 *
 * Stubbing those two leaves everything around them under test: the safety re-checks, the
 * `accept` gate, the `File` that actually gets built, and the events the page receives. The one
 * thing a stub cannot prove is that Chrome accepts the assignment — that is covered by the
 * manual check in docs/EXTENSION.md §6a.
 */

export type FilesStore = WeakMap<HTMLInputElement, readonly File[]>;

export function installFileApis(): { restore: () => void; store: FilesStore } {
  const store: FilesStore = new WeakMap();
  const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');

  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    get(this: HTMLInputElement) {
      return store.get(this) ?? null;
    },
    set(this: HTMLInputElement, value: readonly File[] | null) {
      store.set(this, value ? Array.from(value) : []);
    },
  });

  class StubDataTransfer {
    files: File[] = [];
    items = {
      add: (file: File) => {
        this.files.push(file);
      },
    };
  }
  globalThis.DataTransfer = StubDataTransfer as unknown as typeof DataTransfer;

  return {
    store,
    restore: () => {
      if (original) Object.defineProperty(HTMLInputElement.prototype, 'files', original);
      delete (globalThis as { DataTransfer?: unknown }).DataTransfer;
    },
  };
}
