import { build, createServer } from 'vite';
import process from 'node:process';
const config = {
  configFile: false,
  build: {
    outDir: 'artifacts/board-art-bundle',
    rollupOptions: { input: 'board-art-preview.html' },
  },
};
if (process.argv.includes('--build')) await build(config);
else {
  const server = await createServer({
    ...config,
    server: { host: '127.0.0.1', port: 5184, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}
