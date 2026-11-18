import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import process from "node:process";

// Optional pre-merge preview: foundation is read-only, all Vite cache stays here.
// node src/ui/game/demo/preview.mjs <foundation-worktree>
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const foundation = resolve(process.argv[2] || root);
const viteEntry = resolve(foundation, "node_modules/vite/dist/node/index.js");
if (!existsSync(viteEntry))
  throw new Error("기반 워크트리의 Vite 설치가 필요합니다.");
const { createServer } = await import(pathToFileURL(viteEntry).href);
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "src/ui/game/demo/.cache"),
  plugins: [
    {
      name: "read-only-foundation-preview",
      resolveId(source, importer) {
        if (!importer || !importer.startsWith(root) || foundation === root)
          return;
        if (source === "../../assets/sprites")
          return resolve(foundation, "src/assets/sprites.ts");
        if (source === "../../../data/sample-map")
          return resolve(foundation, "src/data/sample-map.ts");
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    fs: { allow: [root, foundation] },
  },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
