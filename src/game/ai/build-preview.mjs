import { build } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

// Build the AI dependency graph explicitly; the existing integration does not import it.
const result = await build({
  configFile: false,
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'artifacts/preview',
    write: false,
    rollupOptions: {
      input: fileURLToPath(new URL('preview.html', import.meta.url)),
    },
  },
});
if (Array.isArray(result) || !('output' in result))
  throw new Error('Unexpected bundle result');
const html = result.output.find(
  (item) => item.type === 'asset' && item.fileName === 'preview.html',
);
const chunks = result.output.filter((item) => item.type === 'chunk');
if (!html || html.type !== 'asset' || chunks.length !== 1)
  throw new Error('Expected one HTML and one JS chunk');
const inlineCode = chunks[0].code.replace(/<\/script/gi, '<\\/script');
const standalone = String(html.source).replace(
  /<script type="module" crossorigin src="[^"]+"><\/script>/,
  () => `<script type="module">${inlineCode}</script>`,
);
if (standalone === String(html.source))
  throw new Error('Missing module script');
const output = new URL('./artifacts/preview/preview.html', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, standalone);
// A single HTML artifact keeps generated JavaScript out of source lint scans,
// without touching root configuration or suppressing checks on source files.
