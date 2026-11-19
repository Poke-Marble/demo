import type { Candidate, Snapshot } from './contracts.ts';
import type { Command, Receipt } from './executor.ts';

/** Example bridge only: bind these functions to the eventual economy authority. */
export interface AuthorityPort<Action> {
  publicSnapshot(): Omit<Snapshot<Action>, 'candidates'>;
  legalQuotedCandidates(): readonly Candidate<Action>[];
  /** Transactional validation + commandId receipts belong here, not in the AI. */
  commit(command: Command<Action>, signal: AbortSignal): Promise<Receipt>;
}

export function createCandidateAdapter<Action>(port: AuthorityPort<Action>) {
  return {
    // Host must return snapshot and candidates from the same synchronous revision.
    read: (): Snapshot<Action> => ({
      ...port.publicSnapshot(),
      candidates: port.legalQuotedCandidates(),
    }),
    dispatch: (command: Command<Action>, signal: AbortSignal) =>
      port.commit(command, signal),
  };
}
