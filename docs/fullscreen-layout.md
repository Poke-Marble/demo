# Fullscreen game shell

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
