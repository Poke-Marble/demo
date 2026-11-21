# Fullscreen game shell

Branch: `fix/fullscreen-game-layout`. Preview: http://127.0.0.1:5194/.

The product shell allocates the viewport between the board, player HUD,
actions and turn status. It does not hide overflow on the page. Desktop uses
a separate HUD column; portrait mobile puts a two-column roster below the
board. Short screens use compact cards with the original 40px portraits.
Long optional HUD metadata can scroll inside its allocated HUD region rather
than pushing the action buttons beyond the viewport. Metadata and effect
chips remain available; no adapter data mapping was changed.

The city list retains the renderer's original 32 buttons and handlers inside
a native scrolling dialog. Travel records, sound settings and credits are
also dialogs. The shell removes the renderer's inline directory and duplicate
credits from the main screen, and keeps art attribution in the credit dialog.
The duplicate board-center dice readout was removed; the HUD dice readout and
actual roll presentation remain. The entry metadata no longer says demo.

## Validation

- Existing Chrome matrix reused: 1280×720, 1920×1080, 390×844,
  844×390, 1280×480 and 390×667. Title, partner, map and game stages fit
  the page viewport with no clipped outer buttons. City dialogs scroll to
  the final close button. Evidence: `artifacts/fullscreen/report.json` and
  `game-*.png` / `cities-*.png` (local, ignored artifacts).
- Follow-up actual Google Chrome checks at 1280×720, 390×844, 844×390,
  and 390×667: retained last city selection opens one replacement info
  dialog; sound controls work; a real roll reaches a legal purchase prompt;
  document size equals viewport size; portraits remain 44px including border;
  visible rail buttons fit; no page errors. At 1280×720, a purchase and end
  turn complete, all three computers play, and human input returns at TURN 5.
  Evidence: `artifacts/fullscreen/turn-report.json`, `turn-*.png`,
  `after-ai-round.png`. These automated checks use installed Google Chrome
  in headless mode; an initial headed check timed out during initialization.
- `node scripts/check-fullscreen-turns.mjs` reproduces the follow-up checks.
  Set `PLAYWRIGHT_PATH` to a Playwright `index.mjs` if the neighboring tooling
  directory is unavailable; `GAME_URL` and `HEADED=1` are optional.
- `npm run build`, `npm run lint`, changed-file Prettier check and
  `git diff --check` passed. Vite retains its existing large-chunk warning.
- 26 regression tests passed using `node --experimental-strip-types --test`
  with integration adapter/settlement, HUD model, feedback policy, event queue
  and board presentation test files. This includes presentation receipts,
  stale choices, actual economy/AI play and metadata model preservation.

## Integration boundary

No economy, AI, adapter mapping, `presentationComplete`, events presenter,
Phaser label or board geometry implementation was changed. The shared
`src/ui/game/index.ts` has shell hooks for moving renderer navigation into
dialogs and adding the new stylesheet; reconcile those hooks with the
separate mechanic/HUD metadata branch during administrator integration.
The shell currently recognizes `.phaser-board-tiles`,
`.phaser-map-label-directory` and `.phaser-board-credits`; keep those host
integration points aligned if the label branch changes its DOM structure.

The separate mechanic branch's new blessing/rope metadata and event/label
changes have not been combined or tested here. No main merge was performed.
