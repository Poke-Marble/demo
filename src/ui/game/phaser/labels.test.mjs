import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
const { tileNamePlate } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(await readFile(new URL('./labels-layout.ts', import.meta.url), 'utf8')))}`
);

test('nameplate corners stay inside the tile top on both front edges', () => {
  for (const x of [100, 500, 900]) {
    const tile = {
      x,
      y: 350,
      width: (800 / 9) * 0.96,
      height: (460 / 9) * 0.96,
    };
    const p = tileNamePlate(tile);
    for (const u of [0, 76])
      for (const v of [0, 16]) {
        const dx = p.x + p.a * u + p.c * v - tile.x;
        const dy = p.y + p.b * u + p.d * v - tile.y;
        assert.ok(
          Math.abs(dx) / (tile.width / 2) + Math.abs(dy) / (tile.height / 2) <=
            1,
        );
      }
    assert.ok(p.a * p.d - p.b * p.c > 0, 'text is never mirrored');
    assert.equal(Math.abs(p.b / p.a), tile.height / tile.width);
  }
});
