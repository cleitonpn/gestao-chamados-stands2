import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
  },
  server: {
    historyApiFallback: true,
    host: '0.0.0.0',
    port: 4000,
  },
  preview: {
    historyApiFallback: true,
    allowedHosts: 'all',
    host: '0.0.0.0',
    port: 4000,
  },
  define: {
    'process.env.VITE_APP_DOMAIN': JSON.stringify(process.env.VITE_APP_DOMAIN || 'sistemastands.com.br'),
    'process.env.VITE_APP_ENVIRONMENT': JSON.stringify(process.env.VITE_APP_ENVIRONMENT || 'production'),
  },
})
