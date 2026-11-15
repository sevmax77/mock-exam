import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(projectRoot, '.cert', 'preview-key.pem');
const certPath = path.join(projectRoot, '.cert', 'preview-cert.pem');
const networkAddressesUrl = pathToFileURL(
  path.join(projectRoot, 'scripts', 'network-addresses.mjs'),
).href;

function iphoneUrlHelpPlugin() {
  return {
    name: 'iphone-url-help',
    apply: 'serve',
    configurePreviewServer() {
      import(networkAddressesUrl).then(({ printIphoneUrlHelp }) => {
        printIphoneUrlHelp(4173);
      });
    },
  };
}

const previewHttps =
  fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : undefined;

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 4173,
    ...(previewHttps ? { https: previewHttps } : {}),
  },
  plugins: [
    iphoneUrlHelpPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mock Exam',
        short_name: 'Mock Exam',
        description: 'Personal local mock exam practice app',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f6fb',
        theme_color: '#14213d',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://openrouter.ai',
            handler: 'NetworkOnly',
            options: {
              cacheName: 'openrouter-network-only',
            },
          },
        ],
      },
    }),
  ],
});
