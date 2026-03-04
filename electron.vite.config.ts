import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        output: {
          entryFileNames: 'index.js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: {
          entryFileNames: 'index.js'
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: resolve('src/renderer'),
    build: {
      outDir: resolve('dist/renderer'),
      emptyOutDir: true
    }
  }
})