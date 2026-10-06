import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Popup, side panel and service worker.
 *
 * The content script is built separately (vite.content.config.ts) because it must be a single
 * IIFE bundle — content scripts do not support ES modules.
 *
 * Everything is bundled. MV3 forbids remotely hosted code (spec §15.3), so there are no CDN
 * scripts, no dynamic imports from the network, and no eval anywhere in the output.
 */
export default defineConfig({
  root,
  publicDir: path.resolve(root, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@assistigo/core': path.resolve(root, '../../packages/core/src/index.ts'),
      '@assistigo/form-engine/types': path.resolve(root, '../../packages/form-engine/src/types.ts'),
      '@assistigo/form-engine/documents': path.resolve(
        root,
        '../../packages/form-engine/src/documents.ts',
      ),
      '@assistigo/form-engine/constraints': path.resolve(
        root,
        '../../packages/form-engine/src/constraints.ts',
      ),
      '@assistigo/form-engine/safety': path.resolve(
        root,
        '../../packages/form-engine/src/safety.ts',
      ),
      '@assistigo/form-engine': path.resolve(root, '../../packages/form-engine/src/index.ts'),
      // Subpaths only, never the barrel: the offscreen document needs the canvas and PDF
      // encoders, everything else needs only the pure auto-fit planner.
      '@assistigo/document-tools/autofit': path.resolve(
        root,
        '../../packages/document-tools/src/autofit.ts',
      ),
      '@assistigo/document-tools/browser/image': path.resolve(
        root,
        '../../packages/document-tools/src/browser/image.ts',
      ),
      '@assistigo/document-tools/browser/pdf': path.resolve(
        root,
        '../../packages/document-tools/src/browser/pdf.ts',
      ),
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: path.resolve(root, 'src/popup/index.html'),
        sidepanel: path.resolve(root, 'src/sidepanel/index.html'),
        // Auto-fit runs here: the service worker has no canvas (docs/EXTENSION.md §6c).
        offscreen: path.resolve(root, 'src/offscreen/index.html'),
        background: path.resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
