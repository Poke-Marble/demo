# Board landmark identity and restrained labels

Base: `ac5a60e`, branch: `fix/board-landmark-identity`. Applicable AGENTS.md was not found in the worktree or its ancestors. No main merge or changes to full-screen CSS/events were made.

## Changes

- Duplicate identity originated in both `src/data/maps/kanto-johto.ts` and `art/places.ts`: ordinary landmarks and trial corners shared names and scenery. The corners retain Whirl Islands/Lugia and Bell Tower/Ho-Oh. Ordinary landmarks become 분노의호수 (lake) and 용의굴 (cave). Their historical `tile:kj:whirl` and `tile:kj:bell-tower` IDs, order, prices, tolls, purchasability and four-landmark victory target remain unchanged. Source URLs now identify the replacement places. Seafoam has separate ice scenery.
- START receives the departure flag; Fly receives a raised wing silhouette without a flagpole.
- Labels retain browser-rendered 14px text, independent of camera zoom/DPR. Unselected names have no opaque panel or connector. The selected name has a small panel and one connector. Upper/lower ring edges prefer outside placement; projected model and pawn rectangles participate in collision scoring, and moving pawn bounds invalidate layout. Mobile keeps all names in a 112px scroll directory and only the selected name on the map.

## Completed validation

- [Full test output](tests.txt): 179/179 passed using the flight-picker import hook. After adding final identity/marker assertions, the focused map/art/label suite passed 16/16 (including 14 map checks in its harness).
- Typecheck, ESLint, Vite build and changed-file Prettier checks passed; `git diff --check` passed. Vite retains its existing large Phaser chunk warning.
- [Chrome 157 report](report.json): 16 measurements at 1280/390, DPR 1/2, camera zoom 1/1.25/2.5. All measured foreground overlaps are empty and browser errors are empty. Checks include real zoom-button clicks, pointer-drag pan, projected camera anchor alignment, resize, font delay, and cleanup. The 390 contexts enable mobile/touch emulation. Browser checks were run sequentially.
- Captures inspected: [1280 board](board-1280.png), [390 HUD](hud-390.png). Additional zoom/pan captures remain under ignored `artifacts/board-landmark-identity/`.
- Preview: `http://127.0.0.1:5193/`, served from this worktree; HTTP 200 verified after session resume.

## Reproduction

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5193 --strictPort
# Separate terminal; run browser checks sequentially.
node src/ui/game/phaser/labels.browser-check.mjs --after-only
$tests = rg --files src -g '*.test.mjs' -g '*.test.ts'
node --experimental-strip-types --import ./src/ui/game/events/flight-picker/register.mjs --test $tests
npm run lint
npm run build
```

The browser script uses the pre-existing Playwright installation in `../feat-board-art/artifacts/browser-tools/node_modules/playwright/index.mjs` read-only. `PLAYWRIGHT_PATH` and `LABEL_ORIGIN` can override it and the origin.

## Integration boundary

In this ac5a60e-based preview, the existing “이동 –” HUD pill still covers part of the START pawns at 390. This is separate from map labels and belongs to the parallel fullscreen/events work. No common-file change was needed for this branch. Collision scoring is heuristic for arbitrary future map content; measured fixtures passed, including the zoomed views. Synthetic visual fixtures do not replace long manual gameplay.
