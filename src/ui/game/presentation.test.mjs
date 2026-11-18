import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(
  new URL('./presentation.ts', import.meta.url),
  'utf8',
);
const compiled = stripTypeScriptTypes(source);
const { boardCells, validateLobby } = await import(
  `data:text/javascript,${encodeURIComponent(compiled)}`
);
test('all 1–80 tile maps occupy unique square perimeter cells', () => {
  for (let count = 1; count <= 80; count++) {
    const { side, cells } = boardCells(count);
    assert.equal(cells.length, count);
    assert.equal(new Set(cells.map((c) => `${c.row},${c.column}`)).size, count);
    for (const c of cells)
      assert.ok(
        c.row === 1 || c.row === side || c.column === 1 || c.column === side,
      );
  }
});
test('lobby accepts 2–4 unique partners and rejects blank names or duplicates', () => {
  const players = Array.from({ length: 4 }, (_, i) => ({
    name: `P${i}`,
    pokemonId: String(i),
  }));
  for (const count of [2, 3, 4])
    assert.equal(validateLobby(players.slice(0, count)), null);
  assert.ok(validateLobby(players.slice(0, 1)));
  assert.ok(validateLobby([...players, players[0]]));
  assert.ok(validateLobby([{ ...players[0], name: ' ' }, players[1]]));
  assert.ok(validateLobby([players[0], players[0]]));
});
