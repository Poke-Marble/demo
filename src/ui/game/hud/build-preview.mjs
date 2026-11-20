import { build } from 'vite';
await build({
  configFile: false,
  build: {
    outDir: 'dist/player-hud',
    rollupOptions: { input: 'hud-preview.html' },
  },
});
