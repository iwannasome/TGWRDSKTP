import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(148,163,184,0.18), 0 0 24px rgba(56,189,248,0.12)'
      }
    }
  },
  plugins: []
} satisfies Config