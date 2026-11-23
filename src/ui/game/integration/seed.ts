/** Explicit QA seeds must fit the serialized uint32 RNG state, including zero. */
export function validateSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Invalid game seed');
  return seed;
}

/** Missing, empty, or invalid query values use normal fresh-game randomness. */
export function seedFromQuery(query: URLSearchParams): number | undefined {
  const value = query.get('seed');
  if (value === null || value.trim() === '') return undefined;
  const seed = Number(value);
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
    ? seed
    : undefined;
}

/** Called once per real game start, never per roll or setup preview. */
export function newGameSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
