import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
const apiTarget = process.env.E2E_API_URL ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // JSON reporter for LLM agents (set VITEST_JSON_REPORT=1)
    reporters: process.env.VITEST_JSON_REPORT === '1'
      ? ['json']
      : ['default'],
    outputFile: process.env.VITEST_JSON_REPORT === '1'
      ? '../.test-results/vitest.json'
      : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['**/node_modules/**', 'tests/**', 'build/**', 'src/client/**'],
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/users': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/workshops': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/dbsql-export': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/test': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/databricks': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    minify: 'terser',
    terserOptions: {
      compress: {
        // Temporarily keep console statements for debugging
        // TODO: Re-enable drop_console: true for production
        drop_console: false,
        drop_debugger: true,
      },
    },
  },
})