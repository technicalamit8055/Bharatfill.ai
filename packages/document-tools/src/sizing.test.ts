import { describe, expect, it } from 'vitest';
import {
  MAX_PROBES,
  MIN_QUALITY,
  SCALE_LADDER,
  estimateInitialScale,
  formatKb,
  formatSizeWindow,
  isJpeg,
  judgeSize,
  nextQualityProbe,
  padJpegToMinimum,
  recordQualityProbe,
  sizeWindowPosition,
  startQualitySearch,
} from './sizing';

const KB = 1024;

/**
 * A stand-in encoder. Size falls with quality and with the square of the scale, which is how a
 * real JPEG behaves closely enough to exercise the search.
 */
function fakeEncoder(baseBytes: number) {
  return (quality: number, scale: number) => Math.round(baseBytes * quality * scale * scale);
}

/** Drives the search to completion the way the browser layer does. */
function runSearch(baseBytes: number, maxBytes: number, options: { estimate?: boolean } = {}) {
  const encode = fakeEncoder(baseBytes);
  let state = startQualitySearch({
    startScale: options.estimate === false ? 1 : estimateInitialScale(baseBytes, maxBytes),
  });
  let probe = nextQualityProbe(state);
  const trace: { quality: number; scale: number; bytes: number }[] = [];

  while (probe) {
    const bytes = encode(probe.quality, probe.scale);
    trace.push({ ...probe, bytes });
    state = recordQualityProbe(state, probe, bytes, maxBytes);
    probe = nextQualityProbe(state);
  }
  return { state, trace };
}

describe('quality search', () => {
  it('finds the largest file that still fits under the maximum', () => {
    // 500 KB at quality 1.0. A 50 KB cap needs roughly quality 0.1 — below the floor — so the
    // search has to drop resolution.
    const { state } = runSearch(500 * KB, 50 * KB);
    expect(state.best).not.toBeNull();
    expect(state.best?.bytes).toBeLessThanOrEqual(50 * KB);
    expect(state.best?.scale).toBeLessThan(1);
  });

  it('keeps full resolution when quality alone is enough', () => {
    const { state } = runSearch(60 * KB, 50 * KB);
    expect(state.best?.scale).toBe(1);
    expect(state.best?.bytes).toBeLessThanOrEqual(50 * KB);
  });

  it('aims high inside the window, because portals also enforce a minimum', () => {
    // Anything ≤ 50 KB fits, but a 12 KB result would fail an SSC 20–50 KB window. The search
    // must land near the top of what fits, not at the first thing that fits.
    const { state } = runSearch(60 * KB, 50 * KB);
    expect(state.best?.bytes).toBeGreaterThan(40 * KB);
  });

  it('never probes below the quality floor', () => {
    const { trace } = runSearch(4000 * KB, 30 * KB);
    for (const probe of trace) expect(probe.quality).toBeGreaterThanOrEqual(MIN_QUALITY);
  });

  it('stops within the probe budget even when nothing can fit', () => {
    const { state, trace } = runSearch(50_000 * KB, 1 * KB);
    expect(trace.length).toBeLessThanOrEqual(MAX_PROBES);
    expect(nextQualityProbe(state)).toBeNull();
  });

  it('steps along the scale ladder one rung at a time, never skipping', () => {
    const { trace } = runSearch(2000 * KB, 40 * KB, { estimate: false });
    const rungs = [...new Set(trace.map((probe) => probe.scale))].map((scale) =>
      SCALE_LADDER.indexOf(scale as 1),
    );
    for (let index = 1; index < rungs.length; index += 1) {
      expect(Math.abs((rungs[index] as number) - (rungs[index - 1] as number))).toBe(1);
    }
  });

  it('drops a rung immediately when the file is far over the limit, rather than bisecting quality', () => {
    // 4 MB source into a 50 KB box: quality can buy about 3×, not 80×.
    const { trace } = runSearch(4000 * KB, 50 * KB, { estimate: false });
    const scalesTried = new Set(trace.map((probe) => probe.scale));
    // Without the early rung drop this spends all eight probes at scale 1.
    expect(scalesTried.size).toBeGreaterThan(2);
  });

  it('climbs back up when the opening estimate gave away resolution it did not need to', () => {
    // The estimate is biased high on purpose, but a source that compresses unusually well can
    // still land far under the limit at its first rung. The search should hand back the sharper
    // file rather than the first one that fitted.
    const encode = fakeEncoder(120 * KB);
    let state = startQualitySearch({ startScale: 0.35 });
    let probe = nextQualityProbe(state);
    while (probe) {
      state = recordQualityProbe(state, probe, encode(probe.quality, probe.scale), 50 * KB);
      probe = nextQualityProbe(state);
    }
    expect(state.best?.scale).toBeGreaterThan(0.35);
    expect(state.best?.bytes).toBeLessThanOrEqual(50 * KB);
  });

  it('never climbs again once it has given up resolution', () => {
    const { trace } = runSearch(4000 * KB, 50 * KB, { estimate: false });
    const rungs = trace.map((probe) => SCALE_LADDER.indexOf(probe.scale as 1));
    const firstDrop = rungs.findIndex((rung, index) => index > 0 && rung > (rungs[index - 1] ?? 0));
    if (firstDrop >= 0) {
      const after = rungs.slice(firstDrop);
      expect(after).toEqual([...after].sort((a, b) => a - b));
    }
  });

  it('reports nothing found when even the smallest rung overshoots', () => {
    const { state } = runSearch(100_000 * KB, 1 * KB);
    expect(state.best).toBeNull();
  });
});

