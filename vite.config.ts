/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mansion Impossible',
        short_name: 'Mansion Impossible',
        description: 'A browser-based 3D builder for designing fantasy super mansions.',
        display: 'standalone',
        // Icons come later, generated from one source drawing (DESIGN.md).
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,glb,gltf}'],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
