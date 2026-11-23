# Board presentation polish

Scope: preserve the existing player UI, rules, board geometry and automatic fit.
Based on WIP `90fbe81`, merged with main `e07aa30` through `597bf1a`. The
`/demo/` Vite base, deployment workflow and user README are preserved.

## Changes

- Removed only Phaser's large ground shadow:
  `ground.fillStyle(0x09283c, 0.2).fillEllipse(500, 604, 660, 50)`.
  Island side polygons, tile/facility layers, labels and the four 22×9 pawn
  shadows remain. No art asset needed regeneration.
- Removed the camera nav and its three permanent zoom buttons, including the
  empty nav's margin. Automatic fit and the renderer's existing camera API and
  flight drag/tap/keyboard selection remain.
- The persistent feedback controller resolves the current board surface, reparents
  its overlay there and follows replacement during animation. Absolute positioning
  and container-relative canvas sizing keep it centered and bounded by that surface.
  Missing/disconnected targets settle the animation rather than anchoring to the page.
  The surface explicitly establishes a relative positioning context.

There was no extra camera translation: measured world camera center `(500, 340)`
already projects to the surface center. The desktop board is left of the page
center because the existing HUD occupies the right column. Moving it toward the
page center would change the existing layout.

## Validation

`npm ci`: 124 packages installed, audit 0 vulnerabilities.
`npm run build`: TypeScript and production Vite build passed; existing large-chunk
warning only. `npm run lint` passed. The added browser driver also passed ESLint.
Feedback policy/audio, board-flight and pawn occlusion tests: 11 passed. The first
audio test invocation lacked Node's `--experimental-strip-types`; rerunning that
one test with the required flag passed. Passed tests were not repeated.

Real installed Chrome **157.0.8103.80**, headless, DPR 1:

| Viewport  | Dice canvas minus board center (px) | Board minus page center (px) |
| --------- | ----------------------------------- | ---------------------------- |
| 1280×720  | 0, 0                                | -204, 14                     |
| 390×844   | 0, -0.0078125                       | 0, -164.9296875              |
| 844×390   | 0, -0.0078125                       | -170, 13.796875              |
| 1920×1080 | 0, 0                                | -204, 14                     |

Every viewport: zero camera navs, zero large ground ellipses, four pawn shadows,
one direct Phaser canvas, FX canvas inside the surface, camera center within 1px.
The two canvases are distinguished with `.phaser-board-surface > canvas` for the
renderer and `.pm-feedback-overlay canvas` for the temporary dice.

Real authoritative seed 1 sequence: roll reveals raw dice; resolve with the legal
grass skill -1 choice; PP 3→2; movement path length equals authoritative adjusted
distance; original dice values preserved; skill presentation shown; all three AI
turns complete and player 1 regains control. Each of the 16 update receipts was
acknowledged exactly once. No complete seeded game was replayed.

Natural authority seed 42 flight state: all four viewports passed drag-return
suppression, board city tap, candidate state without submission or game mutation,
Escape, and accessible city-list selection followed by exactly one explicit
confirmation. Existing route preview renderer was retained.

Controller lifecycle: resize to a short surface with an open modal, replace the
target DOM, skip, reset and destroy all settle correctly. Reduced motion suppresses
the dice and cleanup removes its canvas. Production preview at
`http://127.0.0.1:5232/demo/` passed real setup/roll and center delta `(0, 0)`;
sound settings and mute remain functional. Both preview and fixture servers use
`--strictPort`.

The test-only skill observer initially read a removed node after fixture destruction.
It now guards the node; cleanup was rechecked separately. Production also passed;
the initial sound-button selector was corrected to the existing `소리` label.
Final browser error list is empty.

## Evidence and reproduction

[JSON report](../src/ui/game/phaser/polish-evidence/report.json) contains all rects,
baseline comparisons, receipts, lifecycle and flight checks.

- [Before 1280](../src/ui/game/phaser/polish-evidence/before-1280x720.png),
  [after 1280](../src/ui/game/phaser/polish-evidence/after-1280x720.png),
  [dice 1280](../src/ui/game/phaser/polish-evidence/after-dice-1280x720.png).
- [Before 390](../src/ui/game/phaser/polish-evidence/before-390x844.png),
  [after 390](../src/ui/game/phaser/polish-evidence/after-390x844.png),
  [dice 390](../src/ui/game/phaser/polish-evidence/after-dice-390x844.png).
- [Before landscape](../src/ui/game/phaser/polish-evidence/before-844x390.png),
  [after landscape](../src/ui/game/phaser/polish-evidence/after-844x390.png),
  [dice landscape](../src/ui/game/phaser/polish-evidence/after-dice-844x390.png).
- [Before 1920](../src/ui/game/phaser/polish-evidence/before-1920x1080.png),
  [after 1920](../src/ui/game/phaser/polish-evidence/after-1920x1080.png),
  [dice 1920](../src/ui/game/phaser/polish-evidence/after-dice-1920x1080.png).
- [Resolved movement](../src/ui/game/phaser/polish-evidence/resolved-move-1280.png),
  [AI return](../src/ui/game/phaser/polish-evidence/ai-return-1280.png),
  [flight mobile](../src/ui/game/phaser/polish-evidence/flight-390x844.png),
  [built preview](../src/ui/game/phaser/polish-evidence/production-5232-dice.png).

Driver: `node scripts/check-board-polish.mjs`. It expects Vite dev on 5233 and an
untouched `e07aa30` source archive on 5234, both at `/demo/`, plus the built preview
on 5232. The baseline archive and its dependency junction were created only inside
ignored `artifacts/board-polish/before-source`, never in main. `--resume` retains
passed rect/gameplay/flight results and checks fixture cleanup, production and
reduced motion without repeating those sequences.

Background integration boundary: keep `.phaser-board-surface` positioned relative
with overflow hidden. Its dice overlay is a child at z-index 9 and has no pointer
events. A background CSS/layer must sit behind it; Phaser canvas transparency is
owned by the background worker. Preserve automatic fit/world center and do not
reintroduce the removed ground ellipse. HUD/fullscreen CSS is untouched here.
