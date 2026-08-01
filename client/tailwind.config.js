/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        doc: ['"Times New Roman"', 'Times', 'ui-serif', 'serif'],
      },
    },
  },
  plugins: [],
};
