import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
const sourceURL = (source) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const projectionURL = sourceURL(
  stripTypeScriptTypes(
    await readFile(new URL('../projection.ts', import.meta.url), 'utf8'),
  ),
);
const load = async (path) =>
  import(
    sourceURL(
      stripTypeScriptTypes(
        await readFile(new URL(path, import.meta.url), 'utf8'),
      ).replace("from '../projection'", `from '${projectionURL}'`),
    )
  );
const { standingFoot, pawnDepth } = await load('./occlusion.ts');
const { boardCells } = await load('../presentation.ts');
const { tileGeometry, pawnFoot, depthOrder } = await load('../projection.ts');
const { modelPlacement } = await load('../art/model-geometry.ts');
const { side, cells } = boardCells(32);

test('both trial scenes keep all four feet inside their tile and in front of their model', () => {
  for (const special of ['lugia-trial', 'ho-oh-trial']) {
    // Every board edge/corner, including the current trial indices 8 and 16.
    for (let i = 0; i < cells.length; i++) {
      const g = tileGeometry(cells[i], side);
      const model = modelPlacement(g);
      const feet = Array.from({ length: 4 }, (_, seat) =>
        standingFoot(
          { kind: 'special', special },
          g,
          seat,
          pawnFoot(cells[i], side, seat),
        ),
      );
      assert.equal(new Set(feet.map((p) => p.x)).size, 4);
      for (const p of feet) {
        assert.ok(
          Math.abs(p.x - g.x) / (g.width / 2) +
            Math.abs(p.y - g.y) / (g.height / 2) <=
            1,
        );
        assert.ok(
          pawnDepth(p).shadow > depthOrder({ x: g.x, y: model.depthY }),
        );
        assert.equal(pawnDepth(p).sprite, pawnDepth(p).shadow + 1);
      }
      const foreground = modelPlacement({ ...g, y: g.y + 230 / side });
      assert.ok(
        feet.every(
          (p) =>
            pawnDepth(p).sprite < depthOrder({ x: g.x, y: foreground.depthY }),
        ),
        'a foreground tile still draws in front',
      );
      const sorted = [...feet].sort((a, b) => a.x - b.x);
      assert.ok(
        sorted.slice(1).every((p, j) => p.x - sorted[j].x >= 16),
        'four silhouettes have distinct lateral space',
      );
    }
  }
});

test('ordinary cities, landmarks, flight and start retain the exact old seat coordinates', () => {
  for (const tile of [
    { kind: 'city' },
    { kind: 'landmark', special: 'ho-oh-trial' },
    { kind: 'special', special: 'fly' },
    { kind: 'start' },
  ]) {
    for (const cell of cells)
      for (let seat = 0; seat < 4; seat++) {
        const g = tileGeometry(cell, side),
          p = pawnFoot(cell, side, seat);
        const old = {
          x: g.x + (p.x - g.x) * 1.55,
          y: g.y + (p.y - g.y) * 1.55,
        };
        assert.equal(standingFoot(tile, g, seat, old), old);
      }
  }
});

test('walking and flight always sort at interpolated ground contact without a depth jump', () => {
  const start = { x: 300, y: 280 },
    end = { x: 350, y: 330 };
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    const foot = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
    assert.equal(pawnDepth(foot).shadow, depthOrder(foot));
    assert.equal(pawnDepth(foot).sprite, depthOrder(foot) + 1);
  }
});
