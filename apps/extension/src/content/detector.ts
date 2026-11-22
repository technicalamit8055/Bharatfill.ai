/**
 * Field detection.
 * Master spec §14.1, §14.2; docs/FORM_ENGINE.md §2, docs/EXTENSION.md §6.
 *
 * Walks the page and produces metadata for every field an operator might want filled.
 *
 * The contract that matters: **this function never reads a field's value.** `hasValue` records
 * whether something is there; what it is stays on the page. The one exception is `<select>`
 * option lists, which are part of the form's structure rather than the customer's data and are
 * needed to match "Bihar" to the right `<option>`.
 */

import type { DetectedField, FieldOption, PageContext } from '@assistigo/form-engine/types';
import {
  mergeUploadConstraints,
  parseUploadConstraints,
  type UploadConstraints,
} from '@assistigo/form-engine/constraints';

const NEARBY_TEXT_LIMIT = 120;
const MAX_FIELDS = 500;
const MAX_OPTIONS = 500;

/**
 * Per-string caps from `detectedFieldSchema`. `POST /api/forms/map` rejects the whole payload
 * when any one string is over its limit, so a single long declaration label (SSC's registration
 * form wraps a paragraph-length "I hereby declare…" in a <label>) used to fail mapping for every
 * field on the page. Everything leaving the detector is cut to fit instead.
 */
const LIMITS = {
  inputType: 40,
  name: 200,
  id: 200,
  placeholder: 200,
  label: 300,
  sectionHeading: 200,
  option: 300,
  pattern: 300,
  accept: 200,
} as const;

/** Input types that are form plumbing rather than something an operator fills. */
const STRUCTURAL_INPUT_TYPES: readonly string[] = ['hidden', 'submit', 'reset', 'button', 'image'];

function clip(value: string | null, max: number): string | null {
  return value === null ? null : value.slice(0, max);
}

/** Pages the extension must never run on (§19.6). */
const BLOCKED_PROTOCOLS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'view-source:',
  'file:',
];
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

export function isBlockedPage(location: { protocol: string; hostname: string }): boolean {
  if (BLOCKED_PROTOCOLS.includes(location.protocol)) return true;
  return BLOCKED_HOSTS.includes(location.hostname);
}

/** FNV-1a. Short, stable, and good enough to identify a field across two detections. */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
}

/**
 * A field's identity.
 *
 * Built from the form it belongs to plus its own naming, with the position as a last resort.
 * Name and id are preferred because they survive a page re-render; position does not, but a
 * field with neither is otherwise unaddressable.
 */
export function fieldSignature(
  element: Element,
  formIndex: number,
  fieldIndex: number,
  frame = 0,
): string {
  const name = element.getAttribute('name') ?? '';
  const id = element.getAttribute('id') ?? '';
  const type = element.getAttribute('type') ?? element.tagName.toLowerCase();
  const stable = name || id;
  const parts = stable
    ? [frame, formIndex, type, stable]
    : [frame, formIndex, type, `idx${fieldIndex}`];
  return hash(parts.join('|'));
}

/*
 * Tag checks rather than `instanceof`: a same-origin frame's elements belong to another realm,
 * so `isInputElement(element)` is false for every field inside an iframe.
 */
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

export function isHtmlElement(element: Element): element is HTMLElement {
  return element.namespaceURI === XHTML_NAMESPACE;
}

export function isInputElement(element: Element): element is HTMLInputElement {
  return isHtmlElement(element) && element.localName === 'input';
}

export function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
  return isHtmlElement(element) && element.localName === 'textarea';
}

export function isSelectElement(element: Element): element is HTMLSelectElement {
  return isHtmlElement(element) && element.localName === 'select';
}

function styleOf(element: Element): CSSStyleDeclaration | null {
  const view = element.ownerDocument?.defaultView;
  if (!view) return null;
  try {
    return view.getComputedStyle(element);
  } catch {
    return null;
  }
}

/**
 * jsdom never lays a page out — `getClientRects()` and `offsetParent` come back empty for every
 * element regardless of actual visibility — so a layout-based check has to be skipped there
 * rather than silently hiding an entire test page. jsdom's own user agent string is the
 * documented way to tell the two environments apart.
 */
