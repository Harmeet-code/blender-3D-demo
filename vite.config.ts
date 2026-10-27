import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env['API_BASE_URL'] ?? '';
  const adminApiBase = apiBaseUrl ? `${apiBaseUrl}/api/events` : '/api/events';
  const injection = `<script>window.__ADMIN_API_BASE=${JSON.stringify(adminApiBase).replaceAll('<', '\\u003c')};</script>`;

  return {
    // Builds are deployed under ExpoAdmin/wwwroot/floorplan/, so emitted asset URLs and
    // Vite's modulepreload hints have to carry that prefix. Dev stays at the root.
    base: command === 'build' || isPreview ? '/floorplan/' : '/',
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
    // Recast's worker dependencies use code splitting; IIFE worker output cannot support it.
    worker: { format: 'es' },
    // Lazy routes still need their vendor packages in the first optimizer pass.
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/rapier',
        'react-konva',
        'konva',
        'radix-ui',
        'lucide-react',
        '@tanstack/react-query',
        'zustand',
      ],
    },
    server: {
      open: '/',
      watch: {
        ignored: [
          '**/storage/**',
          '**/data/**',
          '**/openspec/**',
          '**/reports/**',
          '**/test-results*/**',
          '**/docs/**',
          '**/assets-source/**',
          '**/archive/**',
          '**/.codegraph/**',
        ],
      },
      proxy: {
        '/api': 'http://127.0.0.1:8000',
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
        },
      },
    },
    // Local production preview follows the same API/presence routing as the dev server.
    preview: {
      proxy: {
        '/api': 'http://127.0.0.1:8000',
        '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
      },
    },
    build: {
      assetsInlineLimit: (path) => (path.endsWith('.glb') ? false : undefined),
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
            'vendor-physics': ['@react-three/rapier', '@dimforge/rapier3d-compat'],
            'vendor-ui': [
              'radix-ui',
              'class-variance-authority',
              'lucide-react',
              'sonner',
              'cmdk',
              'next-themes',
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
