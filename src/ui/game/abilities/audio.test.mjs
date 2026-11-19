import test from 'node:test';
import assert from 'node:assert/strict';
import { createAbilityAudio } from './audio.ts';

test('silent until unlocked; bounded volume, single voice, cancel and destroy release every node', async () => {
  const nodes = [];
  class Source {
    disconnected = false;
    stopped = false;
    constructor() {
      nodes.push(this);
    }
    connect(next) {
      return next;
    }
    disconnect() {
      this.disconnected = true;
    }
    start() {}
    stop() {
      this.stopped = true;
    }
  }
  const values = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime(value) {
      values.push(value);
    },
    exponentialRampToValueAtTime() {},
  });
  class Context {
    state = 'suspended';
    currentTime = 12;
    sampleRate = 100;
    destination = {};
    async resume() {
      this.state = 'running';
    }
    async close() {
      this.state = 'closed';
    }
    createGain() {
      const node = new Source();
      node.gain = param();
      return node;
    }
    createOscillator() {
      const node = new Source();
      node.frequency = param();
      return node;
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(110) };
    }
    createBufferSource() {
      return new Source();
    }
    createBiquadFilter() {
      const node = new Source();
      node.frequency = param();
      return node;
    }
  }
  const oldContext = globalThis.AudioContext;
  const oldSource = globalThis.AudioScheduledSourceNode;
  globalThis.AudioContext = Context;
  globalThis.AudioScheduledSourceNode = Source;
  try {
    const audio = createAbilityAudio();
    audio.play('fire', 1.1);
    assert.equal(nodes.length, 0);
    assert.equal(await audio.unlock(), true);
    audio.play('grass', 1.1);
    assert.equal(values[0], 0.18 * 0.35);
    const previous = [...nodes];
    audio.play('water', 1.1);
    assert.ok(previous.every((n) => n.disconnected && n.stopped));
    audio.setMuted(true);
    assert.ok(nodes.every((n) => n.disconnected));
    const count = nodes.length;
    audio.play('electric', 1.1);
    assert.equal(nodes.length, count);
    audio.setMuted(false);
    audio.setVolume(20);
    audio.play('electric', 1.1);
    assert.equal(values.at(-1), 0.35 * 0.35);
    audio.destroy();
    assert.ok(nodes.every((n) => n.disconnected));
    assert.equal(await audio.unlock(), false);
    audio.play('grass', 1.1);
    assert.equal(nodes.length, count + 4);
  } finally {
    globalThis.AudioContext = oldContext;
    globalThis.AudioScheduledSourceNode = oldSource;
  }
});
test('unavailable Web Audio and rejected resume fail harmlessly', async () => {
  const old = globalThis.AudioContext;
  try {
    globalThis.AudioContext = class {
      async resume() {
        throw new Error('blocked');
      }
      async close() {}
    };
    const audio = createAbilityAudio();
    assert.equal(await audio.unlock(), false);
    assert.doesNotThrow(() => audio.play('grass', 1.1));
    audio.destroy();
  } finally {
    globalThis.AudioContext = old;
  }
});
