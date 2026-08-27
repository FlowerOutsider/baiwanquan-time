import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.BAIWANQUAN_API_PORT ?? '3001'}`,
    },
  },
});
