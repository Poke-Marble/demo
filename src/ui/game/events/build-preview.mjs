import { build } from 'vite';
// Separate bundle: does not change the application's root build configuration.
await build({
  build: {
    outDir: 'artifacts/legendary-bundle',
    rollupOptions: {
      input: 'legendary-visual-preview.html',
    },
  },
});
