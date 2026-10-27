import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5260,
    // During development the API runs separately (npm run dev starts both).
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { proxy: { '/api': 'http://localhost:4000' } },
});
