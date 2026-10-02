// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path' 

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', 
      injectRegister: 'auto',
      
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['vite.svg'], 
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'] 
      },
      
      manifest: {
        name: 'MigaPOS - Sistema de Ventas',
        short_name: 'MigaPOS',
        description: 'Punto de venta inteligente para negocios',
        theme_color: '#341b3a',
        background_color: '#f8fafc',
        display: 'standalone', 
        
        /* 🚀 FIX VITAL: Chrome Android exige esto para permitir la instalación */
        start_url: '/', 
        
        launch_handler: {
          client_mode: "focus-existing"
        },

        icons: [
          {
            src: '/img/Logo_192.png', 
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/img/Logo_512.png', 
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      stream: path.resolve('./src/utils/empty.js'),
      fs: path.resolve('./src/utils/empty.js'),
      crypto: path.resolve('./src/utils/empty.js'),
    }
  }
})