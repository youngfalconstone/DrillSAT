import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          resolve: { alias: { '@shared': path.resolve(__dirname, 'src/shared') } },
          build: { outDir: 'dist-electron', rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: { outDir: 'dist-electron', rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } } },
        },
      },
      renderer: {},
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
});
