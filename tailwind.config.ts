import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: { brand: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' } },
    },
  },
  plugins: [],
} satisfies Config;
