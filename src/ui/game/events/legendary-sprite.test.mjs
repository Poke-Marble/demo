import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
const manifest = JSON.parse(
  await readFile(new URL('./assets/manifest.json', import.meta.url)),
);
const source = (
  await readFile(new URL('./legendary-sprite.ts', import.meta.url), 'utf8')
)
  .replace(
    "import manifest from './assets/manifest.json';",
    `const manifest = ${JSON.stringify(manifest)};`,
  )
  .replace(
    /const urls = import.meta.glob<string>\([\s\S]*?\n\}\);/,
    'const urls = {};',
  );
const { createLegendarySprite } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`
);
function fixture() {
  const images = [],
    draws = [],
    callbacks = new Map();
  let serial = 0;
  class ImageDouble {
    constructor() {
      images.push(this);
    }
    decode() {
      return this.decoding ?? Promise.resolve();
    }
  }
  globalThis.Image = ImageDouble;
  globalThis.document = {
    createElement: (tag) => ({
      tag,
      hidden: false,
      dataset: {},
      children: [],
      setAttribute() {},
      append(...c) {
        this.children.push(...c);
      },
      getContext: () => ({
        clearRect() {},
        drawImage(...args) {
          draws.push(args);
        },
      }),
    }),
  };
  globalThis.requestAnimationFrame = (cb) => {
    callbacks.set(++serial, cb);
    return serial;
  };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  return {
    images,
    draws,
    callbacks,
    render(now = 0) {
      const cb = callbacks.values().next().value;
      callbacks.clear();
      cb?.(now);
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test('uses XML W-row and one cell; phase switches Hover/Attack/Idle without whole-sheet display', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('lugia', false);
  f.images.forEach((i) => i.onload());
  await flush();
  f.render();
  assert.equal(sprite.element.dataset.state, 'ready');
  assert.deepEqual(f.draws.at(-1).slice(2, 5), [6 * 96, 80, 96]);
  sprite.phase(2);
  f.render();
  assert.equal(sprite.element.dataset.animation, 'Attack');
  assert.deepEqual(f.draws.at(-1).slice(2, 5), [6 * 112, 104, 112]);
  sprite.phase(3);
  f.render();
  assert.equal(sprite.element.dataset.animation, 'Idle');
  sprite.dispose();
  assert.equal(f.callbacks.size, 0);
});
test('decode completing after disposal cannot expose pixels or schedule animation', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('ho-oh', false);
  let release;
  f.images[1].decoding = new Promise((r) => {
    release = r;
  });
  f.images[1].onload();
  sprite.dispose();
  release();
  await flush();
  assert.equal(sprite.element.dataset.state, 'loading');
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.draws.length, 0);
  assert.ok(f.images.every((i) => i.onload === null && i.onerror === null));
});
test('failure displays explicit small text; a subsequent successful late decode can recover only while live', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('lugia', false);
  f.images[1].onerror();
  assert.equal(sprite.element.dataset.state, 'failed');
  assert.equal(sprite.element.children[0].hidden, true);
  f.images[1].onload();
  await flush();
  f.render();
  assert.equal(sprite.element.dataset.state, 'ready');
  sprite.dispose();
});
test('reduced motion decodes Idle once without requesting animation frames', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('ho-oh', true);
  f.images[2].onload();
  await flush();
  assert.equal(sprite.element.dataset.animation, 'Idle');
  assert.equal(f.callbacks.size, 0);
  sprite.phase(2);
  assert.equal(sprite.element.dataset.animation, 'Idle');
  sprite.dispose();
});

test('flight reuses the east-facing Hover cells through arrival and disposes its RAF', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('ho-oh', false, true);
  f.images.forEach((i) => i.onload());
  await flush();
  f.render();
  assert.equal(sprite.element.dataset.animation, 'Hover');
  assert.deepEqual(f.draws.at(-1).slice(2, 5), [2 * 112, 72, 112]);
  sprite.phase(2);
  sprite.phase(3);
  f.render();
  assert.equal(sprite.element.dataset.animation, 'Hover');
  sprite.dispose();
  assert.equal(f.callbacks.size, 0);
});

test('reduced flight draws a single east-facing Hover frame without motion', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('ho-oh', true, true);
  f.images[1].onload();
  await flush();
  assert.equal(sprite.element.dataset.animation, 'Hover');
  assert.deepEqual(f.draws.at(-1).slice(1, 5), [0, 2 * 112, 72, 112]);
  assert.equal(f.callbacks.size, 0);
  sprite.dispose();
});

test('slow images reach explicit fallback at 1800ms and disposal clears the remaining work', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(),
    sprite = createLegendarySprite('lugia', false);
  t.mock.timers.tick(1799);
  assert.equal(sprite.element.dataset.state, 'loading');
  t.mock.timers.tick(1);
  assert.equal(sprite.element.dataset.state, 'failed');
  assert.equal(sprite.element.children[0].hidden, true);
  sprite.dispose();
  assert.equal(f.callbacks.size, 0);
});

test('decode rejection keeps the sprite hidden and reports failure', async () => {
  const f = fixture(),
    sprite = createLegendarySprite('ho-oh', false);
  f.images[1].decoding = Promise.reject(new Error('decode failed'));
  f.images[1].onload();
  await flush();
  assert.equal(sprite.element.dataset.state, 'failed');
  assert.equal(sprite.element.children[0].hidden, true);
  sprite.dispose();
});
