import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'chrome >= 38', 'safari >= 9', 'ios >= 9', 'not IE 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5002',
        changeOrigin: true,
      }
    }
  }
})
