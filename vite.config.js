import { defineConfig } from 'vite';

const BUILD_TS = new Date().toISOString();
const BUILD_VERSION = `${BUILD_TS.slice(0, 10)}-${Date.now().toString(36)}`;

export default defineConfig({
  root: ".",
  publicDir: "public",
  define: {
    __ASSET_BASE__: JSON.stringify(
      process.env.VITE_ASSET_BASE || "https://assets.grudge-studio.com/arena",
    ),
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
    __APP_DOMAIN__: JSON.stringify(
      process.env.VITE_APP_DOMAIN || "https://grudge-arena.grudge-studio.com",
    ),
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: "index.html",
    },
  },
  server: {
    port: 5173,
  },
});
