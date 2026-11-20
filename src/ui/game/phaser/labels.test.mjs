import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
const { layoutLabels } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(await readFile(new URL('./labels-layout.ts', import.meta.url), 'utf8')))}`
);

test('crowded full names keep identity, fit the screen, and separate when space exists', () => {
  const points = Array.from({ length: 12 }, (_, i) => ({
    id: `tile:${i}`,
    x: 280 + (i % 3) * 5,
    y: 150 + Math.floor(i / 3) * 3,
    width: 95,
    height: 24,
  }));
  const boxes = layoutLabels(points, 868, 625);
  assert.deepEqual(
    boxes.map((b) => b.id),
    points.map((p) => p.id),
  );
  assert.deepEqual(
    layoutLabels(points, 868, 625),
    boxes,
    'layout is deterministic',
  );
  for (const [i, a] of boxes.entries()) {
    assert.ok(
      a.left >= 0 &&
        a.top >= 0 &&
        a.left + a.width <= 868 &&
        a.top + a.height <= 625,
    );
    for (const b of boxes.slice(i + 1))
      assert.ok(
        a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top,
        `${a.id}/${b.id} overlap`,
      );
  }
});

test('focused long Korean label stays inside narrow viewport at a camera edge', () => {
  for (const x of [0, 181, 361]) {
    const [box] = layoutLabels(
      [{ id: 'special', x, y: 258, width: 220, height: 28 }],
      362,
      260,
    );
    assert.ok(box.left >= 0 && box.left + box.width <= 362);
    assert.ok(box.top >= 0 && box.top + box.height <= 260);
  }
  assert.deepEqual(layoutLabels([], 362, 260), []);
});
