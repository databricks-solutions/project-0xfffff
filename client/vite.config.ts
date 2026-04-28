import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
const apiTarget = process.env.E2E_API_URL ?? 'http://localhost:8000';

function removeAtRuleBlock(css: string, token: string): string {
  const start = css.indexOf(token);
  if (start === -1) {
    return css;
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) {
    return css;
  }
  return css.slice(0, start) + css.slice(end + 1);
}

function sanitizeCopilotCss(rawCss: string): string {
  // Tailwind v4 "properties" layer sets --tw-* variables on global * selectors.
  // In a Tailwind v3 app this can change non-Copilot visuals (e.g. blob effects).
  let css = removeAtRuleBlock(rawCss, '@layer properties{');

  // Remove global custom-property registrations from TW v4 output.
  css = css.replace(/@property\s+--tw-[^}]+\}\s*/g, '');

  // Keep Copilot styles, but avoid Tailwind v3 directive normalization checks.
  return css
    .replace(/@layer base\b/g, '@layer cpk_base')
    .replace(/@layer components\b/g, '@layer cpk_components')
    .replace(/@layer utilities\b/g, '@layer cpk_utilities');
}

export default defineConfig({
  plugins: [
    {
      name: 'copilotkit-v2-css-shim',
      enforce: 'pre',
      resolveId(source, importer) {
        const copilotV2CssPath = '/node_modules/@copilotkit/react-core/dist/v2/index.css';
        const virtualCopilotCssId = '\0copilotkit-v2-sanitized.css';
        if (
          // Raw module import from CopilotKit source.
          (source === './index.css' &&
            importer?.includes('/node_modules/@copilotkit/react-core/dist/v2/index.mjs')) ||
          // Prebundled dep import emitted by Vite (absolute filesystem path).
          source.includes(copilotV2CssPath) ||
          // Direct stylesheet import from app code.
          source === '@copilotkit/react-core/v2/styles.css' ||
          source === '@copilotkit/react-core/dist/v2/index.css'
        ) {
          return virtualCopilotCssId;
        }
        return null;
      },
      load(id) {
        if (id !== '\0copilotkit-v2-sanitized.css') {
          return null;
        }

        const copilotCssPath = path.resolve(
          __dirname,
          './node_modules/@copilotkit/react-core/dist/v2/index.css',
        );
        const css = fs.readFileSync(copilotCssPath, 'utf-8');
        return sanitizeCopilotCss(css);
      },
      transform(code, id) {
        // Vite's prebundle can emit an absolute filesystem CSS import here,
        // e.g. import "/Users/.../@copilotkit/react-core/dist/v2/index.css";
        // Rewrite it before import-analysis so resolution cannot fail.
        if (id.includes('/node_modules/.vite/deps/@copilotkit_react-core_v2.js')) {
          return code.replace(
            /import\s+["']\/.*@copilotkit\/react-core\/dist\/v2\/index\.css["'];?/g,
            'import "@copilotkit/react-core/dist/v2/index.css";',
          );
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
        replacement: '@copilotkit/react-core/dist/v2/index.css',
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
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