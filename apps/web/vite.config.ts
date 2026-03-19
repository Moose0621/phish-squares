import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@phish-squares/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      // Ensure all deps resolve React from the web app's local copy (19.x),
      // not the root workspace copy (18.x used by the API).
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  build: {
    target: 'es2020',
  },
})
