/**
 * The tab bar's icons: a still outline for an unselected tab, and for a selected one a stack of
 * filled layers that can each move on their own track.
 *
 * Outlines are Lucide's (ISC); the filled layers are drawn to sit on the same shapes. To add an
 * icon, add an entry: every track must run from 0 to 1 and end at rest (`tab-bar-motion.test.ts`).
 */

import type { TabMotionTrack } from './tab-motion';

export const TAB_ICON_CANVAS = 24;

/** Where a layer takes its colour from; resolved against the tab bar palette. */
export type TabIconPaint = 'solid' | 'soft' | 'cutout';

export type TabIconLayer = {
  readonly paths: readonly string[];
  readonly fill?: TabIconPaint;
  readonly stroke?: TabIconPaint;
  /** Point that scales grow from, in icon units. The middle when left out. */
  readonly origin?: readonly [x: number, y: number];
  readonly motion?: readonly TabMotionTrack[];
};

export type TabIconArt = {
  /** Empty for an icon only ever drawn solid (the raised circle's). */
  readonly outline: readonly string[];
  /** Back to front. */
  readonly layers: readonly TabIconLayer[];
};

const HOUSE =
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const FOLDER =
  'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';

export type TabIconName = 'home' | 'vault' | 'connect' | 'profile' | 'scan';

export const TAB_ICONS: Readonly<Record<TabIconName, TabIconArt>> = {
  /** The door swings open from its hinge. */
  home: {
    outline: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', HOUSE],
    layers: [
      { paths: [HOUSE], fill: 'solid' },
      {
        paths: ['M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7z'],
        fill: 'cutout',
        origin: [9, 21],
        motion: [
          {
            prop: 'scaleX',
            keys: [
              [0, 0.05],
              [0.35, 0.05],
              [0.8, 1.1],
              [1, 1],
            ],
          },
        ],
      },
    ],
  },

  /** The folder's front dips open and a page rises out of it. */
  vault: {
    outline: [FOLDER],
    layers: [
      { paths: [FOLDER], fill: 'soft' },
      {
        paths: ['M7 7.5h10a1.2 1.2 0 0 1 1.2 1.2V17H5.8V8.7A1.2 1.2 0 0 1 7 7.5z'],
        fill: 'cutout',
        motion: [
          {
            prop: 'translateY',
            keys: [
              [0, 5],
              [0.25, 5],
              [0.65, -2.5],
              [1, 0],
            ],
          },
        ],
      },
      {
        paths: ['M4 10.5h16a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.5a2 2 0 0 1 2-2z'],
        fill: 'solid',
        origin: [12, 20],
        motion: [
          {
            prop: 'scaleY',
            keys: [
              [0, 1],
              [0.4, 0.7],
              [0.8, 1.04],
              [1, 1],
            ],
          },
        ],
      },
    ],
  },

  /** Links draw out from the first dot and the other two travel along them. */
  connect: {
    outline: [
      'M18 2a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
      'M6 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
      'M18 16a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
      'M8.59 13.51l6.83 3.98',
      'M15.41 6.51l-6.82 3.98',
    ],
    layers: [
      {
        paths: ['M6 12L18 5', 'M6 12L18 19'],
        stroke: 'soft',
        origin: [6, 12],
        motion: [
          {
            prop: 'scale',
            keys: [
              [0, 0.05],
              [0.15, 0.05],
              [0.65, 1.08],
              [1, 1],
            ],
          },
        ],
      },
      {
        paths: ['M18 2a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
        fill: 'solid',
        motion: [
          {
            prop: 'translateX',
            keys: [
              [0, -12],
              [0.15, -12],
              [0.65, 1],
              [1, 0],
            ],
          },
          {
            prop: 'translateY',
            keys: [
              [0, 7],
              [0.15, 7],
              [0.65, -0.6],
              [1, 0],
            ],
          },
        ],
      },
      {
        paths: ['M18 16a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
        fill: 'solid',
        motion: [
          {
            prop: 'translateX',
            keys: [
              [0, -12],
              [0.15, -12],
              [0.65, 1],
              [1, 0],
            ],
          },
          {
            prop: 'translateY',
            keys: [
              [0, -7],
              [0.15, -7],
              [0.65, 0.6],
              [1, 0],
            ],
          },
        ],
      },
      {
        paths: ['M6 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8z'],
        fill: 'solid',
        origin: [6, 12],
        motion: [
          {
            prop: 'scale',
            keys: [
              [0, 1],
              [0.25, 1.25],
              [0.7, 0.95],
              [1, 1],
            ],
          },
        ],
      },
    ],
  },

  /** The head bobs up as the shoulders rise to meet it. */
  profile: {
    outline: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
    layers: [
      {
        paths: [
          'M12 13.5c-4.1 0-7.2 2.6-7.2 5.8 0 1.2.9 2.2 2.1 2.2h10.2c1.2 0 2.1-1 2.1-2.2 0-3.2-3.1-5.8-7.2-5.8z',
        ],
        fill: 'solid',
        origin: [12, 21.5],
        motion: [
          {
            prop: 'scaleY',
            keys: [
              [0, 0.4],
              [0.5, 1.1],
              [1, 1],
            ],
          },
        ],
      },
      {
        paths: ['M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
        fill: 'solid',
        motion: [
          {
            prop: 'translateY',
            keys: [
              [0, 4],
              [0.45, -2],
              [0.75, 0.6],
              [1, 0],
            ],
          },
        ],
      },
    ],
  },

  /** The viewfinder corners squeeze in as if focusing, and the lens pulses. */
  scan: {
    outline: [],
    layers: [
      {
        paths: [
          'M3 7V5a2 2 0 0 1 2-2h2',
          'M17 3h2a2 2 0 0 1 2 2v2',
          'M21 17v2a2 2 0 0 1-2 2h-2',
          'M7 21H5a2 2 0 0 1-2-2v-2',
        ],
        stroke: 'solid',
        motion: [
          {
            prop: 'scale',
            keys: [
              [0, 1],
              [0.35, 0.76],
              [0.7, 1.06],
              [1, 1],
            ],
          },
        ],
      },
      {
        paths: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'],
        stroke: 'solid',
        motion: [
          {
            prop: 'scale',
            keys: [
              [0, 1],
              [0.35, 1.3],
              [0.7, 0.9],
              [1, 1],
            ],
          },
        ],
      },
    ],
  },
};
