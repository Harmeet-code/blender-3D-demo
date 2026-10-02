import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env['API_BASE_URL'] ?? '';
  const adminApiBase = apiBaseUrl ? `${apiBaseUrl}/api/events` : '/api/events';
  const injection = `<script>window.__ADMIN_API_BASE=${JSON.stringify(adminApiBase).replaceAll('<', '\\u003c')};</script>`;

  return {
    // Builds are deployed under ExpoAdmin/wwwroot/floorplan/, so emitted asset URLs and
    // Vite's modulepreload hints have to carry that prefix. Dev stays at the root.
    base: command === 'build' ? '/floorplan/' : '/',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'development-asset-fault',
        configureServer(server) {
          server.middlewares.use('/__asset_failure__/http.glb', (_request, response) => {
            response.statusCode = 503;
            response.setHeader('Content-Type', 'model/gltf-binary');
            response.end('Injected asset HTTP failure');
          });
        },
      },
      {
        name: 'inject-api-base',
        transformIndexHtml(html) {
          return html.replace('</head>', `${injection}</head>`);
        },
      },
    ],
    server: {
      open: '/view/default-event',
      watch: {
        ignored: ['**/storage/**', '**/data/**', '**/openspec/**'],
      },
      proxy: {
        '/api': 'http://127.0.0.1:8000',
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
        },
      },
    },
    preview: {},
    build: { assetsInlineLimit: (path) => (path.endsWith('.glb') ? false : undefined) },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
