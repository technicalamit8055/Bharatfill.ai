/**
 * Hitting a portal's KB window.
 * Master spec §13.2 — "Compress to target KB".
 *
 * An Indian portal upload box almost never states a single size. It states a *window*: "20 KB to
 * 50 KB". Both ends bite. Over the maximum the upload is refused; under the minimum it is also
 * refused, and that second case is the one every operator hits, because a phone photo cropped to
 * 3.5 × 4.5 cm at quality 0.7 lands at 11 KB when the portal wants at least 20 KB.
 *
 * So this module has two halves:
 *
 *   - `planQualitySearch` / `nextQualityProbe` — the search that walks JPEG quality down until
 *     the file fits under the maximum, plus the downscale ladder for when even quality 0.3 is
 *     too big.
 *   - `padJpegToMinimum` — a valid-JPEG way to reach a *minimum* without re-encoding at a
 *     quality that visibly degrades the photo.
 *
 * All of it is pure: the browser layer calls `canvas.toBlob()` between the probes.
 */

// ---------------------------------------------------------------------------
// Quality search
// ---------------------------------------------------------------------------

export type QualityProbe = { quality: number; scale: number };

export type QualitySearchState = {
  /** Inclusive quality bounds still worth probing. */
  low: number;
  high: number;
  /** Dimension multiplier. Moved along `SCALE_LADDER`, never off it. */
  scale: number;
  /** Best probe so far that satisfied the maximum, or `null` if nothing has fit yet. */
  best: (QualityProbe & { bytes: number }) | null;
  probes: number;
  /**
   * Set once resolution has been given up. After that the search never climbs back, so it
   * cannot oscillate between two rungs and spend its whole budget going nowhere.
   */
  droppedRung: boolean;
};

/**
 * Quality floor. Below this a JPEG of a face is blocky enough that a verifying officer can
 * reasonably call it unclear, so the search drops resolution instead of going lower.
 */
export const MIN_QUALITY = 0.35;
export const MAX_QUALITY = 0.95;

/** Rungs the search steps along, largest first. */
export const SCALE_LADDER = [1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25] as const;

/**
 * Probe budget. Each probe is a real `canvas.toBlob()`, so this is a latency ceiling as much as
 * a loop guard: eight probes on a 4000 × 3000 photo is roughly a second on a service-centre
 * desktop, and eight halvings resolve quality to under 0.005.
 */
export const MAX_PROBES = 8;

/**
 * Overshoot past which quality is not the answer.
 *
 * JPEG quality can buy roughly a 3× size reduction before the image visibly falls apart. Past
 * that, bisecting quality is four wasted probes that all overshoot — so anything more than 2.5×
 * over the limit drops a resolution rung immediately. This is the fix for the case that matters:
 * a 4 MB phone photo into a 50 KB box, which is most of them.
 */
const RUNG_JUMP_RATIO = 2.5;

/**
 * Undershoot past which the search is throwing away resolution it did not need to.
 *
 * Reached only from an opening estimate that guessed too small. Below half the limit at top
 * quality, there is room to climb a rung and hand back a sharper file.
 */
const RUNG_CLIMB_RATIO = 0.5;

export function startQualitySearch(
  options: { startQuality?: number; startScale?: number } = {},
): QualitySearchState {
  const { startQuality = MAX_QUALITY, startScale = 1 } = options;
  return {
    low: MIN_QUALITY,
    high: Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, startQuality)),
    scale: nearestRung(startScale),
    best: null,
    probes: 0,
    droppedRung: false,
  };
}

/** Midpoint of the live bracket — the next quality to actually encode at. */
export function nextQualityProbe(state: QualitySearchState): QualityProbe | null {
  if (state.probes >= MAX_PROBES) return null;
  if (state.high - state.low < 0.02) {
    // The bracket has collapsed. Only worth another probe if nothing has been encoded at this
    // rung yet, which is the case right after a rung change reopened it.
    return state.best?.scale === state.scale
      ? null
      : { quality: state.high, scale: state.scale };
  }
  if (state.probes === 0) return { quality: state.high, scale: state.scale };
  return { quality: Number(((state.low + state.high) / 2).toFixed(3)), scale: state.scale };
}

