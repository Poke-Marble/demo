import { build } from 'vite';
await build({
  configFile: false,
  build: {
    outDir: 'dist/phaser-preview',
    rollupOptions: { input: 'phaser-preview.html' },
  },
});
