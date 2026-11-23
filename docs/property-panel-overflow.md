# Property panel bounds

## Reproduction and cause

The original report predates f33's grouped sale actions. On this baseline,
increasing ownership from 0 to 12 to all 28 purchasable tiles does **not** enlarge
the document. HUD already shows city/landmark counts instead of individual
holdings, and normal sales already open a dialog. Keep those protections.

The remaining issue is the dialog's single scroll surface: focusing the only
close button in a long asset dialog initially scrolls past its title and first
assets. A long sale dialog starts with its close button below the visible window.
At 844×390, the maximum-ownership sale dialog has a 1,295px scroll extent and its
close button bottom is at y=1,289, outside the 390px viewport. The page itself
remains 844×390. Before screenshots and geometry are in
`artifacts/property-overflow/before/` (ignored local artifacts).

## Change

The shared shell dialog keeps its title and optional close footer outside a
keyboard-focusable, bounded content scroller. `overflow-y: auto` creates scrolling
only when needed. No global overflow hiding or clipped action rows were added.
Asset status and HUD player details use the same read-only searchable ownership
list. City/landmark/owner text and city facility levels come from the supplied
view; no price, balance, legality, PP, or game-state calculation changed.

Purchase, takeover, construction and mandatory debt prompts retain the original
opaque choice IDs and handlers. Debt bankruptcy and sale choices remain in the
mandatory prompt; Escape still cannot dismiss it. The last sale can be reached
and activated by normal scrolling/clicking without force.

## Geometry and economic paths

Installed Google Chrome, headless, reduced motion. All 32 combinations of four
viewports and eight states passed: empty, 12 holdings, maximum 28, all final city
facilities plus landmarks, landmark purchase, final construction, takeover, debt.
These are validated stress snapshots, including ownership beyond normal early
victory thresholds, followed by real adapter choices and authoritative receipts.

| Viewport | Document before/after | Board height | Asset body visible/total | Fixed close bottom |
| -------- | --------------------- | ------------ | ------------------------ | ------------------ |
| 1280×720 | 1280×720              | 530px        | 572/1315px               | 686px              |
| 390×844  | 390×844               | 268px        | 700/1315px               | 808px              |
| 375×844  | 375×844               | 268px        | 700/1315px               | 808px              |
| 844×390  | 844×390               | 240px        | 250/1315px               | 354px              |

Four portraits stay 44×44px. Turn header, skill PP, rail buttons and available
roll remain inside each viewport. Tests also verify search/reset, player detail
focus return, and clicking roll followed by the original free dice choice.
Four additional long-description cases repeat the supplied description 50 times
as display-only stress input. The document stays at viewport size; the full
description and last legal choice remain reachable inside the content scroller.
Evidence: `after/long-description.json` and `long-description-*.png`.
Each viewport exercises landmark purchase, final construction, takeover,
last-item voluntary sale and debt sale through real UI buttons; committed receipt
types and totals match the displayed adapter quotes, and the debt clears.

Reproduce with `node scripts/check-property-overflow.mjs` against the preview.
`PLAYWRIGHT_PATH` and `GAME_URL` override local defaults. `QA_PHASE=before` records
without assertions; use the baseline source for before evidence. Reports and
screenshots are in `artifacts/property-overflow/after/`.
For a focused repeat of the description check, set `QA_CONTINUATION_ONLY=1` and
`QA_LONG_ONLY=1`; it writes a separate report without replacing the full matrix.

Validation: build, typecheck, lint, changed-file formatting and diff checks;
41 economy, integration adapter/settlement and HUD model regression tests passed.
Build retains the existing large Phaser chunk warning.

## Integration boundaries

Herdr coordination: `poke-board-flight` owns destination board UI, Phaser input
and the flight bridge; `poke-world-events` owns top global state;
`poke-start-build` owns additional START building opportunities;
`poke-scrollbar-fix` owns setup/lobby CSS. This branch changes none of those
mechanics or setup/lobby selectors. Shared `index.ts` reconciliation is limited
to `modal()`, `mountPlayerHud`'s asset detail callback and the asset status button.
`modal()` now wraps description/choices in `.pm-dialog-body` and the close button
in `.pm-dialog-footer`; START prompts using it inherit those bounds.

No main merge or push was performed.
