import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Serve index.html for any unknown path so /:slug works in dev
    historyApiFallback: {
      rewrites: [
        // admin stays on admin.html
        { from: /^\/admin\.html/, to: '/admin.html' },
        // everything else → index.html
        { from: /^\/(?!admin\.html)/, to: '/index.html' },
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
})
