import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three static pages. Relative base so the built site works from any folder.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        learn: resolve(import.meta.dirname, 'learn.html'),
        about: resolve(import.meta.dirname, 'about.html'),
      },
    },
  },
});