function isJsdomDocument(doc: Document | null | undefined): boolean {
  return (doc?.defaultView?.navigator.userAgent ?? '').includes('jsdom');
}

/**
 * Visibility, decided from computed style first and (in a real browser) confirmed against layout.
 *
 * Layout-based checks (`offsetParent`, client rects) are more accurate in a real browser but
 * meaningless in a headless test environment, and a field wrongly judged invisible is silently
 * dropped from the operator's review list. Style walking behaves identically in both, so it stays
 * the first pass; the layout check only runs where layout is real, catching what style walking
 * misses — a portal collapsing a row via an ancestor several levels above this walk's depth
 * limit, for instance (RTPS Bihar's hidden representative-authorization and internal uploader
 * widgets, which otherwise surface as phantom document-attachment cards).
 */
export function isElementVisible(element: Element): boolean {
  if (isHtmlElement(element) && element.hidden) return false;
  if (element.getAttribute('type') === 'hidden') return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 50) {
    const style = styleOf(current);
    if (style) {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      // opacity: 0 on parent containers hides fields, but custom styled inputs (radios/checkboxes)
      // often set opacity: 0 directly on the input element itself while leaving the wrapper visible.
      if (
        style.opacity === '0' &&
        (depth > 0 || !['radio', 'checkbox', 'file'].includes(element.getAttribute('type') ?? ''))
      ) {
        return false;
      }
    }
    current = current.parentElement;
    depth += 1;
  }

  if (!isJsdomDocument(element.ownerDocument) && element.getClientRects().length === 0) {
    return false;
  }

  return true;
}

/** What a portal writes on the button that opens a hidden file picker. */
const FILE_TRIGGER_WORDS = /upload|browse|choose|attach|select\s*file|add\s*file|अपलोड|चुनें|संलग्न/i;
const FILE_TRIGGER_SELECTOR = 'button, [role="button"], input[type="button"], a';
/** How far up from a hidden file input to look for its button: its wrapper, and the wrapper's. */
const FILE_TRIGGER_DEPTH = 2;

/**
 * Whether a file input the page hides is still one the operator can reach.
 *
 * Styled upload widgets — most state portals' "Browse" buttons — set the real
 * `<input type="file">` to `display: none` and open its picker from a visible `<label for>` or a
 * button beside it. That box is as real as any other; dropping it as invisible meant no
 * suggestion card for the one upload the page actually asks for. It counts when, and only when,
 * something that opens it is itself visible:
 *
 * - a `<label>` for it (explicit `for`, or wrapping) with real text, or
 * - a button-like control whose text says upload/browse/choose, inside the input's own wrapper
 *   (or the wrapper's parent) — and only while that wrapper holds no other file input, so one
 *   box's Browse button never vouches for its neighbour.
 *
 * The RTPS Bihar hidden widgets that motivated `isElementVisible`'s ancestor walk are unaffected:
 * their whole row is collapsed, so their buttons and labels fail the same visibility check.
 */
function hasVisibleFileTrigger(element: Element): boolean {
  // Tag check rather than `instanceof`: a same-origin frame's elements belong to another realm.
  if (element.tagName.toLowerCase() !== 'input') return false;

  for (const label of Array.from((element as HTMLInputElement).labels ?? [])) {
    const text = textOf(label);
    if (text && isMeaningfulLabel(text) && isElementVisible(label)) return true;
  }

  let container = element.parentElement;
  for (let depth = 0; container && depth < FILE_TRIGGER_DEPTH; depth += 1) {
    const fileInputs = Array.from(container.querySelectorAll('input')).filter(
      (input) => (input.getAttribute('type') ?? '').toLowerCase() === 'file',
    );
    if (fileInputs.length > 1) return false;

    for (const trigger of Array.from(container.querySelectorAll(FILE_TRIGGER_SELECTOR))) {
      const text =
        textOf(trigger) ?? trigger.getAttribute('aria-label') ?? trigger.getAttribute('value') ?? '';
      if (FILE_TRIGGER_WORDS.test(text) && isElementVisible(trigger)) return true;
    }
    container = container.parentElement;
  }

  return false;
}

