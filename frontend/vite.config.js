// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import { validateWebEnvironment } from './src/config/environments.js'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path' 
import { brand } from './src/config/brand.js'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_'))) };
  validateWebEnvironment(env);
  return {
  plugins: [
    { name: 'global-brand', transformIndexHtml: html => html
      .replaceAll('__BRAND_NAME__', brand.name).replaceAll('__BRAND_LOGO__', brand.logo).replaceAll('__THEME_COLOR__', brand.themeColor) },
    react(),
    VitePWA({
      registerType: 'prompt', 
      injectRegister: 'auto',
      
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: [brand.logo.slice(1)],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Excel is already lazy-loaded: avoid downloading 870 kB during the first PWA installation.
        globIgnores: ['**/xlsx*.js'],
        runtimeCaching: [{ urlPattern: /\/assets\/xlsx[^/]*\.js$/, handler: 'CacheFirst', options: { cacheName: 'migapos-excel-v1', expiration: { maxEntries: 2, maxAgeSeconds: 31536000, purgeOnQuotaError: true } } }]
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
