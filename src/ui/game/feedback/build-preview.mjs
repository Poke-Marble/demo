import { build } from 'vite';
await build({
  configFile: false,
  build: {
    outDir: 'dist/feedback-preview',
    rollupOptions: { input: 'feedback-preview.html' },
  },
});
