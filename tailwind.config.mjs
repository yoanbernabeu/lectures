/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#6366f1', // Indigo vif
          dark: '#4f46e5'
        },
        accent: {
          DEFAULT: '#8b5cf6', // Violet
          dark: '#7c3aed'
        },
        dark: {
          DEFAULT: '#0f172a', // Slate 900
          light: '#1e293b', // Slate 800
          lighter: '#334155' // Slate 700
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'),
    require('daisyui')
  ],
  daisyui: {
    themes: [
      {
        mytheme: {
          "primary": "#6366f1",
          "secondary": "#8b5cf6",
          "accent": "#1FB2A5",
          "neutral": "#191D24",
          "base-100": "#0B1121",
          "base-200": "#131B2E",
          "base-300": "#1C2439",
          "base-content": "#E2E8F0",
          "info": "#3ABFF8",
          "success": "#36D399",
          "warning": "#FBBD23",
          "error": "#F87272",
        },
      },
    ],
    darkTheme: "mytheme",
  }
} 