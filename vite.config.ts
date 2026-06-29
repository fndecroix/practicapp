import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on any static host
// (Vercel/Netlify root or a GitHub Pages subpath).
export default defineConfig({
  base: './',
  plugins: [react()],
});
