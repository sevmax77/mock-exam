import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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

const QUESTIONS_CHUNK = 'questions';
const APP_CHUNK_WARNING_KB = 500;

/**
 * Vite's chunk size warning, minus the questions chunk: that one is plain data and grows with the
 * question bank, so only app code is held to the limit.
 */
function appChunkSizeWarningPlugin(): Plugin {
  return {
    name: 'app-chunk-size-warning',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const kb = file.type === 'chunk' ? Buffer.byteLength(file.code) / 1000 : 0;
        if (file.type === 'chunk' && file.name !== QUESTIONS_CHUNK && kb > APP_CHUNK_WARNING_KB) {
          this.warn(
            `${file.fileName} is ${Math.round(kb)} kB after minification ` +
              `(limit ${APP_CHUNK_WARNING_KB} kB). Consider splitting it with a dynamic import().`,
          );
        }
      }
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
  build: {
    // Replaced by appChunkSizeWarningPlugin, which skips the questions chunk.
    chunkSizeWarningLimit: Number.POSITIVE_INFINITY,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // The bundled questions.json goes in its own chunk, so an app update doesn't re-download
          // the question bank and a bank update doesn't re-download the app.
          groups: [{ name: QUESTIONS_CHUNK, test: /src[\\/]data[\\/]questions\.json$/ }],
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    ...(previewHttps ? { https: previewHttps } : {}),
  },
  plugins: [
    iphoneUrlHelpPlugin(),
    appChunkSizeWarningPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      // index.html links favicon.svg and the apple-touch-icon; the plugin injects the manifest link.
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
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
        // PNGs generated from public/favicon.svg by `npm run generate:icons`.
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
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
