import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'vite';
import { abilities } from '../../../game/abilities/activation.ts';

test('presenter FIFO, dedup, capacity, cancellation, replay, resize and unmount lifecycle (mock DOM)', async () => {
  // Bundle only the public component in memory; no browser or integration changes.
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'src/ui/game/abilities/presenter.ts', formats: ['es'] },
    },
  });
  const js = bundle[0].output.find((item) => item.type === 'chunk').code;
  const { createAbilityPresenter } = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
  );
  const saved = new Map();
  const replace = (name, value) => {
    saved.set(name, globalThis[name]);
    globalThis[name] = value;
  };
  const frames = new Map();
  const listeners = new Set();
  const observers = [];
  let frameId = 0;
  let rings = 0;
  let transforms = 0;
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => () => {
        if (name === 'arc') rings++;
        if (name === 'setTransform') transforms++;
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
    setAttribute() {}
    removeAttribute() {}
    getBoundingClientRect() {
      return { width: 500, height: 400 };
    }
    getContext() {
      return ctx;
    }
    remove() {
      this.removed = true;
    }
  }
  class Observer {
    disconnected = false;
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const reduced = { matches: false };
  replace('document', { createElement: () => new Element() });
  replace('window', {
    devicePixelRatio: 2,
    addEventListener: (name) => listeners.add(name),
    removeEventListener: (name) => listeners.delete(name),
  });
  replace('matchMedia', () => reduced);
  replace('ResizeObserver', Observer);
  replace('requestAnimationFrame', (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  replace('cancelAnimationFrame', (id) => frames.delete(id));
  const step = (time) => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  };
  const activation = (id, abilityId = 'overgrow') => ({
    id,
    playerId: 'player:a',
    pokemonId: abilities[abilityId].pokemonId,
    abilityId,
    type: abilities[abilityId].type,
    amount: 10,
    description: id,
  });
  const ends = [];
  try {
    const host = new Element();
    const p = createAbilityPresenter(host, {
      onEnd: (event, reason) => ends.push([event.id, reason]),
    });
    for (const id of Object.keys(abilities))
      assert.equal(p.enqueue(activation(id, id)), true);
    assert.equal(p.enqueue(activation('overgrow')), false);
    for (let i = 0; i < 4; i++) {
      step(1 + i * 2000);
      step(1201 + i * 2000);
    }
    assert.deepEqual(
      ends.map((e) => e[0]),
      Object.keys(abilities),
    );
    assert.equal(frames.size, 0);
    for (let i = 0; i < 16; i++)
      assert.equal(p.enqueue(activation(`q:${i}`)), true);
    assert.equal(p.enqueue(activation('overflow')), false);
    p.cancel();
    assert.equal(frames.size, 0);
    assert.equal(ends.filter((e) => e[1] === 'cancelled').length, 16);
    assert.equal(p.enqueue(activation('q:0')), false);
    reduced.matches = true;
    p.restart(activation('q:0'));
    step(10000);
    step(10500);
    assert.ok(rings > 0);
    observers[0].callback();
    assert.ok(transforms > 1);
    p.destroy();
    assert.equal(frames.size, 0);
    assert.equal(listeners.size, 0);
    assert.equal(observers[0].disconnected, true);
    assert.equal(p.element.removed, true);
    assert.equal(p.enqueue(activation('after-destroy')), false);
    p.restart(activation('after-destroy'));
    assert.equal(frames.size, 0);
    const again = createAbilityPresenter(host);
    again.enqueue(activation('overgrow'));
    again.destroy();
    assert.equal(frames.size, 0);
    assert.equal(observers[1].disconnected, true);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
