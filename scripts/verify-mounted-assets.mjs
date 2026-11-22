import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../src/ui/game/events/mounted/assets/', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
for (const file of manifest.files) {
  const data = await readFile(new URL(file.path, root));
  assert.equal(
    createHash('sha256').update(data).digest('hex'),
    file.sha256,
    file.path,
  );
  assert.ok(file.url.includes(manifest.revision));
}
const credits = await readFile(
  new URL('sprite/0823/credits.txt', root),
  'utf8',
);
assert.match(credits, /229131140903075840>\tCUR\tCC_BY-NC_4\t.*Hover/);
assert.deepEqual(
  manifest.animations.map((a) => a.name),
  ['Hover', 'Idle'],
);
console.log(
  `Verified ${manifest.files.length} original mounted-flight files at ${manifest.revision}`,
);
