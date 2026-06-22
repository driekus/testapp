import { defineConfig } from 'vite';

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
