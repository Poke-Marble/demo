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
const { boardCells } = await import(
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
const setupSource = stripTypeScriptTypes(
  await readFile(new URL('./setup.ts', import.meta.url), 'utf8'),
);
const { createInitialRoster, startingPartners, isHumanTurn } = await import(
  `data:text/javascript,${encodeURIComponent(setupSource)}`
);
test('each starter produces one human and three computers with unique remaining partners', () => {
  for (const selected of startingPartners) {
    const roster = createInitialRoster(selected.id);
    assert.equal(roster.length, 4);
    assert.equal(roster[0].pokemonId, selected.id);
    assert.deepEqual(
      roster.map((p) => p.controller),
      ['human', 'computer', 'computer', 'computer'],
    );
    assert.deepEqual(
      roster.map((p) => p.name),
      ['나', 'COMPUTER 1', 'COMPUTER 2', 'COMPUTER 3'],
    );
    assert.equal(new Set(roster.map((p) => p.pokemonId)).size, 4);
    assert.equal(new Set(roster.map((p) => p.id)).size, 4);
  }
  assert.throws(() => createInitialRoster('pokemon:invalid'));
});
test('only the human active player in a playing game can act', () => {
  const roster = createInitialRoster(startingPartners[0].id);
  for (const p of roster)
    assert.equal(
      isHumanTurn({ phase: 'playing', activePlayerId: p.id }, roster),
      p.controller === 'human',
    );
  for (const phase of ['setup', 'finished'])
    assert.equal(
      isHumanTurn({ phase, activePlayerId: roster[0].id }, roster),
      false,
    );
  assert.equal(
    isHumanTurn({ phase: 'playing', activePlayerId: 'player:unknown' }, roster),
    false,
  );
});
