/**
 * Draws the soft-3D tile icons and writes them as typed data for `<ArtIcon>`.
 *
 *   node apps/mobile/scripts/generate-art-icons.mjs                       write the data
 *   node apps/mobile/scripts/generate-art-icons.mjs --preview sheet.html  also a review sheet
 *
 * House rules, the last two enforced by `check` below:
 *   - one light, from the top left as on the BharatDoc logo: every gradient runs corner to
 *     corner, and every body's thickness falls down and to the right;
 *   - one corner radius (`R`) for every body. Lines are pills, discs are circles, and the few
 *     pointed details (a nib, ribbon tails) are only softened;
 *   - at most three gradients, and no filters or blur;
 *   - only colours from `HUES` and `ACCENT`, which follow the palettes of Home and the vault.
 *
 * Every shape is original. No competitor or government marks.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(mobile, 'components/art-icon/art-icons.generated.ts');

const CANVAS = 48;
const R = 4;
const DEPTH = [1.2, 2];
const MAX_GRADIENTS = 3;

/**
 * Per hue: `from`/`to` light the body around the app's icon colour, `edge` is its thickness,
 * `paper`/`paperTo` a sheet in that hue's shade, `paperEdge` the sheet's thickness. `tint` and
 * `tintDark` are the wells the icon sits on in light and dark mode.
 */
const HUES = {
  blue: {
    from: '#5EA0FF',
    to: '#1257EE',
    edge: '#0B3BB0',
    paper: '#FFFFFF',
    paperTo: '#C3D9FF',
    paperEdge: '#86AEF5',
    tint: '#D6E6FF',
    tintDark: '#14264A',
  },
  teal: {
    from: '#3CC6CC',
    to: '#0A7F88',
    edge: '#07575E',
    paper: '#FFFFFF',
    paperTo: '#B5E4E7',
    paperEdge: '#77BFC5',
    tint: '#C9ECEF',
    tintDark: '#0D2F36',
  },
  green: {
    from: '#4BD07E',
    to: '#0F8A3D',
    edge: '#0A602B',
    paper: '#FFFFFF',
    paperTo: '#BFEBCF',
    paperEdge: '#7FC99A',
    tint: '#CFF0DC',
    tintDark: '#10301F',
  },
  rose: {
    from: '#FF7089',
    to: '#D3143D',
    edge: '#960D2B',
    paper: '#FFFFFF',
    paperTo: '#FFCBD4',
    paperEdge: '#EE93A4',
    tint: '#FBD7DD',
    tintDark: '#3A1620',
  },
  purple: {
    from: '#A77BFA',
    to: '#6A28DB',
    edge: '#491A9C',
    paper: '#FFFFFF',
    paperTo: '#DCCDFF',
    paperEdge: '#AE93EE',
    tint: '#E5D9FF',
    tintDark: '#281A47',
  },
  orange: {
    from: '#FFA24D',
    to: '#E25A05',
    edge: '#A63E02',
    paper: '#FFFFFF',
    paperTo: '#FFDDB8',
    paperEdge: '#EDB27C',
    tint: '#FFE3BA',
    tintDark: '#3A220E',
  },
};
/** The logo's saffron, for the one warm detail an icon may carry. */
const ACCENT = { from: '#FFC04D', to: '#FF9500' };
const WHITE = '#FFFFFF';

// ---- Geometry ----------------------------------------------------------------------------

const n = (value) => String(Math.round(value * 100) / 100);

/**
 * A closed polygon with every corner rounded to `r`, less where an edge is too short. A list
 * gives each corner its own radius, for pieces that must meet another edge exactly.
 */
