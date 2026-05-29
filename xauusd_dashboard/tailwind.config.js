/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0a0e14', card: '#131820', border: '#1e2736' },
        gold: '#d4a853',
        text: { primary: '#e2e8f0', secondary: '#8895aa', muted: '#556278' },
        bull: '#22c55e',
        bear: '#ef4444',
        warn: '#f59e0b',
      },
    },
  },
  plugins: [],
};
