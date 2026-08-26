/**
 * Wallet-card layout and identifier redaction geometry.
 *
 * Two jobs an operator does every day:
 *
 *   1. Print a customer's Aadhaar, PAN, voter ID or Ayushman card at wallet size — on a PVC card
 *      blank, or 2-up / 4-up on 4 × 6 photo paper to be cut and laminated.
 *   2. Mask the identifier before that print or that upload leaves the shop.
 *
 * The masking is not decoration. UIDAI's own masked-Aadhaar format shows only the last four
 * digits, the product already stores only `customer.aadhaar_last4`
 * (docs/DEVELOPMENT_RULES.md rule 5), and a derivative that reproduces all twelve digits would
 * make a printed artefact more revealing than the profile it came from. So the redaction box is
 * part of the layout, and `aadhaarMaskDefault` puts it where the first eight digits are.
 *
 * Pure geometry. The drawing lives in `src/browser/image.ts`.
 */

import type { Rect, Size } from './types';
import { mmToPx } from './units';

/** ISO/IEC 7810 ID-1 — the size of every bank card, PAN card and Aadhaar PVC card. */
export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 53.98;
export const CR80_ASPECT = CR80_WIDTH_MM / CR80_HEIGHT_MM;

export const CARD_PRINT_DPI = 300;

export type CardSide = 'front' | 'back';

export type CardLayoutInput = {
  /** Sheet to print on, in millimetres. */
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** How many cards on the sheet. Front and back each count as one. */
  count: number;
  gapMm?: number;
  marginMm?: number;
  dpi?: number;
};

export type CardLayout = {
  sheetWidthPx: number;
  sheetHeightPx: number;
  cardWidthPx: number;
  cardHeightPx: number;
  slots: Rect[];
  capacity: number;
  dpi: number;
};

/**
 * Card slots on a sheet, centred, in reading order.
 *
 * Cards are laid out in whichever orientation fits more — on 4 × 6 inch paper two cards sit
 * side by side across the short edge only if turned, which is exactly the front/back pair an
 * operator wants to cut and laminate together.
 */
export function planCardSheet(input: CardLayoutInput): CardLayout {
  const {
    sheetWidthMm,
    sheetHeightMm,
    count,
    gapMm = 4,
    marginMm = 4,
    dpi = CARD_PRINT_DPI,
  } = input;

  const usableWidth = Math.max(0, sheetWidthMm - marginMm * 2);
  const usableHeight = Math.max(0, sheetHeightMm - marginMm * 2);

  const fit = (available: number, size: number) =>
    size <= 0 ? 0 : Math.max(0, Math.floor((available + gapMm) / (size + gapMm)));

  const upright = {
    columns: fit(usableWidth, CR80_WIDTH_MM),
    rows: fit(usableHeight, CR80_HEIGHT_MM),
    cardWidthMm: CR80_WIDTH_MM,
    cardHeightMm: CR80_HEIGHT_MM,
  };
  const turned = {
    columns: fit(usableWidth, CR80_HEIGHT_MM),
    rows: fit(usableHeight, CR80_WIDTH_MM),
    cardWidthMm: CR80_HEIGHT_MM,
    cardHeightMm: CR80_WIDTH_MM,
  };

  const grid = turned.columns * turned.rows > upright.columns * upright.rows ? turned : upright;
  const capacity = grid.columns * grid.rows;
  const placed = Math.min(capacity, Math.max(0, count));
  const usedRows = grid.columns > 0 ? Math.ceil(placed / grid.columns) : 0;

  const blockHeightMm = usedRows > 0 ? usedRows * grid.cardHeightMm + (usedRows - 1) * gapMm : 0;
  const originYMm = (sheetHeightMm - blockHeightMm) / 2;

  const slots: Rect[] = [];
  for (let index = 0; index < placed; index += 1) {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const rowCount = row === usedRows - 1 ? placed - row * grid.columns : grid.columns;
    const rowWidthMm = rowCount * grid.cardWidthMm + (rowCount - 1) * gapMm;
    const rowOriginXMm = (sheetWidthMm - rowWidthMm) / 2;

    slots.push({
      x: mmToPx(rowOriginXMm + column * (grid.cardWidthMm + gapMm), dpi),
      y: mmToPx(originYMm + row * (grid.cardHeightMm + gapMm), dpi),
      width: mmToPx(grid.cardWidthMm, dpi),
      height: mmToPx(grid.cardHeightMm, dpi),
    });
  }

  return {
    sheetWidthPx: mmToPx(sheetWidthMm, dpi),
    sheetHeightPx: mmToPx(sheetHeightMm, dpi),
    cardWidthPx: mmToPx(grid.cardWidthMm, dpi),
    cardHeightPx: mmToPx(grid.cardHeightMm, dpi),
    slots,
    capacity,
    dpi,
  };
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export const REDACTION_STYLES = ['solid', 'crosses'] as const;
export type RedactionStyle = (typeof REDACTION_STYLES)[number];

export type RedactionBox = Rect & {
  style: RedactionStyle;
  /** Set on the box the tool proposed, so the UI can label it "suggested". */
  suggested?: boolean;
};

/**
 * A starting mask over the first eight digits of an Aadhaar number, as a fraction of the card.
 *
 * These proportions come from the printed layout of an Aadhaar card: the number sits on the
 * lower third, centred, in a wide short band. They are a *starting position the operator drags*,
 * never an automatic redaction — the tool does not read the card, so it cannot know where the
 * number is on a crooked phone photo, and a mask that missed by 3 mm while claiming to have
 * masked would be worse than no mask at all.
 *
 * `null` when the crop is not card-shaped, because then these fractions mean nothing.
 */
export function aadhaarMaskDefault(card: Size): RedactionBox | null {
  const aspect = card.width / card.height;
  // Anything between 4:3 and 2:1 is plausibly a card; a portrait crop is not.
  if (!Number.isFinite(aspect) || aspect < 1.3 || aspect > 2.2) return null;

  return {
    // The number band starts about a fifth in from the left and runs to about two-thirds across;
    // the last four digits sit to the right of that and are deliberately left visible.
    x: Math.round(card.width * 0.2),
    y: Math.round(card.height * 0.66),
    width: Math.round(card.width * 0.42),
    height: Math.round(card.height * 0.14),
    style: 'solid',
    suggested: true,
  };
}

/**
 * True when a mask covers enough of the card to be a real redaction rather than a stray click.
 *
 * Used to gate saving an identity-card derivative to the server. A 4 × 4 px box dropped in a
 * corner should not let the UI claim the file is masked.
 */
export function isMeaningfulRedaction(box: Rect, card: Size): boolean {
  if (card.width <= 0 || card.height <= 0) return false;
  const areaShare = (box.width * box.height) / (card.width * card.height);
  return box.width >= card.width * 0.1 && box.height >= card.height * 0.03 && areaShare >= 0.005;
}

/**
 * Document classes whose derivatives must carry a redaction before they may be stored.
 *
 * Matches `HIGH_SENSITIVITY_DOCUMENT_TYPES` in @assistigo/core: the classes that carry an
 * identity number on their face.
 */
export const REDACTION_REQUIRED_DOCUMENT_TYPES = ['aadhaar_like'] as const;

export function redactionRequiredFor(documentType: string | null | undefined): boolean {
  return (
    typeof documentType === 'string' &&
    (REDACTION_REQUIRED_DOCUMENT_TYPES as readonly string[]).includes(documentType)
  );
}
