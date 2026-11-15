// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import { validateWebEnvironment } from './src/config/environments.js'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path' 
import { brand } from './src/config/brand.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateLegalPublication } from './config/validateLegalPublication.js'

export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))) };
  validateWebEnvironment(env);
  if (command === 'build') validateLegalPublication(fileURLToPath(new URL('./public/legal/', import.meta.url)),
    readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'));
  return {
  // Stabilize the CommonJS optimizer entry without requesting Excel at startup.
  optimizeDeps: { include: ['xlsx-js-style'] },
  plugins: [
    { name: 'global-brand', transformIndexHtml: html => html
      .replaceAll('__BRAND_NAME__', brand.name).replaceAll('__BRAND_LOGO__', brand.logo).replaceAll('__THEME_COLOR__', brand.themeColor) },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [brand.logo.slice(1)],
      workbox: {
        importScripts: ['/pwa-update-worker.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Excel is already lazy-loaded: avoid downloading 870 kB during the first PWA installation.
        globIgnores: ['**/xlsx*.js'],
        runtimeCaching: [{
          // Explicit retries use a new module identity, but the hashed asset is the same.
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/xlsx[^/]*\.js$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'migapos-excel-v1', expiration: { maxEntries: 2, maxAgeSeconds: 31536000, purgeOnQuotaError: true } },
        }]
      },
      
      manifest: {
        name: `${brand.name} - Sistema de Ventas`,
        short_name: brand.name,
        description: 'Punto de venta inteligente para negocios',
        theme_color: brand.themeColor,
        background_color: '#f8fafc',
        display: 'standalone', 
        
        start_url: '/', 
        
        launch_handler: {
          client_mode: "focus-existing"
        },

        icons: [
          {
            src: brand.icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: brand.icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  // Hosting CSP permits inline styles for React/toasts and printable layouts; scripts remain external (no unsafe-eval).
  // COOP same-origin-allow-popups preserves Firebase Google Auth's popup channel.
  resolve: {
    alias: {
      stream: path.resolve('./src/utils/empty.js'),
      fs: path.resolve('./src/utils/empty.js'),
      crypto: path.resolve('./src/utils/empty.js'),
    }
  }
  }
})
