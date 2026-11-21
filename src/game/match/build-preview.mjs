import { build } from 'vite';
await build({
  build: {
    outDir: 'artifacts/match-preview',
    rollupOptions: { input: ['index.html', 'src/game/match/preview.html'] },
  },
});