function rungIndex(scale: number): number {
  return SCALE_LADDER.indexOf(scale as (typeof SCALE_LADDER)[number]);
}

/** Snaps an arbitrary multiplier to the nearest rung at or above it. */
function nearestRung(scale: number): number {
  const floor = SCALE_LADDER.at(-1) as number;
  const clamped = Math.min(1, Math.max(floor, scale));
  return [...SCALE_LADDER].reverse().find((rung) => rung >= clamped) ?? floor;
}

/** Reopens the quality bracket at a new rung. */
function atRung(
  state: QualitySearchState,
  probes: number,
  scale: number,
  droppedRung: boolean,
  best: QualitySearchState['best'],
): QualitySearchState {
  return { ...state, probes, scale, droppedRung, best, low: MIN_QUALITY, high: MAX_QUALITY };
}

/**
 * Folds one probe result back into the search.
 *
 * Under the maximum → remember it, and aim higher, because a portal's window has a minimum too
 * and the largest file that still fits is the one most likely to clear it.
 * Far over the maximum → drop a resolution rung at once.
 * A little over → bisect quality, and drop a rung only once quality is exhausted.
 */
export function recordQualityProbe(
  state: QualitySearchState,
  probe: QualityProbe,
  bytes: number,
  maxBytes: number,
): QualitySearchState {
  const probes = state.probes + 1;
  const rung = rungIndex(state.scale);
  const lowerRung = rung >= 0 ? SCALE_LADDER[rung + 1] : undefined;
  const higherRung = rung > 0 ? SCALE_LADDER[rung - 1] : undefined;

  if (bytes <= maxBytes) {
    const best =
      state.best === null || bytes > state.best.bytes ? { ...probe, bytes } : state.best;

    // Sharper file available: the opening estimate guessed small, and top quality at this rung
    // is still nowhere near the limit.
    if (
      !state.droppedRung &&
      higherRung !== undefined &&
      probe.quality >= state.high - 0.01 &&
      bytes < maxBytes * RUNG_CLIMB_RATIO
    ) {
      return atRung(state, probes, higherRung, false, best);
    }

    return { ...state, probes, best, low: probe.quality };
  }

  const wayOver = bytes > maxBytes * RUNG_JUMP_RATIO;
  const qualityExhausted = probe.quality <= MIN_QUALITY + 0.02;

  if (wayOver || qualityExhausted) {
    if (lowerRung === undefined) {
      // Nothing left to give up. Stop rather than burn the remaining budget.
      return { ...state, probes: MAX_PROBES, high: probe.quality };
    }
    return atRung(state, probes, lowerRung, true, state.best);
  }

  return { ...state, probes, high: probe.quality };
}

/**
 * A single opening guess, so the common case costs fewer probes.
 *
 * JPEG size scales roughly with pixel count at a fixed quality. If a 2 MB source has to become
 * 45 KB, opening at full resolution wastes probes producing files 40× too big. The 1.6 factor
 * biases the guess *high* on purpose: overshooting downward costs the customer image quality,
 * and `recordQualityProbe` can climb back up but only while it has probes left.
 */
export function estimateInitialScale(sourceBytes: number, maxBytes: number): number {
  if (sourceBytes <= 0 || maxBytes <= 0 || sourceBytes <= maxBytes) return 1;
  return nearestRung(Math.sqrt(maxBytes / sourceBytes) * 1.6);
}

// ---------------------------------------------------------------------------
// Reaching a minimum size
// ---------------------------------------------------------------------------

const JPEG_SOI = [0xff, 0xd8];
/** APP0/APP1 and friends are 0xFFE_n_; a comment segment is 0xFFFE. */
const JPEG_COM = [0xff, 0xfe];
/** A JPEG segment's two length bytes cover the length field itself, so payload max is 65533. */
const MAX_COM_PAYLOAD = 65533;

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === JPEG_SOI[0] && bytes[1] === JPEG_SOI[1];
}