function textOf(node: Element | null | undefined): string | null {
  const text = node?.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

/**
 * True when text carries at least one letter or digit (any script) rather than only punctuation
 * or whitespace. A ServicePlus template row that leaves its label cell empty renders as "." or
 * ".." once trimmed, and neither is a label an operator can use to tell one upload box from
 * another — treating it as one produces a phantom document-attachment card instead of no card.
 */
function isMeaningfulLabel(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Label resolution, in the order that gives the most reliable answer first */
export function resolveLabel(element: Element): string | null {
  const doc = element.ownerDocument;
  const id = element.getAttribute('id');

  if (id) {
    const escaped = id.replace(/["\\]/g, '\\$&');
    const explicit = doc?.querySelector(`label[for="${escaped}"]`);
    const text = textOf(explicit);
    if (text && isMeaningfulLabel(text)) return text;
  }

  const wrapping = element.closest('label');
  if (wrapping) {
    const text = textOf(wrapping);
    if (text && isMeaningfulLabel(text)) return text;
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy && doc) {
    const parts = labelledBy
      .split(/\s+/)
      .map((refId) => textOf(doc.getElementById(refId)))
      .filter((text): text is string => Boolean(text && isMeaningfulLabel(text)));
    if (parts.length > 0) return parts.join(' ');
  }

  const rowLabel = resolveRowContext(element);
  if (rowLabel) return rowLabel;

  let sibling = element.previousElementSibling;
  let steps = 0;
  while (sibling && steps < 3) {
    const text = textOf(sibling);
    if (text && text.length <= 120 && isMeaningfulLabel(text)) return text;
    sibling = sibling.previousElementSibling;
    steps += 1;
  }

  return null;
}

/** An element's visible-ish text, minus option lists and inline code. */
function structuralTextOf(element: Element): string | null {
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll('option, script, style'))) {
    node.remove();
  }
  return textOf(clone);
}

/** A cell that only numbers or flags its row: "1", "2.", "(a)", "iv)". */
const ROW_MARKER = /^\(?(?:\d{1,3}|[a-z]|[ivx]{1,4})[.)]?$/i;

/** Cells of a label run, and their combined length, before the run stops being a label. */
const ROW_CONTEXT_CELLS = 2;
const ROW_CONTEXT_LIMIT = 120;

function holdsField(element: Element): boolean {
  return Array.from(element.querySelectorAll(FIELD_SELECTOR)).some(
    (field) => !STRUCTURAL_INPUT_TYPES.includes(inputTypeOf(field)),
  );
}

/**
 * The label cells that lead up to a field in a table row.
 *
 * Older government portals (ServicePlus, most state upload pages) lay a form out as a table, and
 * the cell immediately before a field is often not its label: an upload row reads
 * `1 | Caste Certificate | Mandatory | [file]`, so the previous cell alone made the label
 * "Mandatory". This walks back from the field's cell, skipping serial-number cells, and stops at
 * the first cell that holds another field — in `Name | [input] | Father's name | [input]` the
 * second field's run is "Father's name", not both labels.
 *
 * Only cells *before* the field are read. The cells after an upload box are where a portal shows
 * what was uploaded — "aadhaar_front.jpg uploaded" — and a filename is customer data, not form
 * structure. The run is also capped at two cells, so a read-only review row cannot pull a line
 * of displayed details in behind its label.
 */
function resolveRowContext(element: Element): string | null {
  const cell = element.closest('td, th');
  if (!cell || cell.parentElement?.tagName.toLowerCase() !== 'tr') return null;

  const parts: string[] = [];
  let length = 0;
  for (
    let sibling = cell.previousElementSibling;
    sibling && parts.length < ROW_CONTEXT_CELLS;
    sibling = sibling.previousElementSibling
  ) {
    if (holdsField(sibling)) break;
    const text = structuralTextOf(sibling);
    if (!text || !isMeaningfulLabel(text) || ROW_MARKER.test(text)) continue;
    if (length + text.length > ROW_CONTEXT_LIMIT) break;
    parts.unshift(text);
    length += text.length + 1;
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * The text around a field: its parent's, led by its table row's label run when it sits in one.
 * The row comes first because it is the part a clipped string must keep — a file input's own
 * cell often says nothing more than "Choose file".
 */
function resolveNearbyText(element: Element): string | null {
  const parentText = element.parentElement ? structuralTextOf(element.parentElement) : null;
  const rowText = resolveRowContext(element);

  const parts = [rowText];
  if (parentText && !(rowText && rowText.includes(parentText))) parts.push(parentText);
  const text = parts.filter(Boolean).join(' ');
  return text ? text.slice(0, NEARBY_TEXT_LIMIT) : null;
}

function resolveSectionHeading(element: Element): string | null {
  let current: Element | null = element.parentElement;
  let depth = 0;
  while (current && depth < 8) {
    const heading = current.querySelector('h1, h2, h3, h4, legend');
    const text = textOf(heading);
    if (text) return text.slice(0, 200);
    current = current.parentElement;
    depth += 1;
  }
  return null;
}

/**
 * Wrapper text longer than this is a form section, not a hint about one box. 800 because a
 * single box's own instruction panel can run long: SSC's signature block (label, five bullet
 * points, the button and its error line) is about 650 characters. A wrapper holding a second
 * upload box is still cut off by `fileInputCount`, whatever its length.
 */
const CONSTRAINT_TEXT_LIMIT = 800;
/** How far up from a file input to read hint text: its wrapper, and two more levels. */
const CONSTRAINT_WRAPPER_DEPTH = 3;

/**
 * An element's text with a space at every node boundary, minus option lists and inline code.
 *
 * `textContent` glues adjacent elements together, so minified markup like
 * `<label>Signature</label><span>max 20 KB</span>` reads "Signaturemax 20 KB" and the cue word
 * is lost. Labels can live with that; a constraint parser that keys on "max" cannot.
 */
function spacedTextOf(element: Element | null | undefined): string | null {
  if (!element) return null;
  const parts: string[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) parts.push(child.textContent ?? '');
      else if (child.nodeType === 1) {
        const tag = (child as Element).tagName.toLowerCase();
        if (tag !== 'option' && tag !== 'script' && tag !== 'style') walk(child);
      }
    }
  };
  walk(element);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function fileInputCount(container: Element): number {
  return Array.from(container.querySelectorAll('input')).filter(
    (input) => (input.getAttribute('type') ?? '').toLowerCase() === 'file',
  ).length;
}

/** The header cell over a body cell's column, when the table has one. */
function columnHeaderOf(cell: Element): string | null {
  const table = cell.closest('table') as HTMLTableElement | null;
  const index = (cell as HTMLTableCellElement).cellIndex;
  if (!table || typeof index !== 'number' || index < 0) return null;
  const headerRow = table.tHead?.rows[0] ?? table.rows[0];
  if (!headerRow || headerRow === cell.parentElement) return null;
  const header = headerRow.cells[index];
  if (!header || (header.tagName.toLowerCase() !== 'th' && !table.tHead)) return null;
  return spacedTextOf(header);
}

/**
 * The text a page writes about one upload box, strongest first: its label, the hints it points
 * at, its wrapper while the wrapper is about this box alone, and its table row cell by cell —
 * each cell read under its column header, so a "Max Size (KB)" column and a "200" cell become
 * one statement.
 *
 * Unlike `resolveRowContext`, this reads cells after the box too, because that is where portals
 * print "Max 200 KB, JPG only". It is safe to only because nothing here leaves the page: every
 * string is handed straight to `parseUploadConstraints`, and only its numbers and format tokens
 * are kept. The uploaded filename shown in the same row is read and dropped.
 */
function uploadConstraintSources(element: Element): string[] {
  const doc = element.ownerDocument;
  const sources: (string | null)[] = [
    resolveLabel(element),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
  ];

  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy && doc) {
    for (const refId of describedBy.split(/\s+/)) {
      sources.push(spacedTextOf(doc.getElementById(refId)));
    }
  }

  let container = element.parentElement;
  for (let depth = 0; container && depth < CONSTRAINT_WRAPPER_DEPTH; depth += 1) {
    const tag = container.tagName.toLowerCase();
    if (tag === 'tr' || tag === 'tbody' || tag === 'table' || tag === 'form' || tag === 'body') break;
    if (fileInputCount(container) > 1) break;
    const text = spacedTextOf(container);
    if (text && text.length > CONSTRAINT_TEXT_LIMIT) break;
    sources.push(text);
    container = container.parentElement;
  }

  const row = element.closest('tr');
  if (row && fileInputCount(row) === 1) {
    for (const cell of Array.from((row as HTMLTableRowElement).cells)) {
      const holdsOtherField = Array.from(cell.querySelectorAll(FIELD_SELECTOR)).some(
        (field) => field !== element && !STRUCTURAL_INPUT_TYPES.includes(inputTypeOf(field)),
      );
      if (holdsOtherField) continue;
      const text = spacedTextOf(cell);
      if (!text || text.length > CONSTRAINT_TEXT_LIMIT) continue;
      const header = columnHeaderOf(cell);
      sources.push(header ? `${header} ${text}` : text);
    }
  }

  return sources.filter((source): source is string => Boolean(source));
}

/** What the page says this file input will take. Only the parsed result is ever returned. */
function resolveUploadConstraints(element: Element): UploadConstraints | null {
  return mergeUploadConstraints(uploadConstraintSources(element).map(parseUploadConstraints));
}

/**
 * Where a custom dropdown keeps its choices. There is no standard, so this is the union of the
 * shapes component libraries actually ship: an ARIA option, a plain list item, or a div tagged
 * with the value it stands for.
 */
export const CUSTOM_OPTION_SELECTOR =
  '[role="option"], option, li, [data-value], [data-option]';

/**
 * The option elements of a custom dropdown, inline or in the popup it points at.
 *
 * Shared with the filler so detection and filling always look in the same places — an option
 * the operator was shown but the filler cannot find reads as a silent failure.
 */
export function collectCustomOptionElements(element: Element): Element[] {
  const doc = element.ownerDocument;
  const nodes = new Set<Element>(Array.from(element.querySelectorAll(CUSTOM_OPTION_SELECTOR)));

  const controlsId = element.getAttribute('aria-controls') ?? element.getAttribute('aria-owns');
  if (controlsId && doc) {
    const container = doc.getElementById(controlsId);
    if (container) {
      // A popup can also be a descendant, so this deliberately unions rather than appends.
      for (const node of Array.from(container.querySelectorAll(CUSTOM_OPTION_SELECTOR))) {
        nodes.add(node);
      }
    }
  }

  return Array.from(nodes);
}

function collectOptions(element: Element): FieldOption[] | null {
  const tag = element.tagName.toLowerCase();
  const doc = element.ownerDocument;

  // Standard <select>
  if (tag === 'select') {
    const options = Array.from(element.querySelectorAll('option')).slice(0, MAX_OPTIONS);
    return options.map((option) => ({
      value: (option.getAttribute('value') ?? option.textContent?.trim() ?? '').slice(
        0,
        LIMITS.option,
      ),
      label: (option.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.option),
    }));
  }

  // <input list="datalist-id">
  const listId = element.getAttribute('list');
  if (listId && doc) {
    const datalist = doc.getElementById(listId);
    if (datalist) {
      const options = Array.from(datalist.querySelectorAll('option')).slice(0, MAX_OPTIONS);
      if (options.length > 0) {
        return options.map((option) => ({
          value: (option.getAttribute('value') ?? option.textContent?.trim() ?? '').slice(
            0,
            LIMITS.option,
          ),
          label: (option.textContent ?? option.getAttribute('value') ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, LIMITS.option),
        }));
      }
    }
  }

  // Custom ARIA dropdown / combobox / listbox
  const role = element.getAttribute('role')?.toLowerCase();
  if (role === 'combobox' || role === 'listbox' || role === 'select' || element.hasAttribute('aria-haspopup')) {
    const optionNodes = collectCustomOptionElements(element);

    if (optionNodes.length > 0) {
      return optionNodes.slice(0, MAX_OPTIONS).map((opt) => {
        const val =
          opt.getAttribute('data-value') ??
          opt.getAttribute('data-option') ??
          opt.getAttribute('value') ??
          opt.textContent?.trim() ??
          '';
        const lbl = (opt.textContent ?? val).replace(/\s+/g, ' ').trim().slice(0, LIMITS.option);
        return { value: val.slice(0, LIMITS.option), label: lbl };
      });
    }
  }

  return null;
}

/**
 * Types the browser hands a value to whether or not anyone touched them: a slider reports the
 * midpoint of its bounds, a colour swatch reports #000000. Reading those back as "already
 * filled" would make every slider and colour picker permanently unfillable, so for these the
 * question is whether the *page* set a value, not what the widget currently reads.
 */
const BROWSER_DEFAULTED_TYPES = ['range', 'color'] as const;

function hasValue(element: Element): boolean {
  const role = element.getAttribute('role')?.toLowerCase();

  if (isInputElement(element)) {
    if (element.type === 'checkbox' || element.type === 'radio') return element.checked;
    if (element.type === 'file') return element.files !== null && element.files.length > 0;
    if ((BROWSER_DEFAULTED_TYPES as readonly string[]).includes(element.type)) {
      return (element.getAttribute('value') ?? '').trim() !== '';
    }
    return element.value.trim() !== '';
  }
  if (isTextAreaElement(element)) return element.value.trim() !== '';
  if (isSelectElement(element)) {
    // A multi-select has no placeholder first option to discount; nothing selected is the empty state.
    if (element.multiple) return element.selectedOptions.length > 0;
    return element.value.trim() !== '' && element.selectedIndex > 0;
  }
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
    return (element.textContent ?? '').trim() !== '';
  }

  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked !== null) return ariaChecked === 'true';

  const ariaValuenow = element.getAttribute('aria-valuenow');
  if (ariaValuenow !== null) {
    // ARIA requires a slider to publish its position, exactly like <input type="range"> above.
    if (role === 'slider') return false;
    return ariaValuenow.trim() !== '';
  }

  const valAttr = element.getAttribute('value');
  if (valAttr !== null && valAttr.trim() !== '') return true;

  return false;
}

