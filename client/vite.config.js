import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Strict Content-Security-Policy for the production page: only our own scripts, styles,
// fonts and API. Added at build time only, because the dev server injects inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://checkout.razorpay.com",
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https://tile.openstreetmap.org https://upload.wikimedia.org https://*.razorpay.com",
  "connect-src 'self' https://*.razorpay.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const cspMeta = {
  name: 'hisaab-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
  ],
};

export default defineConfig({
  plugins: [react(), cspMeta],
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
