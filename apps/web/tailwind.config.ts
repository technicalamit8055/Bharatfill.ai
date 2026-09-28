import type { Config } from 'tailwindcss';
import defaultColors from 'tailwindcss/colors';
import plugin from 'tailwindcss/plugin';

/*
 * Theme-aware colour scales for the staff console (`/admin`, `/staff`).
 *
 * The console is written dark-first: `bg-slate-950` is the page, `text-slate-100` is a heading,
 * `text-sky-300` is an accent that reads on a dark surface. To give it a light theme without a
 * second copy of every class, these scales resolve through CSS variables. Everywhere in the app
 * the variables hold Tailwind's own palette, so the operator dashboard renders exactly as before.
 * Inside an element carrying `data-console-theme="light"` — or `"system"` on a light-preferring
 * device — they are swapped for a mirrored scale: slate steps swap ends (950 ↔ 50), and accent
 * steps that are used as text on dark move to their darker counterparts, while the 500/600 fills
 * behind white button labels stay put.
 *
 * The rule for console code, then: write the dark version and the light one follows. Do not use
 * light-first classes (`bg-white`, `text-slate-900`) inside the console — they would flip too.
 */
const THEMED_SCALES = [
  'slate',
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'indigo',
  'cyan',
] as const;
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
type Step = (typeof STEPS)[number];

const SLATE_LIGHT: Record<Step, Step> = {
  50: '950',
  100: '900',
  200: '800',
  300: '700',
  400: '600',
  500: '500',
  600: '400',
  700: '300',
  800: '200',
  900: '100',
  950: '50',
};

const ACCENT_LIGHT: Record<Step, Step> = {
  50: '900',
  100: '800',
  200: '800',
  300: '700',
  400: '600',
  500: '500',
  600: '600',
  700: '700',
  800: '200',
  900: '200',
  950: '50',
};

/*
 * Surfaces the mirror cannot express. A dark card is slate-900 at 40% over the page; the light
 * equivalent is an opaque white card on a pale page, not the mirror's light grey. Values are
 * `r g b` so opacity modifiers work (`bg-console-chrome/85`).
 */
const CONSOLE_SURFACES: Record<string, { dark: string; light: string }> = {
  /** Sidebar and top bar. */
  chrome: { dark: '2 6 23', light: '255 255 255' },
  /** Cards and stat tiles. */
  surface: { dark: '7 13 31', light: '255 255 255' },
  /** Text inputs, selects, textareas. */
  field: { dark: '15 23 42', light: '255 255 255' },
  /** Menus, the command palette. */
  popover: { dark: '15 23 42', light: '255 255 255' },
  /** Drop shadows: black on dark, a soft slate on light. */
  shadow: { dark: '0 0 0', light: '100 116 139' },
};

function triplet(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)).join(' ');
}

function scaleVariables(mapping?: { slate: Record<Step, Step>; accent: Record<Step, Step> }) {
  const out: Record<string, string> = {};
  for (const name of THEMED_SCALES) {
    const palette = defaultColors[name] as Record<Step, string>;
    const map = name === 'slate' ? mapping?.slate : mapping?.accent;
    for (const step of STEPS)
      out[`--cx-${name}-${step}`] = triplet(palette[map ? map[step] : step]);
  }
  return out;
}

function surfaceVariables(mode: 'dark' | 'light') {
  return Object.fromEntries(
    Object.entries(CONSOLE_SURFACES).map(([name, value]) => [`--cx-console-${name}`, value[mode]]),
  );
}

const LIGHT = {
  ...scaleVariables({ slate: SLATE_LIGHT, accent: ACCENT_LIGHT }),
  ...surfaceVariables('light'),
  colorScheme: 'light',
};

const consoleTheme = plugin(({ addBase }) => {
  addBase({
    ':root': { ...scaleVariables(), ...surfaceVariables('dark') },
    '[data-console-theme="dark"]': { colorScheme: 'dark' },
    '[data-console-theme="light"]': LIGHT,
    '@media (prefers-color-scheme: light)': { '[data-console-theme="system"]': LIGHT },
    '@media (prefers-color-scheme: dark)': {
      '[data-console-theme="system"]': { colorScheme: 'dark' },
    },
  });
});

const themedColors = Object.fromEntries(
  THEMED_SCALES.map((name) => [
    name,
    Object.fromEntries(
      STEPS.map((step) => [step, `rgb(var(--cx-${name}-${step}) / <alpha-value>)`]),
    ),
  ]),
);

const consoleColors = Object.fromEntries(
  Object.keys(CONSOLE_SURFACES).map((name) => [
    name,
    `rgb(var(--cx-console-${name}) / <alpha-value>)`,
  ]),
);

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ...themedColors,
        console: consoleColors,
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebeff',
          400: '#5999ff',
          500: '#3374fb',
          600: '#1d54f0',
          700: '#1841dc',
          800: '#1a37b2',
          900: '#1b338c',
        },
      },
      keyframes: {
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'progress-indeterminate': 'progress-indeterminate 1.2s ease-in-out infinite',
      },
      fontFamily: {
        sans: [
          'var(--font-jakarta)',
          'var(--font-devanagari)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans',
          'Arial',
          'sans-serif',
        ],
        heading: [
          'var(--font-outfit)',
          'var(--font-devanagari)',
          'var(--font-jakarta)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        outfit: ['var(--font-outfit)', 'var(--font-devanagari)', 'sans-serif'],
        // Legacy alias — Inter has been retired in favour of Outfit/Jakarta; kept so any
        // remaining `font-inter` usage still resolves to the new body font instead of erroring.
        inter: ['var(--font-jakarta)', 'sans-serif'],
        jakarta: ['var(--font-jakarta)', 'var(--font-devanagari)', 'sans-serif'],
        devanagari: ['var(--font-devanagari)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [consoleTheme],
};

export default config;
