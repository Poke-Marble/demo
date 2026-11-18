import { build, createServer, preview } from 'vite';
import process from 'node:process';
const config = {
  configFile: false,
  base: './',
  build: {
    outDir: 'artifacts/board-art-bundle',
    assetsInlineLimit: 0,
    rollupOptions: { input: 'board-art-preview.html' },
  },
};
if (process.argv.includes('--build')) await build(config);
else if (process.argv.includes('--serve-built')) {
  const server = await preview({
    ...config,
    preview: { host: '127.0.0.1', port: 5195, strictPort: true },
  });
  server.printUrls();
} else {
  const server = await createServer({
    ...config,
    server: { host: '127.0.0.1', port: 5184, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}
