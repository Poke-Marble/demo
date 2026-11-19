import type { SpecialEventRequest } from './contracts';

/** Presentation only: completion/skip never dispatches a game action. */
export function createEffectQueue(
  present: (request: SpecialEventRequest, signal: AbortSignal) => Promise<void>,
  lock: (locked: boolean) => void,
) {
  const seen = new Set<string>();
  let pending: SpecialEventRequest[] = [];
  let active: AbortController | undefined;
  let running: Promise<void> | undefined;
  let epoch = 0;
  let disposed = false;
  async function drain(token: number) {
    try {
      while (pending.length && token === epoch && !disposed) {
        const request = pending.shift()!;
        const controller = new AbortController();
        active = controller;
        await present(request, controller.signal);
      }
    } finally {
      if (token === epoch) {
        active = undefined;
        running = undefined;
        lock(false);
      }
    }
  }
  function reset() {
    epoch++;
    pending = [];
    active?.abort();
    active = undefined;
    running = undefined;
    seen.clear();
    lock(false);
  }
  return {
    enqueue(requests: readonly SpecialEventRequest[]) {
      if (disposed) return Promise.resolve();
      for (const request of requests) {
        if (seen.has(request.id)) continue;
        seen.add(request.id);
        pending.push(request);
      }
      if (!running && pending.length) {
        lock(true);
        // Assign the promise before presentation can finish synchronously.
        const token = epoch;
        running = Promise.resolve().then(() => drain(token));
      }
      return running ?? Promise.resolve();
    },
    skip() {
      active?.abort();
    },
    reset,
    destroy() {
      disposed = true;
      reset();
    },
  };
}
