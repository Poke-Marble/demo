/** Shared presentation-only SFX contract. Inject this bus into future ability adapters. */
export interface SfxSettings {
  muted: boolean;
  volume: number;
}
export interface SfxBus {
  unlock(): Promise<boolean>;
  setMuted(value: boolean): void;
  setVolume(value: number): void;
  getSettings(): Readonly<SfxSettings>;
  subscribe(listener: (settings: Readonly<SfxSettings>) => void): () => void;
  play(cue: 'dice' | 'step'): void;
  playConstruction?(
    type: 'grass' | 'fire' | 'water' | 'electric',
    final: boolean,
  ): void;
  stop(): void;
  destroy(): void;
}
const key = 'pm:sfx:v1';
const clamp = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export function createFeedbackAudio(): SfxBus {
  let settings: SfxSettings = { muted: false, volume: 0.35 };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      saved &&
      typeof saved.muted === 'boolean' &&
      typeof saved.volume === 'number'
    )
      settings = { muted: saved.muted, volume: clamp(saved.volume) };
  } catch {
    /* Storage can be disabled. */
  }
  let context: AudioContext | undefined;
  let destroyed = false;
  let unlockGeneration = 0;
  let noise: AudioBuffer | undefined;
  let step = 0;
  const voices = new Set<() => void>();
  const listeners = new Set<(s: Readonly<SfxSettings>) => void>();
  const stop = () => {
    for (const end of [...voices]) end();
  };
  function publish() {
    stop();
    try {
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {
      /* Optional. */
    }
    for (const listener of listeners) listener({ ...settings });
  }
  return {
    async unlock() {
      if (destroyed) return false;
      const generation = unlockGeneration;
      try {
        // Called synchronously by a trusted pointer/key handler, before any await.
        context ??= new AudioContext({ latencyHint: 'interactive' });
        await context.resume();
        return (
          !destroyed &&
          generation === unlockGeneration &&
          context.state === 'running'
        );
      } catch {
        return false;
      }
    },
    setMuted(value) {
      settings = { ...settings, muted: value };
      publish();
    },
    setVolume(value) {
      settings = { ...settings, volume: clamp(value) };
      publish();
    },
    getSettings: () => ({ ...settings }),
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...settings });
      return () => {
        listeners.delete(listener);
      };
    },
    play(cue) {
      if (
        destroyed ||
        settings.muted ||
        !settings.volume ||
        context?.state !== 'running' ||
        document.hidden
      )
        return;
      // At most four voices; oldest voice is released immediately.
      if (voices.size >= 4) voices.values().next().value?.();
      const ctx = context;
      const nodes: AudioNode[] = [];
      const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
      const end = () => {
        for (const source of sources) {
          source.onended = null;
          try {
            source.stop();
          } catch {
            /* Ended. */
          }
        }
        for (const node of nodes) node.disconnect();
        voices.delete(end);
      };
      voices.add(end);
      try {
        // Cached procedural noise; fixed local sequence never touches game RNG.
        if (!noise) {
          noise = ctx.createBuffer(
            1,
            Math.ceil(ctx.sampleRate * 0.65),
            ctx.sampleRate,
          );
          const data = noise.getChannelData(0);
          let seed = 7127;
          for (let i = 0; i < data.length; i++) {
            seed = (seed * 16807) % 2147483647;
            data[i] = seed / 1073741824 - 1;
          }
        }
        const start = ctx.currentTime;
        const duration = cue === 'dice' ? 0.58 : 0.075;
        const gain = ctx.createGain();
        nodes.push(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, start);
        const peak = settings.volume * (cue === 'dice' ? 0.085 : 0.045);
        if (cue === 'dice') {
          for (const [i, t] of [0, 0.065, 0.15, 0.26, 0.4].entries()) {
            gain.gain.linearRampToValueAtTime(
              peak * (1 - i * 0.12),
              start + t + 0.006,
            );
            gain.gain.exponentialRampToValueAtTime(0.0001, start + t + 0.055);
          }
        } else gain.gain.linearRampToValueAtTime(peak, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        const filter = ctx.createBiquadFilter();
        nodes.push(filter);
        filter.type = 'lowpass';
        filter.frequency.value = cue === 'dice' ? 1500 : 700;
        filter.Q.value = 0.5;
        filter.connect(gain);
        const source = ctx.createBufferSource();
        nodes.push(source);
        sources.push(source);
        source.buffer = noise;
        source.connect(filter);
        const osc = ctx.createOscillator();
        nodes.push(osc);
        sources.push(osc);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(
          cue === 'dice' ? 145 : 210 + (step++ % 2) * 22,
          start,
        );
        osc.frequency.exponentialRampToValueAtTime(85, start + duration);
        osc.connect(gain);
        source.onended = end;
        source.start(start);
        osc.start(start);
        source.stop(start + duration);
        osc.stop(start + duration);
      } catch {
        end();
      }
    },
    playConstruction(type, final) {
      if (
        destroyed ||
        settings.muted ||
        !settings.volume ||
        context?.state !== 'running' ||
        document.hidden
      )
        return;
      const ctx = context;
      const base = { grass: 330, fire: 262, water: 294, electric: 440 }[type];
      // Original ascending chord, on the existing unlocked context and gain policy.
      if (voices.size >= 4) voices.values().next().value?.();
      const sources: OscillatorNode[] = [];
      const gains: GainNode[] = [];
      const end = () => {
        for (const source of sources) {
          source.onended = null;
          try {
            source.stop();
          } catch {
            /* Ended. */
          }
          source.disconnect();
        }
        for (const gain of gains) gain.disconnect();
        voices.delete(end);
      };
      voices.add(end);
      try {
        const notes = final ? [1, 1.25, 1.5, 2] : [1, 1.5];
        notes.forEach((ratio, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          sources.push(osc);
          gains.push(gain);
          osc.type = type === 'fire' ? 'triangle' : 'sine';
          osc.frequency.value = base * ratio;
          const at = ctx.currentTime + index * (final ? 0.12 : 0.08);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, settings.volume * 0.065),
            at + 0.025,
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            at + (final ? 0.65 : 0.22),
          );
          osc.connect(gain);
          gain.connect(ctx.destination);
          if (index === notes.length - 1) osc.onended = end;
          osc.start(at);
          osc.stop(at + (final ? 0.7 : 0.25));
        });
      } catch {
        end();
      }
    },
    stop,
    destroy() {
      destroyed = true;
      unlockGeneration++;
      stop();
      listeners.clear();
      noise = undefined;
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}
