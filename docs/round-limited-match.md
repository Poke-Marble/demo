# Round-limited match integration

Base: `195dd6c`; implementation checkpoints: `c4dd6f4`, `d00d233`.

## Ownership and integration

The match module owns round accounting, full-cost asset ranking and settled victory finalization. Core owns the basic-turn completion boundary. The integration adapter calls `finalizeMatch` after economy plus ability settlement and before publishing one atomic update. Existing presentation acknowledgement continues to block new financial commands until every visual subscriber finishes.

`src/game/rulesets.ts` is identical to the preset worker's shared definition: standard 30 rounds, quick 20. The preset worker owns setup UI, economy profiles, context replacement and fresh sessions. During integration retain its `RulesPreset` import/normalization/context changes and this branch's `finalizeMatch`/`matchProgress` calls. AI worker owns snapshot/outlook edits. Active-skills worker owns the dice reveal/pending/resolve stages. Header worker owns top-center turn UI and condition progress.

## Basic turn boundary (future doubles and pending dice)

- `turnNumber` counts global basic turns started, not board laps or rounds. Final completion currently advances it to the next nominal turn before the adapter finalizes; after quick 4-seat play it is 81, while completed rounds are exactly 20.
- `economy.completedLapsByPlayerId` counts individual passes of start for construction unlocks.
- `match.completedBasicTurnsByPlayerId` increments only in successful core `end-turn`, including trial stays and bankruptcy automatic end. Bankrupt skipped seats receive no increment.
- `match.completedRounds` increments only when the next surviving original seat is at or before the outgoing seat. Leading/trailing bankrupt seats therefore do not create extra rounds or stall the cycle.
- Future extra rolls must remain inside that same basic turn. Never call `completeBasicTurn`, increment `turnNumber`, clear once-per-basic-turn skill state, or consume a round for an extra roll.
- Active-skills owns unresolved `pendingDice`: `end-turn` must remain rejected until dice choice and movement/settlement finish. Dice reveal/resolve must not call the match completion function. This branch adds no dice hooks or skill balance.
- Doubles and save implementation are excluded. Match fields are plain serializable data; schema integration belongs to the later save wave.

## Victory and assets

Immediate last-survivor, three groups, one complete side, or four landmarks wins before the round limit. Pending dice, mandatory toll, or debt defers judgment. At the limit the current basic turn (including its purchases, trial or payment settlement) finishes before ranking. No next-turn financial action is accepted after finalization.

Combined active-skill integration uses `hasPendingSettlement` for the adapter and match finalizer. The economy expiration guard still permits resolving an existing pending dice/toll/debt obligation; its phase-specific legality checks prevent unrelated commands. `skill-settlement.test.mjs` verifies deferred results/ranking, no basic-turn advancement during revealed dice, and a real pending toll payment plus inert command replay. The expired counter in this boundary test is synthetic and is not presented as full-game browser evidence.

Score = cash + catalog land cost of currently owned properties + cumulative catalog construction costs through the current stage. It is independent of sale rate, takeover premium and discounts. Bankrupt players rank after survivors. Ties among survivors use cash descending, then original zero-based seat ascending. Final ranking is recorded for all victory reasons; the victory winner may differ from the asset leader for an immediate victory.

The four-reason victory config remains valid. A fifth `round-limit-assets` entry is also accepted in any config position but is always deferred to match finalization, never allowed to preempt immediate victory. Duplicate, omitted immediate, or unknown reasons still reject.

## Public UI contract

`GameView.matchProgress?: MatchProgress`, exported from `src/game/match/index.ts`, is projected by the real adapter. Consumers should not infer rounds from `turnNumber` or recalculate asset values from presentation data.

| Field                                                | Meaning                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rulesPreset`, `roundLimit`                          | Actual selected preset and authoritative 30/20 limit                                                                                                                 |
| `currentRound`, `completedRounds`, `remainingRounds` | Remaining includes the current unfinished cycle; at final completion it is zero                                                                                      |
| `globalTurnNumber`, `activePlayerId`, `extraRoll`    | Basic-turn order; extraRoll is false in this wave                                                                                                                    |
| `roundDefinition`                                    | Explicit seat-cycle/trial/bankruptcy/extra-roll rule text                                                                                                            |
| `criteria`                                           | Actual groupsToWin=3, all cities on one side, landmarksToWin=4, survivorsToWin=1, full-cost asset formula, tie-break order and immediate-victory priority            |
| `players`                                            | Original seat order: playerId, seat, bankrupt, completedBasicTurns, completedLaps, trial; groups `{groupId,owned,total}`, sides `{side,owned,total}`, landmarksOwned |
| `survivors`                                          | Current survivor count                                                                                                                                               |
| `settlementPending`, `assetRanking`                  | Pending dice, mandatory toll or debt hides provisional ranking: assetRanking=null                                                                                    |
| `finalRanking`, `endReason`                          | Recorded final asset ranking and actual victory reason                                                                                                               |

`AssetRank`: `{playerId, seat, cash, propertyCost, total, bankrupt}`. The result dialog uses the recorded ranking and explicitly names the tie-break rules. Header and victory-progress modal rendering are owned by `poke-turn-ui`; this branch leaves header/HUD layout unchanged.

## Validation and preview

Completed once: seven match boundary tests; 24 existing core/victory/integration tests (including three real seeded games and presentation-ack/restart rejection). Typecheck and lint passed. No unrelated whole-suite expansion was performed.

Reproducible Chrome harness:

```powershell
node src/game/match/build-preview.mjs
npx vite preview --host 127.0.0.1 --port 5204 --strictPort --outDir artifacts/match-preview
node src/game/match/browser-check.mjs
```

Preview: http://127.0.0.1:5204/ ; clean harness: http://127.0.0.1:5204/src/game/match/preview.html . The harness starts a fresh real quick session, drives legal human/AI decisions without mutating state/RNG, fast-forwards earlier presentation, and mounts the actual UI before the final basic turn. Final movement, result and restart use production UI/adapter presentation acknowledgements.

Chrome 157, seed42: 19 completed rounds at T80; exactly 20 basic turns per seat after final completion; `round-limit-assets`, winner player2: 2487 = cash737 + property1750. Final modal shows all four scores and tie-break text. Finished financial command is blocked. Restart clears rounds/ranking and changes session; the actual setup flow starts another fresh standard game (30 rounds, T1/revision0). No page errors or failed requests. Evidence is under `docs/evidence/round-limited-match/`.
