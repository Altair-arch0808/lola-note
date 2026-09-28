export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Quicksand', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        rose: { soft: '#F9C6D4' }, cream: '#FFF3DC', lav: '#D9CCF5',
        mint: '#C9EFD9', peach: '#FFD9C2', beige: '#EADCC8', ink: '#4A4453'
      },
      boxShadow: { soft: '0 8px 30px rgba(120, 100, 140, 0.12)' }
    }
  },
  plugins: []
}
