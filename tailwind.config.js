/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#08111f',
        surface: '#0e172a',
        surfaceAlt: '#111c34',
        border: 'rgba(148, 163, 184, 0.16)',
        accent: '#38bdf8',
      },
      boxShadow: {
        card: '0 12px 32px rgba(2, 6, 23, 0.35)',
      },
    },
  },
  plugins: [],
};
