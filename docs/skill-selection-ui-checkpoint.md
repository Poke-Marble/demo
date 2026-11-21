# Skill selection UI checkpoint

Checkpoint branch: `feat/skill-selection-ui`

Core API baseline: `fb646e7` (`feat: replace automatic cash traits with bounded 3PP starter skills`).

## Current state

- The working tree was clean at checkpoint time; no skill selection or activation UI changes had been started in this branch.
- The core API is present: `GameView.activeSkill`, opaque legal choices in the view/prompt, and `UIUpdate.skillActivations`.
- Core owner reported focused core/economy/skills/settlement and integration checks, typecheck, lint, and build passing for `fb646e7`.
- No UI-specific Chrome run, selection/activation/acknowledgement/cancellation check, or UI-only commit has been completed.
- Turn header `d7b51ed` has not been applied to this branch; integration owner is responsible for applying it.
- No push was performed from this branch.

## UI work remaining

Implement the independent skill selection and activation presenter, then add the minimal agreed integration hooks. Keep revealed dice values distinct from the resolved movement distance. Preserve the existing presentation acknowledgement and cancellation lifecycle. Do not calculate legality, RNG, movement paths, prices, or financial effects in UI. Render skill descriptions from the core catalog rather than copying values into a UI snapshot.

After implementation, run the required Chrome checks at 1280px and 390px, including opaque choice dispatch, skill activation, original-sum resource preservation, resolved-distance display, acknowledgement, and cancellation. Create a clean UI-only commit; do not push.
