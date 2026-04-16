import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
const apiTarget = process.env.E2E_API_URL ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [
    {
      name: 'copilotkit-v2-css-shim',
      enforce: 'pre',
      resolveId(source, importer) {
        const copilotV2CssPath = '/node_modules/@copilotkit/react-core/dist/v2/index.css';
        if (
          // Raw module import from CopilotKit source.
          (source === './index.css' &&
            importer?.includes('/node_modules/@copilotkit/react-core/dist/v2/index.mjs')) ||
          // Prebundled dep import emitted by Vite (absolute filesystem path).
          source.includes(copilotV2CssPath) ||
          // Direct stylesheet import from app code.
          source === '@copilotkit/react-core/v2/styles.css'
        ) {
          return path.resolve(__dirname, './src/styles/copilotkit-empty.css');
        }
        return null;
      },
    },
    react(),
  ],
  resolve: {
    alias: [
      // CopilotKit v2 currently ships Tailwind v4-generated CSS, which breaks
      // this Tailwind v3/PostCSS pipeline. Redirect all entrypoints to a no-op.
      {
        find: '@copilotkit/react-core/v2/styles.css',
        replacement: path.resolve(__dirname, './src/styles/copilotkit-empty.css'),
      },
      {
        find: /@copilotkit\/react-core\/dist\/v2\/index\.css$/,
        replacement: path.resolve(__dirname, './src/styles/copilotkit-empty.css'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
  },
  optimizeDeps: {
    // Prevent Vite from rewriting CopilotKit v2 imports into .vite/deps
    // absolute CSS imports that bypass the standard alias shims.
    exclude: ['@copilotkit/react-core', '@copilotkit/react-core/v2'],
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