describe('estimateInitialScale', () => {
  it('leaves a file that already fits alone', () => {
    expect(estimateInitialScale(30 * KB, 50 * KB)).toBe(1);
    expect(estimateInitialScale(0, 50 * KB)).toBe(1);
  });

  it('proposes a smaller rung the further over the limit the source is', () => {
    const mild = estimateInitialScale(200 * KB, 100 * KB);
    const severe = estimateInitialScale(4000 * KB, 50 * KB);
    expect(severe).toBeLessThan(mild);
  });

  it('only ever returns a ladder rung, so the search shares its vocabulary', () => {
    for (const source of [80, 300, 1200, 5000, 20_000]) {
      expect(SCALE_LADDER).toContain(estimateInitialScale(source * KB, 45 * KB));
    }
  });
});

describe('padJpegToMinimum', () => {
  /** SOI, a token APP0 segment, then EOI. */
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x41, 0x42, 0xff, 0xd9]);

  it('recognises a JPEG by its start-of-image marker', () => {
    expect(isJpeg(jpeg)).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('reaches the minimum size', () => {
    const padded = padJpegToMinimum(jpeg, 20 * KB);
    expect(padded.length).toBeGreaterThanOrEqual(20 * KB);
  });

  it('keeps the SOI marker first, so the file is still a JPEG', () => {
    const padded = padJpegToMinimum(jpeg, 2000);
    expect(padded[0]).toBe(0xff);
    expect(padded[1]).toBe(0xd8);
  });

  it('inserts a well-formed COM segment whose declared length matches its payload', () => {
    const padded = padJpegToMinimum(jpeg, 2000);
    expect(padded[2]).toBe(0xff);
    expect(padded[3]).toBe(0xfe);
    const declared = ((padded[4] ?? 0) << 8) | (padded[5] ?? 0);
    // Length covers the two length bytes plus the payload, and the padding is one segment here.
    expect(declared).toBe(2000 - jpeg.length - 2);
  });

  it('preserves every original byte after the marker', () => {
    const padded = padJpegToMinimum(jpeg, 5000);
    expect([...padded.subarray(0, 2)]).toEqual([...jpeg.subarray(0, 2)]);
    expect([...padded.subarray(padded.length - (jpeg.length - 2))]).toEqual([
      ...jpeg.subarray(2),
    ]);
  });

  it('splits into several segments when the shortfall exceeds one segment’s capacity', () => {
    const padded = padJpegToMinimum(jpeg, 200 * KB);
    expect(padded.length).toBeGreaterThanOrEqual(200 * KB);
    // Second segment starts right after the first, which declares 65535 bytes of length.
    const firstLength = ((padded[4] ?? 0) << 8) | (padded[5] ?? 0);
    expect(firstLength).toBe(65535);
    const secondMarkerAt = 2 + 2 + firstLength;
    expect(padded[secondMarkerAt]).toBe(0xff);
    expect(padded[secondMarkerAt + 1]).toBe(0xfe);
  });

  it('leaves a file that already meets the minimum untouched', () => {
    const big = padJpegToMinimum(jpeg, 4000);
    expect(padJpegToMinimum(big, 1000)).toBe(big);
  });

  it('refuses to touch a non-JPEG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(padJpegToMinimum(png, 20 * KB)).toBe(png);
  });
});

describe('judgeSize', () => {
  const window = { minBytes: 20 * KB, maxBytes: 50 * KB };

  it('names both failure directions, not just "too big"', () => {
    expect(judgeSize(12 * KB, window)).toBe('too_small');
    expect(judgeSize(64 * KB, window)).toBe('too_large');
    expect(judgeSize(30 * KB, window)).toBe('ok');
  });

  it('treats the bounds as inclusive, the way a portal does', () => {
    expect(judgeSize(20 * KB, window)).toBe('ok');
    expect(judgeSize(50 * KB, window)).toBe('ok');
  });

  it('says nothing when the preset states no window', () => {
    expect(judgeSize(30 * KB, {})).toBe('unknown');
  });
});

describe('size window meter', () => {
  it('positions the file inside its window', () => {
    expect(sizeWindowPosition(20 * KB, { minBytes: 20 * KB, maxBytes: 60 * KB })).toBe(0);
    expect(sizeWindowPosition(40 * KB, { minBytes: 20 * KB, maxBytes: 60 * KB })).toBe(0.5);
    expect(sizeWindowPosition(60 * KB, { minBytes: 20 * KB, maxBytes: 60 * KB })).toBe(1);
  });

  it('clamps rather than running off the end of the bar', () => {
    expect(sizeWindowPosition(2 * KB, { minBytes: 20 * KB, maxBytes: 60 * KB })).toBe(0);
    expect(sizeWindowPosition(900 * KB, { minBytes: 20 * KB, maxBytes: 60 * KB })).toBe(1);
  });

  it('has no position to show without an upper bound', () => {
    expect(sizeWindowPosition(30 * KB, { minBytes: 20 * KB })).toBeNull();
  });
});

describe('formatting', () => {
  it('writes sizes the way a portal notice does', () => {
    expect(formatKb(48 * KB)).toBe('48 KB');
    expect(formatSizeWindow({ minBytes: 20 * KB, maxBytes: 50 * KB })).toBe('20–50 KB');
    expect(formatSizeWindow({ maxBytes: 200 * KB })).toBe('max 200 KB');
    expect(formatSizeWindow({ minBytes: 10 * KB })).toBe('min 10 KB');
    expect(formatSizeWindow({})).toBeNull();
  });
});
