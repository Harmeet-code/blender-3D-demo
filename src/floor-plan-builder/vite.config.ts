import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Independent entry avoids the pre-existing missing plugins in the main Vite config. */
const studioEntry: Plugin = {
  name: 'floor-plan-studio-entry',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (/^(?:\/floorplan)?\/admin\/floor-plan\/?$/.test(url.pathname)) {
        request.url = `/src/floor-plan-builder/index.html${url.search}`;
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (/^(?:\/floorplan)?\/admin\/floor-plan\/?$/.test(url.pathname)) {
        request.url = `/floorplan/src/floor-plan-builder/index.html${url.search}`;
      }
      next();
    });
  },
};
export default defineConfig(({ command, isPreview }) => ({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  base: command === 'build' || isPreview ? '/floorplan/' : '/',
  plugins: [studioEntry, react(), tailwindcss()],
  worker: { format: 'es' },
  resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } },
  // Floor images come from the existing host/API; do not copy the legacy model library.
  publicDir: false,
  server: {
    port: 5175,
    proxy: { '/api': 'http://127.0.0.1:8000' },
    watch: {
      ignored: ['**/archive/**', '**/assets-source/**', '**/.codegraph/**', '**/reports/**'],
    },
  },
  preview: { port: 4175, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: {
    outDir: 'dist/floor-plan-builder',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
}));