function tagNameOf(element: Element): DetectedField['tagName'] {
  const tag = element.tagName.toLowerCase();
  if (tag === 'select' || tag === 'textarea') return tag;
  const role = element.getAttribute('role')?.toLowerCase();
  if (role === 'combobox' || role === 'listbox' || role === 'select') return 'select';
  return 'input';
}

function inputTypeOf(element: Element): string {
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
    return 'contenteditable';
  }
  const role = element.getAttribute('role')?.toLowerCase();
  if (role) {
    if (role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
    if (role === 'combobox') return 'combobox';
    if (role === 'listbox' || role === 'select') return 'select-one';
    if (role === 'switch') return 'checkbox';
    if (role === 'slider') return 'range';
    if (role === 'spinbutton') return 'number';
    if (role === 'textbox') return 'text';
  }
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') {
    return (element as HTMLSelectElement).multiple ? 'select-multiple' : 'select-one';
  }
  return (element.getAttribute('type') ?? 'text').toLowerCase();
}

/**
 * Everything that could be a field: native controls, rich-text hosts, and the ARIA roles a
 * component library uses when it reimplements a control out of divs.
 *
 * Exported because a field's signature is derived from its position in *this* selector's result
 * list. The filler recomputes signatures against the live DOM, so if it queried a different set
 * of elements every signature would resolve to the wrong field.
 */
