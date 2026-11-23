# Mobile board framing

The Phaser canvas now follows the allocated surface aspect ratio. Its camera
fits the island, facilities and pawns inside a padded 860 × 600 world frame,
centered at (500, 340). Zoom controls remain relative to that complete-board
view. World geometry, sprite assets, texture filtering and label placement are
unchanged; the canvas retains 1000 logical pixels across.

Portrait HUD cards combine identity and cash beside each 44px portrait. Short
landscape screens use four roster columns so every portrait remains visible
when additional controls are present. Optional metadata remains available via
local HUD scrolling. The legacy <=380px rail override no longer collapses the
roster or stacks the two navigation buttons. Expanded setup descriptions scroll
inside the lobby rather than extending the page.

## Ownership and integration

- Changed product files: `src/ui/game/fullscreen.css` and the `fit()` camera
  function in `src/ui/game/phaser/index.ts`. No `index.ts` shell hooks, adapter,
  rules, round model, art or skill behavior changes. No main merge.
- Turn UI owns `turn-header.ts`, `turn-header.css` and its mounting hook.
  Agreed structure: `.pm-header.pm-header-with-turn` containing brand,
  `.pm-turn-header` and header tools. Shell allocation: desktop 72px,
  portrait 80px, short landscape 56px. Portrait brand is omitted and tools
  use the second row. The header worker removes duplicate rail TURN content.
- Skill UI owns `skills/*.ts` and `skills/*.css`. Its direct rail child
  `.pm-skill-hud` spans both rail columns. Agreed height budget: portrait
  64px, landscape 56px; detail content belongs in its own disclosure/dialog.
  Skill balance and actions are outside this change.
- Header and skill modules are not integrated on this branch. The simultaneous
  height test uses empty allocation fixtures, not simulated authority data or
  a claim that those features are complete. Their actual content still requires
  integration QA by their owners.
