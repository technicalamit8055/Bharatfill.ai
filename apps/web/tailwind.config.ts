import type { Config } from 'tailwindcss';

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
  plugins: [],
};

export default config;
