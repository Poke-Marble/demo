import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source)).replaceAll("'", '%27')}`;
const queueURL = moduleURL(
  await readFile(new URL('./queue.ts', import.meta.url), 'utf8'),
);
const { createSpecialEventPresenter } = await import(
  moduleURL(
    (await readFile(new URL('./presenter.ts', import.meta.url), 'utf8'))
      .replaceAll("from './queue'", `from '${queueURL}'`)
      .replace("import './special-events.css';", ''),
  )
);

// Deliberately small DOM double: verifies handler/lifecycle behavior, not browser
// rendering, native dialog focus trapping or accessibility implementation.
class Element {
  children = [];
  parent = null;
  attributes = new Map();
  dataset = {};
  disabled = false;
  style = { setProperty() {} };
  classList = { toggle() {} };
  constructor(tag) {
    this.tag = tag;
  }
  get isConnected() {
    return !!this.parent || this.tag === 'root';
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
    this.parent = null;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  focus() {
    if (!this.disabled) globalThis.document.activeElement = this;
  }
  querySelectorAll() {
    return this.children.flatMap((child) => [
      ...(child.tag === 'button' ? [child] : []),
      ...child.querySelectorAll(),
    ]);
  }
  querySelector() {
    return this.querySelectorAll().find((child) => !child.disabled);
  }
}
function fixture(reduced = false) {
  globalThis.HTMLElement = Element;
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    activeElement: null,
  };
  const media = new globalThis.EventTarget();
  media.matches = reduced;
  globalThis.matchMedia = () => media;
  const root = new Element('root');
  const locks = [];
  const presenter = createSpecialEventPresenter({
    root,
    lock: (value) => locks.push(value),
    describe: () => ({
      playerName: '나',
      partnerName: '피카츄',
      destinationName: '방울탑',
    }),
  });
  return { root, locks, presenter, media };
}
const fly = {
  id: 'fly',
  type: 'fly',
  playerId: 'player:1',
  from: 'tile:0',
  to: 'tile:16',
};
const trial = {
  id: 'trial',
  type: 'trial-intro',
  legendary: 'ho-oh',
  playerId: 'player:1',
  tileId: 'tile:16',
};
const selection = {
  id: 'select',
  playerId: 'player:1',
  cancellable: true,
  destinations: [{ tileId: 'tile:16', label: '방울탑' }],
};
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const buttons = (root) => root.querySelectorAll('button');

test('presentation phases finish at 2600ms, remove the modal, and retain zero rule callbacks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { presenter, root, locks } = fixture();
  const pending = presenter.enqueue([fly]);
  await tick();
  assert.equal(root.children[0].dataset.phase, '0');
  t.mock.timers.tick(338);
  assert.equal(root.children[0].dataset.phase, '1');
  t.mock.timers.tick(442);
  assert.equal(root.children[0].dataset.phase, '2');
  t.mock.timers.tick(1196);
  assert.equal(root.children[0].dataset.phase, '3');
  t.mock.timers.tick(624);
  await pending;
  assert.equal(root.children.length, 0);
  assert.deepEqual(locks, [true, false]);
});

test('keyboard skip advances flight to trial once and reset removes every timer/modal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { presenter, root } = fixture();
  const pending = presenter.enqueue([fly, trial]);
  await tick();
  root.children[0].onkeydown({ key: 'Enter', preventDefault() {} });
  await tick();
  assert.equal(root.children[0].dataset.eventId, 'trial');
  presenter.reset();
  await pending;
  t.mock.timers.tick(10000);
  assert.equal(root.children.length, 0);
});

test('reduced-motion uses a static landing summary and finishes in 120ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { presenter, root } = fixture(true);
  const pending = presenter.enqueue([fly]);
  await tick();
  assert.equal(root.children[0].dataset.phase, '3');
  const stage = root.children[0].children[0];
  assert.match(stage.children.at(-1).textContent, /방울탑 도착/);
  t.mock.timers.tick(120);
  await pending;
  assert.equal(root.children.length, 0);
});

test('confirmation is explicit and double activation dispatches only once while awaiting integration', async () => {
  const { presenter, root } = fixture();
  const calls = [];
  let release;
  presenter.select(selection, (...args) => {
    calls.push(args);
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const [destination, confirm] = buttons(root);
  assert.equal(confirm.disabled, true);
  destination.onclick();
  assert.equal(calls.length, 0);
  confirm.onclick();
  confirm.onclick();
  assert.deepEqual(calls, [['select', 'tile:16']]);
  assert.ok(buttons(root).every((button) => button.disabled));
  release();
  await tick();
  assert.equal(root.children.length, 0);
});

test('Esc cancels once; noncancellable prompts block it; stale async completion cannot close replacement', async () => {
  const { presenter, root } = fixture();
  const calls = [];
  let release;
  presenter.select(selection, (...args) => {
    calls.push(args);
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  root.children[0].oncancel({ preventDefault() {} });
  root.children[0].oncancel({ preventDefault() {} });
  assert.deepEqual(calls, [['select', null]]);
  presenter.select(
    { ...selection, id: 'new', cancellable: false },
    (...args) => {
      calls.push(args);
    },
  );
  release();
  await tick();
  assert.equal(root.children.length, 1);
  root.children[0].oncancel({ preventDefault() {} });
  assert.equal(calls.length, 1);
  presenter.destroy();
  assert.equal(root.children.length, 0);
});

test('integration rejection keeps selection retryable and destroy cleans a pending choice', async () => {
  const { presenter, root } = fixture();
  let attempts = 0;
  presenter.select(selection, async () => {
    attempts++;
    throw new Error('다시 선택하세요');
  });
  buttons(root)[0].onclick();
  buttons(root)[1].onclick();
  await tick();
  assert.equal(buttons(root)[1].disabled, false);
  assert.match(root.children[0].children[3].textContent, /다시 선택/);
  buttons(root)[1].onclick();
  await tick();
  assert.equal(attempts, 2);
  presenter.destroy();
  assert.equal(root.children.length, 0);
});
