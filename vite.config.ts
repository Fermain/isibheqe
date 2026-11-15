import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const RESULTS = resolve(import.meta.dirname, 'check-sheet.results.json');

/**
 * Dev server only: check-sheet.html keeps its ticks and notes in a JSON file
 * beside the code, so they survive a reload and can be read back later.
 */
const checkSheetResults: Plugin = {
  name: 'check-sheet-results',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__check-sheet', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          await writeFile(RESULTS, JSON.stringify(JSON.parse(body), null, 2) + '\n');
          res.end('{"ok":true}');
        } catch {
          res.statusCode = 400;
          res.end('{"ok":false}');
        }
        return;
      }
      res.end(await readFile(RESULTS, 'utf8').catch(() => '{}'));
    });
  },
};

// Four static pages. Relative base so the built site works from any folder.
export default defineConfig({
  base: './',
  plugins: [checkSheetResults],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        learn: resolve(import.meta.dirname, 'learn.html'),
        about: resolve(import.meta.dirname, 'about.html'),
        arrange: resolve(import.meta.dirname, 'arrange.html'),
      },
    },
  },
});
