import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '',
  build: {
    // Build into a staging dir, not the live `dist/` that Chrome loads.
    // scripts/swap-dist.mjs (run after build) atomically renames this into
    // `dist/`, so Chrome never sees an empty/half-written extension directory
    // during a rebuild (which makes it silently drop the unpacked extension).
    outDir: '.dist-build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidebar: resolve(__dirname, 'sidebar.html'),
        home: resolve(__dirname, 'home.html'),
        settings: resolve(__dirname, 'settings.html'),
        workshifts: resolve(__dirname, 'workshifts.html'),
        activity: resolve(__dirname, 'activity.html'),
        background: resolve(__dirname, 'src/background/background.js'),
        gatekeeper: resolve(__dirname, 'src/content/gatekeeper.js'),
        blockgate: resolve(__dirname, 'src/content/blockgate.js'),
        inbar: resolve(__dirname, 'src/content/inbar.js')
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      }
    }
  }
});
