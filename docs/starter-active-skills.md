# Starter active skills

This is the approved Poke validation-start plan, not Pokémon video-game effect numbers and not a claim of demonstrated balance. Old cash traits remain isolated historical modules; production `integration/settlement.ts` validates receipts and returns the economy result without any trait grants.

## Rules

- Initial 3 PP per player, no recharge or separate cooldown. One actual use per own basic turn. Free original-sum choice changes neither PP nor the used flag.
- Vine Whip / Water Gun: reveal original two dice before moving, choose original sum or -1 / +1, bounded to 2–12. A clamped no-op adjustment is not offered. No dice-range replacement or free landing discount.
- Ember: mandatory landing toll 25%, cap 100. Thunder Shock: legal normal-city takeover 20%, cap 100. Final cities and landmarks retain takeover immunity.
- Every starter may instead spend the same PP on shared Breakthrough: toll 15%, cap 60. Signature and shared effects never stack.
- Only fire→grass, water→fire, grass→water, electric→water gain +10 percentage points and +25 cap for economic skills. No resistance penalty, passive type discounts, or grass→electric advantage.
- Blessing and skill compose in the authority quote. Skill net savings versus the same blessed baseline never exceed its cap; a positive skill-discounted obligation remains at least 1. Original blessing-only rounding is preserved. Quote projection never consumes either resource.
- Trials, flight/forced arrivals do not allow skill use. A movement adjustment from a normal roll may land on a special tile; PP is spent before entering it. No doubles feature is implemented in this branch; future third-double penalties must bypass the pending movement-choice window.

## Serialized contract and ownership

`game/skills/index.ts` owns catalog, PP ledger, availability, economic rates/caps, and pure lifecycle helpers. `CoreState.skills` is optional for historical core-only consumers and enabled by `createGame(..., {skills:true})` in production. It stores `schemaVersion:1`, `rulesVersion:'validation-start-1'`, `players[id]:{pp,usedThisBasicTurn,prepared}`, and `lastEndedTurn`. `prepared` is null or `{mode,tileId,kind}`; it persists with a discounted debt until settlement. `completeSkillBasicTurn` is idempotent and resets only the turn-use flag/preparation, never PP. Successful basic `end-turn` calls it; extra rolls must not. Finished state clears preparation. Restart creates a fresh ledger.

`core.pendingDice:{values:[die,die]}` stores only public original eyes. `roll-dice` returns `dice-revealed` without moving/START reward/landing. `resolve-dice {playerId,adjustment:-1|0|1}` validates the legal adjustment, spends only when changed, then performs movement and landing. `dice-rolled.distance` gives the authoritative adjusted path length; original `values` remain unchanged. Pending dice cannot be rerolled or ended early.

`economy.pendingToll:{tileId,landingId}` delays the mandatory payment until `pay-toll {landingId}` or `use-skill {mode:'signature'|'breakthrough',tileId,landingId}`. `Landing.skillEligible:false` serializes flight/forced arrival exclusion, including later takeover. Toll skill commits immediately settle or lock a discounted debt; takeover skill commits immediately acquire the city. Failed commands consume nothing. Existing session/revision/fingerprint receipts protect duplicate command delivery and conflicts.

`getLegalActions` is the single human/AI candidate authority. `quoteSkillUse(state,context,playerId,tileId,mode,kind)` supplies a pure projected quote. The `skill-activated.activation` event includes stable `id`, `playerId`, `pokemonId`, `type`, `name`, `description`, `mode`, and `skillSavings` (authoritative marginal liability saving after blessing; zero for movement). For deferred debt this records the locked obligation reduction, not money already recovered by the creditor.

`ui/game/adapter.ts` exports `GameView.activeSkill:{definition,statusLabel,cooldownLabel,unavailableReason?,choice?:UIChoice}` and `UIUpdate.skillActivations`. The legacy `cooldownLabel` field now displays remaining PP and no recharge; it is not a cooldown. The full opaque legal choice set remains in `actions`/`prompt`; `activeSkill.choice` is only a convenience for the first skill option. Select via `adapter.choose(selectionId,choiceId)`. UI does no RNG, pricing, resource arithmetic or legality inference. The status label includes revealed dice and sum. The separate UI worker owns `ui/game/skills` and minimal `ui/game/index.ts` hooks; AI worker owns public outlooks/planning.

Save consumers must preserve the full skills ledger, pending dice, pending toll, landing eligibility, prepared debt, blessing state and processed-command receipts together. JSON round trips at these boundaries are regression-tested; no new save feature is included.
