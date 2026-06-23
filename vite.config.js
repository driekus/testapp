import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Stamp a unique cache name into the built service worker after each build.
 * This avoids stale cached HTML/asset hash mismatches across deployments.
 */
function swVersionPlugin() {
  return {
    name: 'sw-version-plugin',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      try {
        const buildVersion = `letter-quest-${Date.now()}`;
        const source = readFileSync(swPath, 'utf8');
        const updated = source.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${buildVersion}';`);
        writeFileSync(swPath, updated);
        console.log(`[sw-version-plugin] CACHE_NAME=${buildVersion}`);
      } catch {
        // Ignore when sw.js does not exist for a particular build target.
      }
    },
  };
}

const SPA_REWRITES = [
  { from: /^\/admin\.html/, to: '/admin.html' },
  { from: /^\/rankings\.html/, to: '/rankings.html' },
  { from: /^\/feedback\.html/, to: '/feedback.html' },
  { from: /^\/winner\.html/, to: '/winner.html' },
  { from: /^\/mock-payment\.html/, to: '/mock-payment.html' },
  // slug-based routes → index.html
  { from: /^\//, to: '/index.html' },
];

export default defineConfig({
  plugins: [swVersionPlugin()],
  server: {
    // Serve index.html for any unknown path so /:slug works in dev
    historyApiFallback: { rewrites: SPA_REWRITES },
  },
  preview: {
    // Same fallback for `vite preview` so F5 on /:slug doesn't 404
    historyApiFallback: { rewrites: SPA_REWRITES },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        feedback: 'feedback.html',
        rankings: 'rankings.html',
        winner: 'winner.html',
        'mock-payment': 'mock-payment.html',
      },
    },
  },
});
