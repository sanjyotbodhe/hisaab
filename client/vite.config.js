import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The split/balance math lives in server/src/shared and is reused here for live previews.
    alias: { '@shared': path.resolve(__dirname, '../server/src/shared') },
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '..')] },
    // Same-origin in development too, so the auth cookie works exactly like production.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
