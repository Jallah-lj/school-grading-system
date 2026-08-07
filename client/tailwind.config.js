/** @type {import('tailwindcss').Config} */

/**
 * Design tokens — "Institutional forest" theme.
 *
 * A professional, academic palette built on a deep pine green, warm paper
 * neutrals and a restrained gold accent. It deliberately avoids the default
 * blue/indigo/violet look. The legacy `indigo` / `violet` / `blue` names are
 * aliased to the brand green and `slate` is aliased to warm neutrals, so every
 * existing utility still resolves to the new palette.
 */
const pine = {
  50: '#f3f7f4',
  100: '#e3eee7',
  200: '#c8dcd0',
  300: '#9ec1ad',
  400: '#6fa086',
  500: '#4d8267',
  600: '#396852',
  700: '#2d5442',
  800: '#264437',
  900: '#20382e',
  950: '#101e18',
};

const moss = {
  50: '#f6f7f1',
  100: '#eaeedf',
  200: '#d5ddc3',
  300: '#b6c49c',
  400: '#94a772',
  500: '#778c55',
  600: '#5c7040',
  700: '#485735',
  800: '#3b472e',
  900: '#333c29',
  950: '#191f13',
};

const warm = {
  50: '#fafaf9',
  100: '#f5f5f4',
  200: '#e7e5e4',
  300: '#d6d3d1',
  400: '#a8a29e',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'ui-serif', 'serif'],
        doc: ['"Times New Roman"', 'Times', 'ui-serif', 'serif'],
      },
      colors: {
        brand: pine,
        moss,
        slate: warm,
        indigo: pine,
        violet: pine,
        blue: pine,
        sky: moss,
      },
    },
  },
  plugins: [],
};