/**
 * Grows a JPEG to at least `minBytes` by inserting comment segments after the SOI marker.
 *
 * Why not just re-encode at higher quality: past about quality 0.95 the file barely grows, and a
 * 3.5 × 4.5 cm crop of a phone photo can be physically incapable of reaching 20 KB without
 * upscaling it into mush. A COM segment is part of the JPEG specification, carries no image
 * data, and every decoder — including the ones portals run server-side — skips it. The image the
 * verifying officer sees is byte-identical to the un-padded one.
 *
 * The filler is a fixed ASCII string rather than random bytes so the result is reproducible and
 * a reviewer opening the file in a hex editor can see what it is.
 */
export function padJpegToMinimum(bytes: Uint8Array, minBytes: number): Uint8Array {
  if (!isJpeg(bytes)) return bytes;
  if (bytes.length >= minBytes) return bytes;

  const shortfall = minBytes - bytes.length;
  const segments: Uint8Array[] = [];
  let remaining = shortfall;

  while (remaining > 0) {
    // Each segment costs 4 bytes of framing (marker + length), so the payload has to cover the
    // shortfall *and* its own overhead.
    const payloadSize = Math.min(MAX_COM_PAYLOAD, Math.max(1, remaining - 4));
    const segment = new Uint8Array(payloadSize + 4);
    segment[0] = JPEG_COM[0] as number;
    segment[1] = JPEG_COM[1] as number;
    const length = payloadSize + 2;
    segment[2] = (length >> 8) & 0xff;
    segment[3] = length & 0xff;
    segment.fill(0x20, 4); // spaces
    const marker = 'assistigo:size-padding';
    for (let index = 0; index < marker.length && 4 + index < segment.length; index += 1) {
      segment[4 + index] = marker.charCodeAt(index);
    }
    segments.push(segment);
    remaining -= segment.length;
  }

  const total = bytes.length + segments.reduce((sum, segment) => sum + segment.length, 0);
  const out = new Uint8Array(total);
  out.set(bytes.subarray(0, 2), 0); // SOI
  let offset = 2;
  for (const segment of segments) {
    out.set(segment, offset);
    offset += segment.length;
  }
  out.set(bytes.subarray(2), offset);
  return out;
}

// ---------------------------------------------------------------------------
// Verdicts an operator can act on
// ---------------------------------------------------------------------------

export type SizeVerdict = 'ok' | 'too_small' | 'too_large' | 'unknown';

export function judgeSize(
  bytes: number,
  window: { minBytes?: number; maxBytes?: number },
): SizeVerdict {
  if (window.minBytes === undefined && window.maxBytes === undefined) return 'unknown';
  if (window.maxBytes !== undefined && bytes > window.maxBytes) return 'too_large';
  if (window.minBytes !== undefined && bytes < window.minBytes) return 'too_small';
  return 'ok';
}

/**
 * Where a file sits inside its KB window, 0–1, for the meter under the preview.
 * Returns `null` when the preset states no window to sit inside.
 */
export function sizeWindowPosition(
  bytes: number,
  window: { minBytes?: number; maxBytes?: number },
): number | null {
  const min = window.minBytes ?? 0;
  const max = window.maxBytes;
  if (max === undefined || max <= min) return null;
  return Math.min(1, Math.max(0, (bytes - min) / (max - min)));
}

/** Kilobytes as a portal notice writes them: "48 KB", "1024 KB". */
export function formatKb(bytes: number): string {
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/** "20–50 KB", "max 200 KB", "min 10 KB" — the window as a single readable phrase. */
export function formatSizeWindow(window: { minBytes?: number; maxBytes?: number }): string | null {
  const { minBytes, maxBytes } = window;
  if (minBytes !== undefined && maxBytes !== undefined) {
    return `${Math.round(minBytes / 1024)}–${Math.round(maxBytes / 1024)} KB`;
  }
  if (maxBytes !== undefined) return `max ${formatKb(maxBytes)}`;
  if (minBytes !== undefined) return `min ${formatKb(minBytes)}`;
  return null;
}
