import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendors into stable, cacheable chunks so route-level lazy
        // imports don't pull in libraries they never use, and so a change to
        // app code never invalidates the vendor caches.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('chart.js')) return 'charts';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
            return 'forms';
          }
          if (id.includes('axios')) return 'http';
          if (id.includes('signature_pad')) return 'signature';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
