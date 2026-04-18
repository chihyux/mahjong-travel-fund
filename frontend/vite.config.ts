import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/' 適用 Vercel / Netlify / 根網域部署
// 若要改 GitHub Pages 子目錄部署，把 base 改成 '/你的repo名/'
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173
  }
});
