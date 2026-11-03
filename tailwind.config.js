/** MY TRAVEL LOG design tokens — see docs/DESIGN_SYSTEM.md */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F4EE',
        beige: { DEFAULT: '#E8E0D4', dark: '#D8CCBA' },
        charcoal: { DEFAULT: '#333333', soft: '#5E5A55', mute: '#8C867E' },
        olive: { DEFAULT: '#78836A', dark: '#5F6954', light: '#E4E7DD' },
        navy: { DEFAULT: '#34445A', dark: '#26323F', light: '#DDE2E9' },
        paper: '#FCFBF8',
        clay: '#B5715A',
      },
      fontFamily: {
        serif: ['"Playfair Display"', '"Noto Serif KR"', 'Georgia', 'serif'],
        sans: ['Pretendard', '"Pretendard Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: { label: '0.18em' },
      boxShadow: {
        card: '0 1px 2px rgba(51,51,51,0.04), 0 8px 24px -12px rgba(51,51,51,0.12)',
        lift: '0 2px 4px rgba(51,51,51,0.05), 0 20px 40px -18px rgba(51,51,51,0.25)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'none' } },
        fade: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
      },
      animation: { rise: 'rise .5s ease-out both', fade: 'fade .3s ease-out both' },
    },
  },
  plugins: [],
};
