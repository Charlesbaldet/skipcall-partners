import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manual vendor splitting so the main bundle shrinks below the
// 500 KB warning threshold and each vendor stays cacheable across
// app deploys (a recharts upgrade only invalidates vendor-charts,
// not the whole 2.3 MB blob). Pages themselves are split via
// React.lazy() in App.jsx — this config only handles npm vendors.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-i18n':   ['react-i18next', 'i18next'],
          'vendor-ui':     ['react-helmet-async'],
        },
      },
    },
  },
});
