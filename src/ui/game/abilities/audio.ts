import type { AbilityActivation } from '../../../game/abilities/activation';

/** Synthesized locally; no samples or network. One voice per presenter queue item. */
export function createAbilityAudio() {
  let context: AudioContext | undefined;
  let volume = 0.18;
  let muted = false;
  let disposed = false;
  let generation = 0;
  const nodes = new Set<AudioNode>();
  const stop = () => {
    for (const node of nodes) {
      if (node instanceof AudioScheduledSourceNode) {
        try {
          node.stop();
        } catch {
          /* Already stopped. */
        }
      }
      node.disconnect();
    }
    nodes.clear();
  };
  return {
    /** Invoke directly in a click/key handler. Sound failure never blocks rendering. */
    async unlock() {
      if (disposed) return false;
      const token = generation;
      try {
        context ??= new AudioContext();
        await context.resume();
        return !disposed && token === generation && context.state === 'running';
      } catch {
        return false;
      }
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) stop();
    },
    setVolume(value: number) {
      volume = Number.isFinite(value) ? Math.max(0, Math.min(0.35, value)) : 0;
      stop();
    },
    play(type: AbilityActivation['type'], duration: number) {
      stop();
      if (disposed || muted || !volume || context?.state !== 'running') return;
      try {
        const ctx = context;
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume * 0.35, now + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        gain.connect(ctx.destination);
        nodes.add(gain);
        const oscillator = ctx.createOscillator();
        oscillator.type = type === 'electric' ? 'triangle' : 'sine';
        const frequency = { grass: 620, fire: 170, water: 420, electric: 850 }[
          type
        ];
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(
          type === 'water' ? 180 : frequency * 1.7,
          now + duration,
        );
        oscillator.connect(gain);
        nodes.add(oscillator);
        oscillator.start(now);
        oscillator.stop(now + duration);
        const noise = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * duration),
          ctx.sampleRate,
        );
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
          data[i] = (Math.random() * 2 - 1) * 0.22;
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = type === 'fire' ? 1200 : 650;
        source.connect(filter).connect(gain);
        nodes.add(source);
        nodes.add(filter);
        source.start(now);
        source.stop(now + duration);
        source.onended = () => {
          if (nodes.has(source)) stop();
        };
      } catch {
        stop();
      }
    },
    stop,
    destroy() {
      disposed = true;
      generation++;
      stop();
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}
