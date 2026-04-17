import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(
      process.env.BUILD_VERSION && process.env.BUILD_VERSION !== 'dev'
        ? `f${process.env.BUILD_VERSION}`
        : 'dev'
    ),
  },
  plugins: [react(), tailwindcss()],
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5568,
    strictPort: true,
    host: true,
    clearScreen: false,
    hmr: {
      host: 'localhost',
    },
    proxy: {
      '/trpc': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Don't rewrite — tRPC expects /trpc prefix
      },
      '/media/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/inventory/documents': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
