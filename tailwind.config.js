/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        line: {
          green: '#06C755',
          'green-dark': '#05a647',
        },
        primary: {
          50: '#eef6fb',
          100: '#d4e8f5',
          200: '#a9d1eb',
          300: '#7ebae1',
          400: '#54a3d7',
          500: '#2c76a9',
          600: '#245f8a',
          700: '#1c496b',
          800: '#14324c',
          900: '#0c1c2d',
        },
        sky: {
          50: '#f0f8ff',
          100: '#e6f3ff',
          200: '#bde0ff',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'bounce-soft': 'bounceSoft 0.6s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceSoft: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'gradient-sky': 'linear-gradient(180deg, #eef6fb 0%, #ffffff 100%)',
        'gradient-primary': 'linear-gradient(135deg, #2c76a9 0%, #54a3d7 100%)',
        'gradient-card': 'linear-gradient(135deg, #ffffff 0%, #f0f8ff 100%)',
      },
      boxShadow: {
        'card': '0 2px 12px rgba(44, 118, 169, 0.08)',
        'card-hover': '0 8px 24px rgba(44, 118, 169, 0.15)',
        'button': '0 4px 14px rgba(44, 118, 169, 0.3)',
        'button-hover': '0 6px 20px rgba(44, 118, 169, 0.4)',
        'glow': '0 0 20px rgba(44, 118, 169, 0.2)',
      },
    },
  },
  plugins: [],
}
