/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#edfdf6',
          100: '#d3f9e8',
          200: '#aaf2d3',
          300: '#72e7b8',
          400: '#38d496',
          500: '#16b97a',
          600: '#0d9763',
          700: '#0d7a51',
          800: '#0f6143',
          900: '#0e5038',
        },
        surface: '#f8faf9',
        card:    '#ffffff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08)',
      },
      borderRadius: {
        xl: '0.875rem',
      }
    },
  },
  plugins: [],
}
