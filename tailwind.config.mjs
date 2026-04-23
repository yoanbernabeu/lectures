/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#F5F1E8',
          100: '#EDE7D6',
          200: '#D9D0B8',
          300: '#B8AB8A',
          400: '#8A7D5C',
          500: '#5C5340',
          600: '#3A3426',
          700: '#24201A',
          800: '#17140F',
          900: '#0D0C0B',
        },
        amber: {
          DEFAULT: '#E0A168',
          soft: '#C88A54',
          deep: '#A66E3E',
        },
        terracotta: '#C0553C',
        inkblue: '#3F5B8A',
      },
      letterSpacing: {
        tightest: '-0.035em',
        display: '-0.02em',
      },
      boxShadow: {
        'book': '0 30px 60px -20px rgba(0,0,0,0.6), 0 12px 20px -15px rgba(0,0,0,0.5)',
        'book-hover': '0 45px 80px -20px rgba(0,0,0,0.7), 0 18px 28px -15px rgba(0,0,0,0.6)',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        mytheme: {
          primary: '#E0A168',
          'primary-content': '#0D0C0B',
          secondary: '#C0553C',
          'secondary-content': '#F5F1E8',
          accent: '#3F5B8A',
          'accent-content': '#F5F1E8',
          neutral: '#17140F',
          'neutral-content': '#F5F1E8',
          'base-100': '#0D0C0B',
          'base-200': '#17140F',
          'base-300': '#24201A',
          'base-content': '#F5F1E8',
          info: '#3F5B8A',
          success: '#7A8F5C',
          warning: '#E0A168',
          error: '#C0553C',
        },
      },
    ],
    darkTheme: 'mytheme',
    logs: false,
  },
};
