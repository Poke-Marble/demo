/* global structuredClone, document */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';
const load = async (name) =>
  import(
    `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(await readFile(new URL(name, import.meta.url), 'utf8')))}`
  );
const { createUpdateGate, walkingPath } = await load('./policy.ts');
const { createFeedbackAudio } = await load('./audio.ts');
test('stable update IDs dedupe clones; anonymous objects dedupe; reset accepts a new session', () => {
  const gate = createUpdateGate();
  const update = {
    id: 'roll:1',
    events: [{ type: 'dice-rolled', values: [2, 5] }],
  };
  assert.equal(gate.accept(update), update);
  assert.equal(gate.accept(structuredClone(update)), undefined);
  gate.reset();
  assert.equal(gate.accept(update), update);
  const anonymous = { events: update.events };
  assert.ok(gate.accept(anonymous));
  assert.equal(gate.accept(anonymous), undefined);
  const empty = { events: [] };
  assert.ok(gate.accept(empty));
  assert.equal(gate.accept(empty), undefined);
});
test('only forward valid walking waypoints; no repeated start, stationary or flight', () => {
  const tiles = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(walkingPath(['a', 'a', 'b', 'b', 'c'], 'a', tiles), [
    'b',
    'c',
  ]);
  assert.deepEqual(walkingPath(['d', 'a', 'b'], 'c', tiles), ['d', 'a', 'b']);
  assert.deepEqual(walkingPath(['a', 'a'], 'a', tiles), []);
  assert.deepEqual(walkingPath(['c'], 'a', tiles), []);
  assert.deepEqual(walkingPath(['missing', 'b'], 'a', tiles), ['b']);
  assert.deepEqual(walkingPath(['b'], undefined, tiles), []);
});
test('SFX lifecycle, shared settings, cached noise, voice bound and failures', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k),
    setItem: (k, v) => storage.set(k, v),
  };
  globalThis.document = { hidden: false };
  let contexts = 0,
    buffers = 0,
    sources = 0,
    active = 0,
    max = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect() {},
    disconnect() {},
    gain: param(),
    frequency: param(),
    Q: param(),
  });
  const source = () => {
    sources++;
    let started = false;
    return {
      ...node(),
      start() {
        started = true;
        active++;
        max = Math.max(max, active);
      },
      stop(at) {
        if (at === undefined && started) {
          active--;
          started = false;
        }
      },
      onended: null,
    };
  };
  globalThis.AudioContext = class {
    state = 'suspended';
    sampleRate = 8000;
    currentTime = 0;
    destination = {};
    constructor() {
      contexts++;
    }
    async resume() {
      this.state = 'running';
    }
    async close() {
      this.state = 'closed';
    }
    createBuffer(_channels, length) {
      buffers++;
      return { getChannelData: () => new Float32Array(length) };
    }
    createGain = node;
    createBiquadFilter = node;
    createOscillator = source;
    createBufferSource = source;
  };
  const bus = createFeedbackAudio();
  bus.play('dice');
  assert.equal(contexts, 0, 'no context before user unlock');
  assert.equal(await bus.unlock(), true);
  const observed = [];
  const unsubscribe = bus.subscribe((s) => observed.push(s));
  for (let i = 0; i < 20; i++) bus.play(i % 2 ? 'step' : 'dice');
  assert.equal(buffers, 1);
  assert.equal(sources, 40);
  assert.equal(max, 8);
  bus.setMuted(true);
  assert.equal(active, 0);
  bus.play('step');
  assert.equal(sources, 40);
  bus.setVolume(3);
  assert.equal(bus.getSettings().volume, 1);
  bus.setMuted(false);
  bus.play('step');
  assert.equal(active, 2);
  bus.stop();
  assert.equal(active, 0);
  document.hidden = true;
  bus.play('dice');
  assert.equal(active, 0);
  document.hidden = false;
  assert.equal(observed.at(-1).muted, false);
  unsubscribe();
  bus.destroy();
  assert.equal(await bus.unlock(), false);
  assert.equal(active, 0);
  const next = createFeedbackAudio();
  assert.deepEqual(next.getSettings(), { muted: false, volume: 1 });
  next.destroy();
  globalThis.AudioContext = class {
    constructor() {
      throw Error('audio denied');
    }
  };
  const failed = createFeedbackAudio();
  assert.equal(await failed.unlock(), false);
  assert.doesNotThrow(() => failed.play('dice'));
  failed.destroy();
});
