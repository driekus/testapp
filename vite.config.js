import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Serve index.html for any unknown path so /:slug works in dev
    historyApiFallback: {
      rewrites: [
        // admin stays on admin.html
        { from: /^\/admin\.html/, to: '/admin.html' },
        { from: /^\/rankings\.html/, to: '/rankings.html' },
        // everything else → index.html
        { from: /^\/(?!admin\.html|rankings\.html)/, to: '/index.html' },
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        feedback: 'feedback.html',
        rankings: 'rankings.html',
        'mock-payment': 'mock-payment.html',
      },
    },
  },
})
