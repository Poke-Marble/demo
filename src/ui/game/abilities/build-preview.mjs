// Dedicated entry without changing root Vite config or the integration entry.
import { build } from 'vite';
await build({
  build: {
    outDir: 'src/ui/game/abilities/preview-bundle',
    rollupOptions: { input: 'ability-preview.html' },
  },
});
