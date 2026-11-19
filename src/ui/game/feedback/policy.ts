import type { GameEvent, TileId } from '../../../game/contracts';
import type { UIUpdate } from '../adapter';

/** Lifetime is one game session; IDs also dedupe cloned event redelivery. */
export function createUpdateGate() {
  const ids = new Set<string>();
  let objects = new WeakSet<GameEvent>();
  let updates = new WeakSet<UIUpdate>();
  return {
    accept(update: UIUpdate): UIUpdate | undefined {
      if (updates.has(update)) return;
      updates.add(update);
      if (update.id !== undefined) {
        if (ids.has(update.id)) return;
        ids.add(update.id);
        return update;
      }
      const events = update.events.filter((event) => {
        if (objects.has(event)) return false;
        objects.add(event);
        return true;
      });
      if (update.events.length && !events.length) return;
      return { ...update, events };
    },
    reset() {
      ids.clear();
      objects = new WeakSet<GameEvent>();
      updates = new WeakSet<UIUpdate>();
    },
  };
}
/** Walking only: adjacent valid waypoints, excluding repeated/start positions. */
export function walkingPath(
  path: readonly TileId[],
  from: TileId | undefined,
  tiles: readonly { id: TileId }[],
): TileId[] {
  const result: TileId[] = [];
  let previous = from;
  for (const tile of path) {
    const index = tiles.findIndex((t) => t.id === tile);
    const before = tiles.findIndex((t) => t.id === previous);
    if (index < 0 || tile === previous) continue;
    if (before < 0 || index !== (before + 1) % tiles.length) return [];
    result.push(tile);
    previous = tile;
  }
  return result;
}
