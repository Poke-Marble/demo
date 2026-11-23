/** A chain belongs to one basic turn; landing settlement never consumes it. */
export interface DoubleChain {
  readonly consecutive: number;
  readonly extraRollPending: boolean;
}

export const emptyDoubleChain = (): DoubleChain => ({
  consecutive: 0,
  extraRollPending: false,
});

export function recordDice(
  previous: DoubleChain | undefined,
  values: readonly [number, number],
): DoubleChain {
  const consecutive =
    values[0] === values[1] ? (previous?.consecutive ?? 0) + 1 : 0;
  return { consecutive, extraRollPending: consecutive > 0 && consecutive < 3 };
}

export function validDoubleChain(chain: DoubleChain | undefined): boolean {
  return (
    chain === undefined ||
    (Number.isInteger(chain.consecutive) &&
      chain.consecutive >= 0 &&
      chain.consecutive <= 3 &&
      chain.extraRollPending ===
        (chain.consecutive > 0 && chain.consecutive < 3))
  );
}