export const FIELD_SELECTOR =
  'input, select, textarea, [contenteditable="true"], [contenteditable=""], [role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], [role="select"], [role="textbox"], [role="switch"], [role="slider"], [role="spinbutton"]';

function querySelectorAllDeep(root: ParentNode, selector: string): Element[] {
  const elements: Element[] = Array.from(root.querySelectorAll(selector));
  try {
    const children = root.querySelectorAll('*');
    for (const child of Array.from(children)) {
      if (child.shadowRoot) {
        elements.push(...querySelectorAllDeep(child.shadowRoot, selector));
      }
    }
  } catch {
    // Edge cases in legacy browsers or strict security contexts.
  }
  return elements;
}

export function detectFields(doc: Document, frame = 0): DetectedField[] {
  const forms = Array.from(doc.forms);
  const formOf = new Map<Element, number>();
  forms.forEach((form, index) => {
    for (const element of Array.from(form.querySelectorAll(FIELD_SELECTOR))) {
      formOf.set(element, index);
    }
  });

  const elements = querySelectorAllDeep(doc, FIELD_SELECTOR).slice(0, MAX_FIELDS);
  const fields: DetectedField[] = [];

  elements.forEach((element, index) => {
    const inputType = inputTypeOf(element);

    // Structural inputs are not customer data and only add noise to the review list.
    if (STRUCTURAL_INPUT_TYPES.includes(inputType)) return;

    // Listbox inside a combobox is the option container, not a separate field.
    const role = element.getAttribute('role')?.toLowerCase();
    if (role === 'listbox' && element.closest('[role="combobox"]')) return;

    const formIndex = formOf.get(element) ?? -1;

    fields.push({
      signature: fieldSignature(element, formIndex, index, frame),
      tagName: tagNameOf(element),
      inputType: inputType.slice(0, LIMITS.inputType),
      name: clip(element.getAttribute('name'), LIMITS.name),
      id: clip(element.getAttribute('id'), LIMITS.id),
      placeholder: clip(element.getAttribute('placeholder'), LIMITS.placeholder),
      labelText: clip(resolveLabel(element), LIMITS.label),
      ariaLabel: clip(element.getAttribute('aria-label'), LIMITS.label),
      nearbyText: resolveNearbyText(element),
      sectionHeading: clip(resolveSectionHeading(element), LIMITS.sectionHeading),
      options: collectOptions(element),
      required:
        element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      maxLength: (() => {
        const raw = element.getAttribute('maxlength');
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      })(),
      pattern: clip(element.getAttribute('pattern'), LIMITS.pattern),
      accept: clip(element.getAttribute('accept'), LIMITS.accept),
      uploadConstraints: inputType === 'file' ? resolveUploadConstraints(element) : null,
      hasValue: hasValue(element),
      visible:
        isElementVisible(element) || (inputType === 'file' && hasVisibleFileTrigger(element)),
      disabled: element.hasAttribute('disabled'),
      readOnly: element.hasAttribute('readonly'),
      frame,
      order: fields.length,
    });
  });

  return fields;
}

