/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'med-blue': '#005eb8',
        'med-gray': '#f0f4f8',
        'success-green': '#10b981',
        'alert-red': '#ef4444'
      }
    },
  },
  plugins: [],
}
