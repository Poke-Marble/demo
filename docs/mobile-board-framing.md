# Mobile board framing

Branch `fix/mobile-board-framing`, based on `195dd6c`. Production preview:
http://127.0.0.1:5201/.

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

## Chrome evidence

Installed Google Chrome 157, headless, DPR 2. Screenshots/reports are in the
ignored `artifacts/mobile-framing/` directory. All requested viewports passed
document size = viewport, four visible 44px portraits, accessible rail buttons,
canvas filling its surface, and no browser errors.

| Viewport   | Island width | Header + skill budget island width |
| ---------- | -----------: | ---------------------------------: |
| 375 × 812  |        330px |                              283px |
| 390 × 844  |        344px |                              325px |
| 844 × 390  |        341px |                              325px |
| 1280 × 720 |        744px |                              707px |

At 390 × 844 the baseline island was about 218px wide. At 375 × 812 the
baseline page overflowed to 1099px; the corrected page fits 812px. Budget
measurements deliberately retain the old rail TURN row, so its removal gives
the new header additional room.

- `node scripts/check-mobile-camera.mjs`: all four viewports passed camera
  containment, 14px-or-larger visible labels clearing model/pawn bounds,
  nearest sprite filtering, zoom, real pointer pan, reset and rotated resize.
  This fixture requires a Vite dev server; its report is reused after CSS-only
  allocation changes.
- `node scripts/check-mobile-framing.mjs`: actual production game layout.
  `HEADER_BUDGET=1 SKILL_BUDGET=1 CAPTURE_PREFIX=budget` adds allocation
  fixtures. Set `GAME_URL` for another server and `PLAYWRIGHT_PATH` for tooling.
- Existing `scripts/check-fullscreen-turns.mjs` passed at 1280 × 720,
  390 × 844, 844 × 390 and 390 × 667: city selection, sound dialog, legal
  purchase prompt, no outer scrolling, visible controls and no page errors.
  Desktop completed the human purchase/end-turn and all three AI turns.
- Six label-layout and pawn-occlusion regression tests passed. Build, lint,
  changed-file formatting and diff whitespace checks passed. The production
  build retains Vite's existing large-chunk warning.
