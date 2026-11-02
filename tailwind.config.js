/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,js}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'Impact', 'sans-serif'],
        body: ['Barlow', '"Segoe UI"', 'sans-serif']
      },
      colors: {
        ink: '#07080b',
        panel: '#12151b',
        sand: '#d6a354',
        ct: '#7eb6d6',
        tr: '#d08a4c'
      }
    }
  },
  plugins: []
}
