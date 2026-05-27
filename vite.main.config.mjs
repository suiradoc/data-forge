import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'electron-store', 'parquetjs-lite', 'child_process', 'fs', 'os', 'path'],
    },
  },
});
