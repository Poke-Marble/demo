import type { Snapshot } from './contracts.ts';
import { plan } from './planner.ts';

export interface Command<Action> {
  readonly commandId: string;
  readonly session: string;
  readonly turn: string;
  readonly revision: string;
  readonly candidateId: string;
  readonly action: Action;
}

export interface Receipt {
  readonly accepted: boolean;
  readonly presentation?: unknown;
}

export interface ExecutorHost<Action> {
  /** Synchronous, fresh public projection; never expose the full hidden state. */
  read(): Snapshot<Action>;
  /** Must atomically revalidate session/turn/revision/legal candidate, and deduplicate commandId. */
  dispatch(command: Command<Action>, signal: AbortSignal): Promise<Receipt>;
  /** Resolve only when rendering/effects are actually unlocked, including initial UI work. */
  awaitPresentation(
    context: {
      readonly snapshot: Snapshot<Action>;
      readonly receipt: Receipt | null;
    },
    signal: AbortSignal,
  ): Promise<void>;
  /** Optional injected thinking delay; no timer is hidden in the planner. */
  delay?(signal: AbortSignal): Promise<void>;
}

export type StopReason =
  | 'finished'
  | 'turn-changed'
  | 'session-changed'
  | 'not-computer'
  | 'no-candidate'
  | 'duplicate'
  | 'rejected'
  | 'no-progress'
  | 'max-actions'
  | 'aborted'
  | 'timeout'
  | 'failed'
  | 'busy';
export interface RunResult {
  readonly reason: StopReason;
  readonly actions: number;
  readonly error?: unknown;
}

/** Use in the UI's input guard as well as disabling buttons. */
export function shouldBlockHumanInput<Action>(
  snapshot: Snapshot<Action>,
  executorBusy: boolean,
  presentationBusy: boolean,
): boolean {
  const player = snapshot.players.find((p) => p.id === snapshot.activePlayerId);
  return (
    executorBusy ||
    presentationBusy ||
    snapshot.phase !== 'playing' ||
    !player ||
    player.bankrupt ||
    player.controller !== 'human'
  );
}

class Stop extends Error {
  readonly reason: 'aborted' | 'timeout';
  constructor(reason: 'aborted' | 'timeout') {
    super(reason);
    this.reason = reason;
  }
}

/** One instance per authority/session coordinator, shared across all three computers. */
export function createExecutor<Action>(
  host: ExecutorHost<Action>,
  options: {
    readonly seed: number;
    readonly maxActions?: number;
    readonly callbackTimeoutMs?: number;
  },
) {
  const maxActions = options.maxActions ?? 32;
  const timeout = options.callbackTimeoutMs ?? 15000;
  if (
    !Number.isInteger(maxActions) ||
    maxActions < 1 ||
    maxActions > 1000 ||
    !Number.isFinite(timeout) ||
    timeout < 1 ||
    timeout > 60000 ||
    !Number.isSafeInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  ) {
    throw new RangeError('Invalid executor bounds/seed');
  }
  let running = false;
  let outstanding = 0;
  let controller: AbortController | null = null;
  // An uncertain dispatch must never be retried automatically, even after abort.
  const attempted = new Set<string>();
  const busy = () => running || outstanding > 0;

  async function run(signal?: AbortSignal): Promise<RunResult> {
    if (busy()) return { reason: 'busy', actions: 0 };
    running = true;
    const local = new AbortController();
    controller = local;
    const abort = () => local.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) local.abort();
    let actions = 0;
    const result = (reason: StopReason): RunResult => ({ reason, actions });

    async function call<T>(callback: () => Promise<T>): Promise<T> {
      if (local.signal.aborted) throw new Stop('aborted');
      outstanding++;
      const operation = Promise.resolve()
        .then(() => {
          if (local.signal.aborted) throw new Stop('aborted');
          return callback();
        })
        .finally(() => {
          outstanding--;
        });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let listener: (() => void) | undefined;
      const interrupted = new Promise<never>((_, reject) => {
        listener = () => reject(new Stop('aborted'));
        local.signal.addEventListener('abort', listener, { once: true });
        timer = setTimeout(() => {
          reject(new Stop('timeout'));
          local.abort();
        }, timeout);
      });
      try {
        return await Promise.race([operation, interrupted]);
      } finally {
        clearTimeout(timer);
        if (listener) local.signal.removeEventListener('abort', listener);
      }
    }

    try {
      const origin = host.read();
      function guard(s: Snapshot<Action>): StopReason | null {
        if (local.signal.aborted) return 'aborted';
        if (s.session !== origin.session) return 'session-changed';
        if (s.phase !== 'playing') return 'finished';
        if (
          s.turn !== origin.turn ||
          s.activePlayerId !== origin.activePlayerId
        )
          return 'turn-changed';
        const active = s.players.find((p) => p.id === s.activePlayerId);
        if (!active || active.bankrupt || active.controller !== 'computer')
          return 'not-computer';
        return null;
      }
      while (actions < maxActions) {
        let current = host.read();
        let stop = guard(current);
        if (stop) return result(stop);
        if (host.delay) await call(() => host.delay!(local.signal));
        current = host.read();
        stop = guard(current);
        if (stop) return result(stop);
        await call(() =>
          host.awaitPresentation(
            { snapshot: current, receipt: null },
            local.signal,
          ),
        );
        // Replan from a fresh snapshot after all UI/think waits.
        current = host.read();
        stop = guard(current);
        if (stop) return result(stop);
        const selected = plan(current, options.seed);
        if (!selected) return result('no-candidate');
        const key = JSON.stringify([
          current.session,
          current.turn,
          current.revision,
        ]);
        if (attempted.has(key)) return result('duplicate');
        const candidate = selected.candidate;
        const command: Command<Action> = {
          commandId: JSON.stringify([
            current.session,
            current.turn,
            current.revision,
            candidate.id,
          ]),
          session: current.session,
          turn: current.turn,
          revision: current.revision,
          candidateId: candidate.id,
          action: candidate.action,
        };
        attempted.add(key);
        actions++;
        const receipt = await call(() => host.dispatch(command, local.signal));
        const committed = host.read();
        // A receipt from an old game must not start effects in the new session.
        if (committed.session !== origin.session)
          return result('session-changed');
        // Even end-turn/game-over receipts finish their presentation before unlock.
        await call(() =>
          host.awaitPresentation(
            { snapshot: committed, receipt },
            local.signal,
          ),
        );
        const next = host.read();
        stop = guard(next);
        if (stop) return result(stop);
        if (!receipt.accepted) return result('rejected');
        if (next.revision === current.revision) return result('no-progress');
      }
      return result('max-actions');
    } catch (error) {
      return {
        reason: error instanceof Stop ? error.reason : 'failed',
        actions,
        error,
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      controller = null;
      running = false;
    }
  }

  return {
    run,
    cancel: () => controller?.abort(),
    /** Remains true for uncooperative callbacks after timeout/cancel, until they settle. */
    get busy() {
      return busy();
    },
  };
}
