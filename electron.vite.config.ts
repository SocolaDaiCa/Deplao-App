import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // package.json is "type":"module" → electron-vite would emit ESM (.mjs). Electron preload runs as a script, not an ES module — use CJS + require('electron').
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [vue()],
  },
})
