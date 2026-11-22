/* global URL */
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const moduleURL = (text) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(text)).replaceAll("'", '%27')}`;
const card = moduleURL(
  await readFile(
    new URL('../events/flight-picker/card.ts', import.meta.url),
    'utf8',
  ),
);
const source = (
  await readFile(new URL('./board-flight.ts', import.meta.url), 'utf8')
)
  .replace("from '../events/flight-picker/card'", `from '${card}'`)
  .replace("import './board-flight.css';", '');
const { createBoardFlight } = await import(moduleURL(source));
class Element {
  children = [];
  dataset = {};
  attributes = {};
  disabled = false;
  constructor(tag) {
    this.tag = tag;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  append(...items) {
    for (const item of items) {
      item.parent = this;
      this.children.push(item);
    }
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  remove() {
    this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  querySelectorAll() {
    return this.children.flatMap((c) => [
      ...(c.tag === 'button' ? [c] : []),
      ...c.querySelectorAll(),
    ]);
  }
  click() {
    if (!this.disabled) this.onclick?.();
  }
}
const selection = {
  id: 'session:revision:1',
  playerId: 'player:1',
  cancellable: true,
  destinations: [
    {
      tileId: 'tile:a',
      label: '도시 A',
      metadata: {
        kind: 'city',
        ownership: 'opponent',
        ownerType: '풀',
        toll: 37,
      },
    },
  ],
};
function fixture() {
  const listeners = new Set();
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const root = new Element('section');
  const f = createBoardFlight(root, () => {});
  const button = (text) =>
    root.querySelectorAll().find((b) => b.textContent === text);
  const escape = () => {
    for (const fn of listeners)
      fn({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
  };
  return { f, root, button, escape, listeners };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test('inspection and legal candidate never submit; explicit confirmation is single flight', async () => {
  const { f, button } = fixture();
  const calls = [];
  let finish;
  f.set(selection, (...args) => {
    calls.push(args);
    return new Promise((r) => {
      finish = r;
    });
  });
  f.inspect('tile:a');
  assert.equal(f.candidate, undefined);
  assert.equal(f.pick('tile:illegal'), false);
  f.pick('tile:a');
  assert.equal(calls.length, 0);
  button('목적지 확정').click();
  button('목적지 확정').click();
  assert.deepEqual(calls, [[selection.id, 'tile:a']]);
  finish();
  await tick();
  assert.equal(f.selection, undefined);
  f.destroy();
});
test('same snapshot preserves candidate; revision/session metadata replacement invalidates old handlers', async () => {
  const { f, root } = fixture();
  let finish;
  f.set(
    selection,
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  f.pick('tile:a');
  f.set(JSON.parse(JSON.stringify(selection)), () => {});
  assert.equal(f.candidate, 'tile:a');
  const old = root
    .querySelectorAll()
    .find((b) => b.dataset.tileId === 'tile:a');
  root
    .querySelectorAll()
    .find((b) => b.textContent === '목적지 확정')
    .click();
  const next = { ...selection, id: 'new-session:0' };
  f.set(next, () => {});
  old.click();
  assert.equal(f.candidate, undefined);
  f.pick('tile:a');
  finish();
  await tick();
  assert.equal(f.selection.id, next.id);
  assert.equal(f.candidate, 'tile:a');
  f.invalidate({
    ...next,
    destinations: [
      { ...next.destinations[0], metadata: { kind: 'city', toll: 38 } },
    ],
  });
  assert.equal(f.selection, undefined);
  f.destroy();
});
test('Escape honors cancellability and input lock, destroy removes listener', async () => {
  const { f, escape, listeners } = fixture();
  const calls = [];
  f.set({ ...selection, cancellable: false }, (...args) => {
    calls.push(args);
  });
  f.pick('tile:a');
  escape();
  assert.equal(f.candidate, undefined);
  assert.equal(calls.length, 0);
  f.set(selection, (...args) => {
    calls.push(args);
  });
  f.lock(true);
  escape();
  assert.equal(calls.length, 0);
  f.lock(false);
  escape();
  await tick();
  assert.deepEqual(calls, [[selection.id, null]]);
  f.destroy();
  assert.equal(listeners.size, 0);
});
test('rejected authoritative submission allows deliberate retry', async () => {
  const { f, button } = fixture();
  let calls = 0;
  f.set(selection, () => {
    calls++;
    if (calls === 1) throw Error('retry');
  });
  f.pick('tile:a');
  button('목적지 확정').click();
  await tick();
  assert.equal(button('목적지 확정').disabled, false);
  button('목적지 확정').click();
  await tick();
  assert.equal(calls, 2);
  assert.equal(f.selection, undefined);
  f.destroy();
});
