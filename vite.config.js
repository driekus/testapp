import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Strip console.log / warn / error / info / debug / trace calls from the
 * production bundle by replacing them with a no-op arrow function call.
 * Runs only during `vite build`, never in dev mode.
 */
function dropConsolePlugin() {
  const CONSOLE_RE = /\bconsole\.(log|warn|error|info|debug|trace)\b/g;
  return {
    name: 'drop-console',
    apply: 'build',
    transform(code) {
      if (!CONSOLE_RE.test(code)) return null;
      CONSOLE_RE.lastIndex = 0;
      return { code: code.replace(CONSOLE_RE, '(()=>{})'), map: null };
    },
  };
}

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
  plugins: [swVersionPlugin(), dropConsolePlugin()],
  server: {
    // Serve index.html for any unknown path so /:slug works in dev
    historyApiFallback: { rewrites: SPA_REWRITES },
  },
  preview: {
    // Same fallback for `vite preview` so F5 on /:slug doesn't 404
    historyApiFallback: { rewrites: SPA_REWRITES },
  },
  build: {
    // Strip all console.* calls and debugger statements from production bundles.
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        feedback: 'feedback.html',
        rankings: 'rankings.html',
        winner: 'winner.html',
        'mock-payment': 'mock-payment.html',
        'mobile-only': 'mobile-only.html',
      },
    },
  },
});
