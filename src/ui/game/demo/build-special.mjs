import { build } from 'vite';

await build({
  configFile: false,
  build: {
    outDir: 'dist/special-event-preview',
    rollupOptions: { input: 'special-event-preview.html' },
  },
});