/**
 * Page context. Origin and path only — a query string can carry a customer's details, and this
 * value is stored in `fill_sessions` (§18.2).
 */
export function collectPageContext(doc: Document): PageContext {
  const location = doc.defaultView?.location;
  let blockedFrames = 0;

  const frames = doc.querySelectorAll('iframe');
  for (const frame of Array.from(frames)) {
    try {
      // Reading contentDocument on a cross-origin frame throws; that is the test.
      if (!(frame as HTMLIFrameElement).contentDocument) blockedFrames += 1;
    } catch {
      blockedFrames += 1;
    }
  }

  return {
    origin: (location?.origin ?? '').slice(0, 300),
    path: (location?.pathname ?? '').slice(0, 500),
    title: doc.title ? doc.title.slice(0, 300) : null,
    blockedFrames,
  };
}

/** Same-origin frames are walked; cross-origin ones are reported, never forced. */
export function detectFieldsInFrames(doc: Document): DetectedField[] {
  const fields = detectFields(doc, 0);
  const frames = Array.from(doc.querySelectorAll('iframe'));

  frames.forEach((frame, index) => {
    try {
      const inner = (frame as HTMLIFrameElement).contentDocument;
      if (inner) fields.push(...detectFields(inner, index + 1));
    } catch {
      // Cross-origin. Counted in collectPageContext().blockedFrames.
    }
  });

  return fields.slice(0, MAX_FIELDS).map((field, order) => ({ ...field, order }));
}
