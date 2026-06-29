import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['DM Serif Display', 'serif'],
      },
      colors: {
        ink: '#0a0e17',
        surface: '#111827',
        card: '#1a2235',
        border: '#1f2d45',
        gold: '#f59e0b',
        emerald: '#10b981',
        muted: '#6b7280',
      },
    },
  },
  plugins: [],
};

export default config;