function poly(points, r = R) {
  const at = (index) => points[(index + points.length) % points.length];
  const corners = points.map((corner, index) => {
    const [toPrev, toNext] = [at(index - 1), at(index + 1)].map((other) => {
      const [dx, dy] = [other[0] - corner[0], other[1] - corner[1]];
      const length = Math.hypot(dx, dy);
      return { length, x: dx / length, y: dy / length };
    });
    const half = Math.acos(toPrev.x * toNext.x + toPrev.y * toNext.y) / 2;
    const radius = Array.isArray(r) ? r[index] : r;
    if (radius === 0) return { start: corner, end: corner, radius, sweep: 0 };
    const cut = Math.min(radius / Math.tan(half), toPrev.length / 2, toNext.length / 2);
    const sweep = toPrev.x * toNext.y - toPrev.y * toNext.x < 0 ? 1 : 0;
    return {
      start: [corner[0] + toPrev.x * cut, corner[1] + toPrev.y * cut],
      end: [corner[0] + toNext.x * cut, corner[1] + toNext.y * cut],
      radius: cut * Math.tan(half),
      sweep,
    };
  });
  return `${corners
    .map(
      ({ start, end, radius, sweep }, index) =>
        `${index === 0 ? 'M' : 'L'}${n(start[0])} ${n(start[1])}` +
        `A${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(end[0])} ${n(end[1])}`,
    )
    .join('')}Z`;
}

