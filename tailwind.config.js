/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        offer: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          900: '#7c2d12',
        },
        ink: '#15110d',
      },
      boxShadow: {
        premium: '0 24px 80px rgba(234, 88, 12, 0.18)',
        soft: '0 18px 48px rgba(20, 18, 15, 0.08)',
      },
    },
  },
  plugins: [],
};
