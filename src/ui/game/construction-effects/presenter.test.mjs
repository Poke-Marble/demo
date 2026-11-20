import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'vite';

test('FIFO, duration, reduced motion, DPR resize, anchor validation, particle cap and teardown release waits', async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'src/ui/game/construction-effects/presenter.ts',
        formats: ['es'],
      },
    },
  });
  const output = bundle[0].output.find((x) => x.type === 'chunk').code;
  const { createConstructionPresenter, MAX_PARTICLES } = await import(
    `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  );
  assert.equal(MAX_PARTICLES, 48);
  const saved = new Map();
  const frames = new Map();
  const listeners = new Map();
  const observers = [];
  let id = 0,
    transforms = 0,
    glyphs = 0;
  const translations = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) => {
          if (name === 'setTransform') transforms++;
          if (name === 'translate') translations.push(args);
          if (name === 'stroke') glyphs++;
          if (name === 'createLinearGradient') return { addColorStop() {} };
        },
    },
  );
  class Element {
    children = [];
    hidden = false;
    removed = false;
    style = { setProperty() {} };
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    setAttribute() {}
    getContext() {
      return ctx;
    }
    getBoundingClientRect() {
      return { width: 500, height: 400 };
    }
    remove() {
      this.removed = true;
    }
  }
  const add = (key, fn) => listeners.set(key, fn);
  const remove = (key) => listeners.delete(key);
  const reduced = {
    matches: false,
    addEventListener: (_, fn) => add('motion', fn),
    removeEventListener: () => remove('motion'),
  };
  const replace = (key, value) => {
    saved.set(key, globalThis[key]);
    globalThis[key] = value;
  };
  replace('document', {
    hidden: false,
    createElement: () => new Element(),
    addEventListener: add,
    removeEventListener: remove,
  });
  replace('window', {
    devicePixelRatio: 3,
    addEventListener: add,
    removeEventListener: remove,
  });
  replace('matchMedia', () => reduced);
  replace(
    'ResizeObserver',
    class {
      disconnected = false;
      constructor(fn) {
        this.callback = fn;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  );
  replace('requestAnimationFrame', (fn) => {
    frames.set(++id, fn);
    return id;
  });
  replace('cancelAnimationFrame', (n) => frames.delete(n));
  let clock = 0;
  replace('performance', { now: () => clock });
  const tick = async (time) => {
    clock = time;
    const pending = [...frames.values()];
    frames.clear();
    for (const fn of pending) fn(time);
    await Promise.resolve();
  };
  const cue = {
    id: '1',
    tileId: 'tile:1',
    kind: 'purchase',
    type: 'grass',
    color: '#68d883',
    ownerName: 'P',
    placeName: '도시',
    facilityName: '',
    defense: '',
  };
  try {
    const host = new Element();
    let sounds = 0;
    const presenter = createConstructionPresenter(host, {
      audio: {
        playConstruction() {
          sounds++;
        },
        stop() {},
      },
      anchor: () => ({ x: -100, y: 50 }),
    });
    let ended = false;
    const run = presenter
      .present([cue, { ...cue, kind: 'final' }])
      .then(() => (ended = true));
    await tick(350);
    assert.deepEqual(translations[0], [250, 172]);
    assert.ok(glyphs <= 25);
    assert.equal(host.children[0].children[0].width, 1000, 'DPR capped at 2');
    await tick(700);
    assert.equal(ended, false);
    assert.equal(sounds, 2);
    await tick(2499);
    assert.equal(ended, false);
    await tick(2500);
    await run;
    assert.equal(ended, true);
    assert.equal(frames.size, 0);
    observers[0].callback();
    assert.ok(transforms >= 3);
    const cancelled = presenter.present([cue, cue]);
    presenter.cancel();
    await cancelled;
    assert.equal(frames.size, 0);
    const motion = presenter.present([cue]);
    reduced.matches = true;
    listeners.get('motion')();
    await motion;
    assert.equal(frames.size, 0);
    const quiet = presenter.present([cue]);
    await tick(2680);
    await quiet;
    assert.equal(sounds, 4, 'reduced motion is silent');
    const destroyed = presenter.present([cue, cue]);
    presenter.destroy();
    await destroyed;
    assert.equal(frames.size, 0);
    assert.equal(listeners.size, 0);
    assert.ok(observers[0].disconnected);
    assert.ok(host.children[0].removed);
    await presenter.present([cue]);
    assert.equal(frames.size, 0);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