const box = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const shift = (points, [dx, dy]) => points.map(([x, y]) => [x + dx, y + dy]);
/** Rotates drawn points, not the canvas, so a tilted body keeps the shared light. */
const rotate = (points, degrees, [cx, cy]) => {
  const a = (degrees * Math.PI) / 180;
  return points.map(([x, y]) => [
    cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
    cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
  ]);
};
const disc = (cx, cy, r) =>
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 1 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 1 ${n(-r * 2)} 0Z`;

// ---- Shapes ------------------------------------------------------------------------------

const fill = (d, paint, opacity) => ({ d, fill: paint, ...(opacity ? { opacity } : {}) });
const line = (d, paint, strokeWidth, opacity) => ({
  d,
  stroke: paint,
  strokeWidth,
  ...(opacity ? { opacity } : {}),
});
/** A horizontal pill from `x` to `x2`, its ends included. */
const pill = (x, x2, y, paint, width = 3.4) =>
  line(`M${n(x + width / 2)} ${n(y)}H${n(x2 - width / 2)}`, paint, width);

/** A solid body: its thickness, then its lit face. */
const slab = (points, paint, edge, depth = DEPTH, r = R) => [
  fill(poly(shift(points, depth), r), edge),
  fill(poly(points, r), paint),
];
/** A pale sheet: a slab with a fine outline, so its lit corner still shows on white. */
const sheet = (points, paint, hue, depth = [0.8, 1.4]) => [
  fill(poly(shift(points, depth)), HUES[hue].paperEdge),
  { ...fill(poly(points), paint), stroke: HUES[hue].paperEdge, strokeWidth: 0.9 },
];
const puck = (cx, cy, r, paint, edge) => [
  fill(disc(cx + DEPTH[0], cy + DEPTH[1], r), edge),
  fill(disc(cx, cy, r), paint),
];
/** The light catching a body's top-left rim. */
function rim(x, y, w, h) {
  const inset = 1.5;
  const r = R - inset;
  return line(
    `M${n(x + inset)} ${n(y + h)}V${n(y + R)}A${r} ${r} 0 0 1 ${n(x + R)} ${n(y + inset)}H${n(x + w)}`,
    WHITE,
    1.2,
    0.5,
  );
}
/** Head and shoulders, the shoulders standing on `bottom`. */
const person = (cx, top, head, width, bottom, paint) => {
  const shoulders = top + head * 2.3;
  const half = width / 2;
  const rise = Math.min(half, bottom - shoulders);
  return [
    fill(disc(cx, top + head, head), paint),
    fill(
      `M${n(cx - half)} ${n(bottom)}V${n(shoulders + rise)}` +
        `A${n(half)} ${n(rise)} 0 0 1 ${n(cx + half)} ${n(shoulders + rise)}V${n(bottom)}Z`,
      paint,
    ),
  ];
};
/** A page with its top-right corner turned down. */
const foldedPage = (x, y, w, h, fold) => [
  [x, y],
  [x + w - fold, y],
  [x + w, y + fold],
  [x + w, y + h],
  [x, y + h],
];
/** A chunky pen whose nib touches `tip`, leaning `angle` degrees from lying flat. */
function pen([x, y], angle, hue) {
  const turn = (points) => rotate(points, angle, [x, y]);
  const half = 4;
  const barrel = turn(box(x + 8, y - half, 20, half * 2));
  const nib = turn([
    [x, y],
    [x + 9, y - half],
    [x + 9, y + half],
  ]);
  const collar = turn(box(x + 7.4, y - half, 3.6, half * 2));
  const glint = turn([
    [x + 13.5, y - 2],
    [x + 24, y - 2],
  ]).map((point) => point.map(n).join(' '));
  return [
    fill(poly(shift(barrel, DEPTH)), HUES[hue].edge),
    fill(poly(nib, 0.8), HUES[hue].edge),
    fill(poly(barrel), 'g1'),
    fill(poly(collar, 0.6), 'g2'),
    line(`M${glint[0]}L${glint[1]}`, WHITE, 1.2, 0.5),
  ];
}

/** A map pin: a round head of radius 12.5 at `cx, cy`, its point 22 below. */
const pin = (cx, cy) =>
  `M${n(cx)} ${n(cy + 22)}C${n(cx - 5)} ${n(cy + 15)} ${n(cx - 12.5)} ${n(cy + 8)} ${n(cx - 12.5)} ${n(cy)}` +
  `A12.5 12.5 0 0 1 ${n(cx + 12.5)} ${n(cy)}C${n(cx + 12.5)} ${n(cy + 8)} ${n(cx + 5)} ${n(cy + 15)} ${n(cx)} ${n(cy + 22)}Z`;
const shield = (dx, dy) =>
  `M${n(23.5 + dx)} ${n(3 + dy)}C${n(28 + dx)} ${n(6.5 + dy)} ${n(33 + dx)} ${n(8 + dy)} ${n(40 + dx)} ${n(8.5 + dy)}` +
  `V${n(21 + dy)}C${n(40 + dx)} ${n(32 + dy)} ${n(32.5 + dx)} ${n(39 + dy)} ${n(23.5 + dx)} ${n(43 + dy)}` +
  `C${n(14.5 + dx)} ${n(39 + dy)} ${n(7 + dx)} ${n(32 + dy)} ${n(7 + dx)} ${n(21 + dy)}V${n(8.5 + dy)}` +
  `C${n(14 + dx)} ${n(8 + dy)} ${n(19 + dx)} ${n(6.5 + dy)} ${n(23.5 + dx)} ${n(3 + dy)}Z`;
/** A solid person, the base rounded to `R`: thickness, then lit face. Pale ones are outlined. */
function figure(cx, top, head, width, bottom, paint, edge, outlined = false) {
  const half = width / 2;
  const shoulders = top + head * 2.3;
  const rise = Math.min(half, bottom - R - shoulders);
  const bust = (dx, dy) =>
    `M${n(cx - half + dx)} ${n(shoulders + rise + dy)}` +
    `A${n(half)} ${n(rise)} 0 0 1 ${n(cx + half + dx)} ${n(shoulders + rise + dy)}` +
    `V${n(bottom - R + dy)}a${R} ${R} 0 0 1 ${-R} ${R}H${n(cx - half + R + dx)}a${R} ${R} 0 0 1 ${-R} ${-R}Z`;
  const outline = outlined ? { stroke: edge, strokeWidth: 0.9 } : {};
  const [dx, dy] = DEPTH;
  return [
    fill(bust(dx, dy), edge),
    { ...fill(bust(0, 0), paint), ...outline },
    fill(disc(cx + dx, top + head + dy * 0.6, head), edge),
    { ...fill(disc(cx, top + head, head), paint), ...outline },
  ];
}

const body = (hue) => [HUES[hue].from, HUES[hue].to];
const paper = (hue) => [HUES[hue].paper, HUES[hue].paperTo];
const accent = [ACCENT.from, ACCENT.to];

const BOLT = [
  [31, 14],
  [42, 14],
  [38, 23.5],
  [45, 23.5],
  [29, 45],
  [32, 31],
  [24.5, 31],
];

// ---- Icons -------------------------------------------------------------------------------

const ICONS = {
  // ---- Home quick actions ----
  document: {
    hue: 'blue',
    gradients: [body('blue'), paper('blue')],
    shapes: [
      ...slab(foldedPage(9, 4, 29, 38, 12), 'g0', HUES.blue.edge, DEPTH, [R, 1.2, 1.2, R, R]),
      fill(
        poly(
          [
            [26.2, 4.3],
            [26.2, 15.8],
            [37.7, 15.8],
          ],
          [0.6, R, 0.6],
        ),
        'g1',
      ),
      rim(9, 4, 13, 14),
      pill(14, 23, 14, ACCENT.from),
      pill(14, 33, 23.5, WHITE),
      pill(14, 33, 30, WHITE),
      pill(14, 26, 36.5, WHITE),
    ],
  },
  upload: {
    hue: 'teal',
    gradients: [body('teal'), paper('teal')],
    shapes: [
      fill(poly(box(5, 21, 37, 21)), HUES.teal.edge),
      ...sheet(box(11, 3, 25, 34), 'g1', 'teal'),
      line('M23.5 25V10.5M17.5 16L23.5 10L29.5 16', HUES.teal.to, 4),
      ...slab(
        [
          [4, 25],
          [14, 25],
          [17, 31],
          [30, 31],
          [33, 25],
          [43, 25],
          [43, 42],
          [4, 42],
        ],
        'g0',
        HUES.teal.edge,
      ),
      rim(4, 25, 8, 9),
    ],
  },
  id_card: {
    hue: 'green',
    gradients: [body('green'), paper('green')],
    shapes: [
      ...slab(box(3, 9, 41, 29), 'g0', HUES.green.edge),
      rim(3, 9, 20, 11),
      fill(poly(box(8, 14, 14, 19)), 'g1'),
      ...person(15, 17, 3.2, 10, 33, HUES.green.to),
      pill(26, 39, 17, ACCENT.from),
      pill(26, 39, 24, WHITE),
      pill(26, 34, 31, WHITE),
    ],
  },
  photo: {
    hue: 'rose',
    gradients: [paper('rose'), body('rose')],
    shapes: [
      ...sheet(box(7, 3, 33, 40), 'g0', 'rose'),
      fill(poly(box(11, 7, 25, 32)), 'g1'),
      rim(11, 7, 12, 13),
      ...person(23.5, 13, 5.4, 19, 39, WHITE),
    ],
  },
  signature: {
    hue: 'purple',
    gradients: [paper('purple'), body('purple'), accent],
    shapes: [
      ...sheet(box(3, 19, 41, 23), 'g0', 'purple'),
      line(
        'M8 35C10 27 14 27 13.5 32S11 38 15.5 34S20 30 21 34S25 36.5 29 33.5',
        HUES.purple.to,
        2.8,
      ),
      ...pen([24.5, 28], -45, 'purple'),
    ],
  },
  multi_page: {
    hue: 'orange',
    gradients: [body('orange'), paper('orange')],
    shapes: [
      ...sheet(box(17, 3, 25, 31), 'g1', 'orange'),
      ...sheet(box(11.5, 7, 25, 31), HUES.orange.paperTo, 'orange'),
      ...slab(box(5, 11, 26, 31), 'g0', HUES.orange.edge),
      rim(5, 11, 13, 12),
      pill(10, 26, 20, WHITE),
      pill(10, 26, 27, WHITE),
      pill(10, 20, 34, WHITE),
    ],
  },

  // ---- Vault categories ----
  identity: {
    hue: 'blue',
    gradients: [body('blue'), paper('blue')],
    shapes: [
      ...slab(box(18.5, 2, 10, 16), HUES.blue.to, HUES.blue.edge),
      ...slab(box(8, 11, 31, 31.5), 'g0', HUES.blue.edge),
      rim(8, 11, 9, 12),
      pill(17, 30, 15.6, ACCENT.from, 4),
      fill(disc(23.5, 29.8, 9), 'g1'),
      ...person(23.5, 23.5, 3.3, 10.4, 36.5, HUES.blue.to),
    ],
  },
  academic: {
    hue: 'green',
    gradients: [body('green'), accent],
    shapes: [
      ...slab(
        [
          [11, 20],
          [36, 20],
          [36, 36],
          [29, 39.5],
          [18, 39.5],
          [11, 36],
        ],
        HUES.green.to,
        HUES.green.edge,
      ),
      ...slab(
        [
          [23.5, 6],
          [51, 19.5],
          [23.5, 33],
          [-4, 19.5],
        ],
        'g0',
        HUES.green.edge,
      ),
      line('M8 18.2L22 11.2', WHITE, 1.2, 0.5),
      line('M24 19.5L39.6 22.2V33', ACCENT.from, 2.4),
      fill(
        poly(
          [
            [37, 31],
            [42.2, 31],
            [43.6, 41],
            [35.6, 41],
          ],
          2,
        ),
        'g1',
      ),
    ],
  },
  certificate: {
    hue: 'orange',
    gradients: [paper('orange'), body('orange'), accent],
    shapes: [
      ...sheet(box(3, 6, 41, 29), 'g0', 'orange'),
      pill(9, 30, 13, HUES.orange.to),
      pill(9, 23, 20, HUES.orange.paperEdge),
      pill(9, 19, 27, HUES.orange.paperEdge),
      fill(
        poly(
          [
            [26, 30],
            [40, 30],
            [40, 45.5],
            [33, 41],
            [26, 45.5],
          ],
          1.2,
        ),
        HUES.orange.edge,
      ),
      ...puck(33, 27, 9.4, 'g1', HUES.orange.edge),
      fill(disc(33, 27, 5), 'g2'),
    ],
  },
  form_asset: {
    hue: 'purple',
    gradients: [body('purple'), paper('purple')],
    shapes: [
      fill(
        poly([
          [4, 7],
          [17, 7],
          [21, 12],
          [43, 12],
          [43, 38],
          [4, 38],
        ]),
        HUES.purple.to,
      ),
      ...sheet(box(9, 10.5, 29, 24), 'g1', 'purple'),
      pill(14, 27, 15.8, ACCENT.from),
      ...slab(box(3, 19.5, 41, 22.5), 'g0', HUES.purple.edge),
      rim(3, 19.5, 20, 9),
    ],
  },

  // ---- Connect actions ----
  find_nearby: {
    hue: 'green',
    gradients: [body('green'), paper('green')],
    shapes: [
      ...sheet(
        [
          [23.5, 22],
          [52, 33.5],
          [23.5, 45],
          [-5, 33.5],
        ],
        'g1',
        'green',
      ),
      fill(pin(23.5 + DEPTH[0], 15.5 + DEPTH[1]), HUES.green.edge),
      fill(pin(23.5, 15.5), 'g0'),
      line('M14 14.5A10 10 0 0 1 20.5 6', WHITE, 1.2, 0.5),
      fill(disc(23.5, 15.5, 5.2), WHITE),
    ],
  },
  share_document: {
    hue: 'blue',
    gradients: [paper('blue'), body('blue')],
    shapes: [
      ...sheet(box(6, 3, 28, 37), 'g0', 'blue'),
      pill(11, 22, 10.5, ACCENT.to),
      pill(11, 29, 17.5, HUES.blue.paperEdge),
      pill(11, 22, 24.5, HUES.blue.paperEdge),
      ...puck(33, 32, 10.6, 'g1', HUES.blue.edge),
      line('M29 36L37 28M30.5 28H37V34.5', WHITE, 3),
    ],
  },
  connections: {
    hue: 'orange',
    gradients: [body('orange'), paper('orange')],
    shapes: [
      ...figure(33, 10, 6, 20, 38, 'g1', HUES.orange.paperEdge, true),
      ...figure(17.5, 7, 7.4, 28, 42, 'g0', HUES.orange.edge),
    ],
  },
  request_help: {
    hue: 'purple',
    gradients: [body('purple')],
    shapes: [
      line('M9.5 27V22A14 14 0 0 1 37.5 22V27', HUES.purple.edge, 5),
      line('M8.5 26V21A15 15 0 0 1 38.5 21V26', HUES.purple.from, 4.4),
      line('M37 35C37 40 33 42 27 42', HUES.purple.to, 3),
      fill(disc(25.5, 42, 3.2), ACCENT.from),
      ...slab(box(3.5, 22, 12, 16), 'g0', HUES.purple.edge),
      ...slab(box(31.5, 22, 12, 16), 'g0', HUES.purple.edge),
      rim(3.5, 22, 5.5, 8),
      rim(31.5, 22, 5.5, 8),
    ],
  },

  // ---- Onboarding features ----
  scan: {
    hue: 'blue',
    gradients: [paper('blue'), body('blue')],
    shapes: [
      ...sheet(box(12, 8, 23, 31), 'g0', 'blue'),
      pill(16.5, 25, 15, HUES.blue.paperEdge),
      pill(16.5, 30.5, 33, HUES.blue.paperEdge),
      line('M4 13V8A4 4 0 0 1 8 4H13', HUES.blue.to, 4),
      line('M34 4H39A4 4 0 0 1 43 8V13', HUES.blue.to, 4),
      line('M43 34V39A4 4 0 0 1 39 43H34', HUES.blue.edge, 4),
      line('M13 43H8A4 4 0 0 1 4 39V34', HUES.blue.edge, 4),
      ...slab(box(3, 20, 41, 8), 'g1', HUES.blue.edge, [0.6, 1]),
      pill(8, 39, 24, ACCENT.from, 2.4),
    ],
  },
  vault: {
    hue: 'green',
    gradients: [body('green')],
    shapes: [
      fill(shield(...DEPTH), HUES.green.edge),
      fill(shield(0, 0), 'g0'),
      line('M9 20V10.4C14 10 18.5 8.6 22 6.3', WHITE, 1.2, 0.5),
      line('M15.5 23L21.5 29L32 17.5', WHITE, 4.6),
    ],
  },
  forms: {
    hue: 'orange',
    gradients: [paper('orange'), body('orange')],
    shapes: [
      ...sheet(box(5, 4, 29, 38), 'g0', 'orange'),
      pill(10, 23, 11.5, HUES.orange.to),
      pill(10, 21, 19, HUES.orange.paperEdge),
      pill(10, 18, 26.5, HUES.orange.paperEdge),
      fill(poly(shift(BOLT, DEPTH), 1.2), HUES.orange.edge),
      fill(poly(BOLT, 1.2), 'g1'),
    ],
  },
  reach: {
    hue: 'purple',
    gradients: [body('purple'), paper('purple')],
    shapes: [
      ...figure(10.5, 11, 5, 17, 36, 'g1', HUES.purple.paperEdge, true),
      ...figure(36, 11, 5, 17, 36, 'g1', HUES.purple.paperEdge, true),
      ...figure(23.5, 8, 7, 26, 42, 'g0', HUES.purple.edge),
    ],
  },
};

// ---- Checks ------------------------------------------------------------------------------

const PALETTE = new Set([
  ...Object.values(HUES).flatMap((hue) => Object.values(hue)),
  ...Object.values(ACCENT),
  WHITE,
]);
const SHAPE_KEYS = new Set(['d', 'fill', 'stroke', 'strokeWidth', 'opacity']);

function check(name, icon) {
  const fail = (reason) => {
    throw new Error(`generate-art-icons: ${name}: ${reason}`);
  };
  if (!HUES[icon.hue]) fail(`unknown hue ${icon.hue}`);
  if (icon.gradients.length > MAX_GRADIENTS) fail(`${icon.gradients.length} gradients`);
  const used = new Set();
  for (const shape of icon.shapes) {
    const extra = Object.keys(shape).find((key) => !SHAPE_KEYS.has(key));
    if (extra) fail(`${extra} on a shape`);
    if (/NaN|undefined/.test(shape.d)) fail(`bad path ${shape.d}`);
    for (const paint of [shape.fill, shape.stroke]) {
      if (paint === undefined) continue;
      if (/^g\d$/.test(paint)) {
        used.add(paint);
        if (!icon.gradients[Number(paint.slice(1))]) fail(`no gradient ${paint}`);
      } else if (!PALETTE.has(paint)) fail(`${paint} is not in the palette`);
    }
  }
  if (used.size !== icon.gradients.length) fail('a gradient is never used');
}
for (const [name, icon] of Object.entries(ICONS)) check(name, icon);

// ---- Output ------------------------------------------------------------------------------

const quote = (value) => `'${value}'`;
const shapeSource = (shape) =>
  `{ ${Object.entries(shape)
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? value : quote(value)}`)
    .join(', ')} }`;

const icons = Object.entries(ICONS)
  .map(
    ([name, icon]) => `  ${name}: {
    hue: ${quote(icon.hue)},
    gradients: [${icon.gradients.map((pair) => `[${pair.map(quote).join(', ')}]`).join(', ')}],
    shapes: [
${icon.shapes.map((shape) => `      ${shapeSource(shape)},`).join('\n')}
    ],
  },`,
  )
  .join('\n');

const tints = Object.entries(HUES)
  .map(([hue, { tint, tintDark }]) => `  ${hue}: { light: '${tint}', dark: '${tintDark}' },`)
  .join('\n');

writeFileSync(
  OUTPUT,
  `/**
 * GENERATED by \`scripts/generate-art-icons.mjs\`. Do not edit: change the script and run
 * \`node apps/mobile/scripts/generate-art-icons.mjs\`.
 */

import type { ArtHue, ArtIconArt, ArtTint } from './types';

export const ART_ICON_CANVAS = ${CANVAS};

/** The soft well an icon sits on, per hue. */
export const ART_TINTS: Readonly<Record<ArtHue, ArtTint>> = {
${tints}
};

export const ART_ICONS = {
${icons}
} as const satisfies Record<string, ArtIconArt>;

export type ArtIconName = keyof typeof ART_ICONS;
`,
);
process.stdout.write(`${Object.keys(ICONS).length} icons → ${path.relative(mobile, OUTPUT)}\n`);

// ---- Review sheet ------------------------------------------------------------------------

let copies = 0;
function svg(icon, size) {
  const prefix = `p${(copies += 1)}`;
  const paint = (value) =>
    value === undefined ? 'none' : value.startsWith('#') ? value : `url(#${prefix}${value})`;
  const defs = icon.gradients
    .map(
      ([from, to], index) =>
        `<linearGradient id="${prefix}g${index}" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
        `</linearGradient>`,
    )
    .join('');
  const paths = icon.shapes
    .map(
      (shape) =>
        `<path d="${shape.d}" fill="${paint(shape.fill)}" stroke="${paint(shape.stroke)}"` +
        ` stroke-width="${shape.strokeWidth ?? 0}" stroke-linecap="round"` +
        ` stroke-linejoin="round" opacity="${shape.opacity ?? 1}"/>`,
    )
    .join('');
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${CANVAS} ${CANVAS}">` +
    `<defs>${defs}</defs>${paths}</svg>`
  );
}

function panel(dark) {
  const sizes = [24, 32, 48];
  const rows = Object.entries(ICONS)
    .map(([name, icon]) => {
      const tint = dark ? HUES[icon.hue].tintDark : HUES[icon.hue].tint;
      const bare = sizes.map((size) => `<td>${svg(icon, size)}</td>`).join('');
      const wells = sizes
        .map((size) => {
          const well = Math.round(size * 1.6);
          const style = `width:${well}px;height:${well}px;background:${tint}`;
          return `<td><i style="${style}">${svg(icon, size)}</i></td>`;
        })
        .join('');
      return `<tr><th>${name}</th>${bare}${wells}</tr>`;
    })
    .join('');
  const heads = [...sizes, ...sizes].map((size) => `<td class="h">${size}px</td>`).join('');
  return (
    `<section class="${dark ? 'dark' : 'light'}"><h2>${dark ? 'Dark' : 'Light'} background</h2>` +
    `<table><tr><th></th><td class="h" colspan="3">on the page</td>` +
    `<td class="h" colspan="3">on its tint</td></tr>` +
    `<tr><th></th>${heads}</tr>${rows}</table></section>`
  );
}

const previewFlag = process.argv.indexOf('--preview');
if (previewFlag !== -1) {
  const target = process.argv[previewFlag + 1];
  if (!target) throw new Error('generate-art-icons: --preview needs a file path');
  writeFileSync(
    target,
    `<!doctype html><meta charset="utf-8"><title>BharatDoc tile icons</title><style>
body{margin:0;display:flex;font:13px system-ui,sans-serif}
section{padding:20px 24px}
.light{background:#F6F9FF;color:#0F172A}
.dark{background:#0C1017;color:#EEF0F4}
h2{font-size:16px;margin:0 0 8px}
table{border-spacing:0}
td{width:84px;height:84px;text-align:center}
th{text-align:left;font-weight:600;width:92px}
.h{height:22px;opacity:.65}
i{display:inline-flex;align-items:center;justify-content:center;border-radius:50%}
svg{display:inline-block;vertical-align:middle}
</style>${panel(false)}${panel(true)}`,
  );
  process.stdout.write(`review sheet → ${target}\n`);
}
