// Builds each card Claude shows beside a tool's result into one self-contained HTML page, as the MCP
// Apps extension serves it (ADR-0049): React, styled by Tailwind from CMOkit's own look (ADR-0046).
// Run by the package's build; the content server is handed the page and serves it at its ui:// address.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const card = process.env.CARD ?? 'waitlist';

export default defineConfig({
  root: fileURLToPath(new URL(`./${card}`, import.meta.url)),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('../dist/apps', import.meta.url)),
    emptyOutDir: false,
    rollupOptions: { input: fileURLToPath(new URL(`./${card}/${card}.html`, import.meta.url)) },
  },
});
