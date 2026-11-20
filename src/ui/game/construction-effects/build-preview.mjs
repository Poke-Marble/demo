import { build } from 'vite';

await build({
  build: {
    outDir: 'artifacts/construction-effects-preview',
    rollupOptions: { input: 'src/ui/game/construction-effects/preview.html' },
  },
});
