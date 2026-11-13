// Builds the account page (ADR-0051) in two passes: PORTAL=client makes the browser's script and
// stylesheet, then PORTAL=server bundles the server-side renderer with them as text, into one module
// with nothing left to install, for a Worker.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const outDir = here('../../dist/apps');

export default defineConfig(process.env.PORTAL === 'server' ? {
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  ssr: { target: 'webworker', noExternal: true, resolve: { conditions: ['worker', 'browser', 'import', 'default'], externalConditions: ['worker', 'browser'] } },
  build: {
    ssr: here('./server.ts'),
    outDir,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'portal.js', format: 'es' } },
  },
} : {
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: false,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: here('./client.tsx'),
      output: { entryFileNames: 'portal-client.js', assetFileNames: 'portal-client.[ext]', format: 'es' },
    },
  },
});
