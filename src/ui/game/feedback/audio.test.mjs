/* global document */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackAudio } from './audio.ts';

test('construction shares stored mute/volume, one unlocked context, capped voices and stop/destroy', async () => {
  const saved = new Map(
    ['AudioContext', 'document', 'localStorage'].map((key) => [
      key,
      globalThis[key],
    ]),
  );
  const nodes = [];
  let contexts = 0;
  const storage = new Map([
    ['pm:sfx:v1', JSON.stringify({ muted: true, volume: 0.2 })],
  ]);
  const peaks = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime(value) {
      peaks.push(value);
    },
  });
  class Node {
    ended = false;
    disconnected = false;
    onended = null;
    frequency = parameter();
    gain = parameter();
    constructor() {
      nodes.push(this);
    }
    connect() {}
    start() {}
    stop(at) {
      if (at === undefined) this.ended = true;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  globalThis.document = { hidden: false };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.AudioContext = class {
    state = 'suspended';
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
    createGain() {
      return new Node();
    }
    createOscillator() {
      return new Node();
    }
  };
  try {
    const bus = createFeedbackAudio();
    bus.playConstruction('grass', true);
    assert.equal(contexts, 0);
    await bus.unlock();
    await bus.unlock();
    assert.equal(contexts, 1);
    bus.playConstruction('grass', true);
    assert.equal(nodes.length, 0);
    bus.setMuted(false);
    for (const type of ['grass', 'fire', 'water', 'electric', 'grass'])
      bus.playConstruction(type, true);
    assert.equal(
      nodes.filter((n) => !n.disconnected).length,
      32,
      'four voices, four oscillator/gain pairs each',
    );
    assert.equal(Math.max(...peaks), 0.2 * 0.065);
    bus.setVolume(0);
    assert.ok(nodes.every((n) => n.disconnected));
    const count = nodes.length;
    bus.playConstruction('water', false);
    assert.equal(nodes.length, count);
    bus.setVolume(0.4);
    document.hidden = true;
    bus.playConstruction('fire', true);
    assert.equal(nodes.length, count);
    document.hidden = false;
    bus.playConstruction('electric', false);
    bus.stop();
    assert.ok(nodes.every((n) => n.disconnected));
    bus.destroy();
    assert.equal(await bus.unlock(), false);
    const next = createFeedbackAudio();
    assert.deepEqual(next.getSettings(), { muted: false, volume: 0.4 });
    next.destroy();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
