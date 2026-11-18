import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
const importTS = async (file) =>
  import(
    `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8')))}`
  );
const { boardCells } = await importTS('./presentation.ts');
const {
  tileGeometry,
  tileSilhouette,
  unproject,
  projectWorld,
  pawnFoot,
  depthOrder,
} = await importTS('./projection.ts');

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
test('32 tiles are contiguous around all four corners, including wraparound', () => {
  const { side, cells } = boardCells(32);
  assert.equal(side, 9);
  for (let i = 0; i < 32; i++) {
    const a = cells[i],
      b = cells[(i + 1) % 32];
    assert.equal(Math.abs(a.row - b.row) + Math.abs(a.column - b.column), 1);
    const g = tileGeometry(a, side);
    assert.ok(
      g.left > 0 &&
        g.left + g.width < 1000 &&
        g.top > 0 &&
        g.top + g.height + g.thickness < 720,
    );
  }
});
test('projection roundtrips fractional feet and sorts front objects after back ones', () => {
  for (const r of [0, 0.2, 4, 8])
    for (const c of [0, 0.7, 3, 8]) {
      const point = projectWorld(r, c, 9),
        world = unproject(point, 9);
      assert.ok(
        Math.abs(world.row - r) < 1e-10 && Math.abs(world.column - c) < 1e-10,
      );
      assert.ok(depthOrder(projectWorld(r + 0.1, c, 9)) > depthOrder(point));
    }
  const cell = { row: 5, column: 5 };
  assert.ok(
    depthOrder(pawnFoot(cell, 9, 3)) > depthOrder(pawnFoot(cell, 9, 0)),
  );
});
test('visible diamond and side hit silhouette stay aligned at 360/720/1200 px', () => {
  const { side, cells } = boardCells(32);
  for (const width of [360, 720, 1200])
    for (const cell of cells) {
      const g = tileGeometry(cell, side),
        scale = width / 1000;
      const polygon = tileSilhouette(g).map(([x, y]) => [
        (g.left + x) * scale,
        (g.top + y) * scale,
      ]);
      assert.ok(inside([g.x * scale, g.y * scale], polygon));
      assert.ok(
        inside(
          [g.x * scale, (g.y + g.height / 2 + g.thickness / 2) * scale],
          polygon,
        ),
      );
      assert.equal(
        inside([(g.left + 1) * scale, (g.top + 1) * scale], polygon),
        false,
        'bounding-box corner is not clickable',
      );
      const containing = cells.filter((c) => {
        const k = tileGeometry(c, side);
        return inside(
          [g.x, g.y],
          tileSilhouette(k).map(([x, y]) => [k.left + x, k.top + y]),
        );
      });
      assert.equal(containing.length, 1);
    }
});
test('four local Kenney assets match individual recorded checksums and license', async () => {
  const base = new URL('./assets/tiny-town/', import.meta.url);
  const credits = JSON.parse(
    await readFile(new URL('credits.json', base), 'utf8'),
  );
  assert.equal(credits.files.length, 4);
  for (const entry of credits.files) {
    assert.equal(entry.creator, 'Kenney');
    assert.equal(entry.license, 'CC0-1.0');
    assert.equal(
      createHash('sha256')
        .update(await readFile(new URL(entry.file, base)))
        .digest('hex'),
      entry.sha256,
    );
  }
  assert.match(
    await readFile(new URL('License.txt', base), 'utf8'),
    /Created\/distributed by Kenney/,
  );
});
