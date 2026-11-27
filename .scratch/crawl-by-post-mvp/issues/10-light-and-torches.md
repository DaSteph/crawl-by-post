# 10: Light and torches

**What to build:** A player lights a torch from their inventory with one tap. Each lit light source gets a secret 1d20+10 counter, which ticks once per completed player action (including skips and play-as turns), but not for GM turns, GM passes or separate challenge-accept turns. Players see only the flame level (bright, flickering, guttering) in the torch tracker. The GM sees and edits exact counters. A character is lit if a burning light source is in their room or corridor segment. Rooms without light are hatched over the grid. The challenge form presets disadvantage for players in darkness and advantage for monsters attacking them.

**Blocked by:** 05, 06

**Status:** done

- [x] Lighting a torch takes one tap and creates a secret counter of 1d20+10
- [x] Engine tests for the tick rules: one tick per completed player action, skips and play-as included. No tick for GM turns, GM passes or accept turns
- [x] The torch tracker shows a text label and three bars for the flame level. There's no colour or glow
- [x] The GM sees every counter and can edit it
- [x] Light is per room or segment, and moves with the character carrying the light source
- [x] A room without a burning light source is drawn hatched over the grid. The GM can override any room's light state
- [x] The challenge form presets disadvantage (with a 🌑 hint) for a player in darkness, and advantage for monster attacks against them. The GM can change either with one tap
- [x] A torch that reaches zero goes out with a log entry

## Comments

**Agent (2026-11-27):** Implemented. Engine tests in `src/lib/engine/light.test.ts` cover lighting (1d20+10), the tick rules (action posts, skips and play-as tick; GM responses, passes, GM timeouts, chat, accept turns, damage rolls and skipped challenges don't), flame levels and level changes, the counter at 1 going out after the next player action with a log entry, GM counter edits, what players and the GM see, light per area moving with its carrier, GM overrides, and the darkness presets. Smoke-tested against the dev database through the form actions: light, a second light rejected, an action ticks, a pass doesn't, the player's page data has `counter: null` while the GM's has the number, GM edit, override on and off, an out-of-range counter rejected, GM sets 0 → `torchOut`. Not looked at on a real phone yet, especially the hatching and the token flame in dark mode.

- **State** (`src/lib/engine/light.ts`): burning light sources live on the player slot (`lights`), so they move with the carrier and re-import (ticket 14) can leave them alone. `state.areaLight` holds the GM's overrides per area id; `lastLightId` numbers lights.
- **Ticks**: `burnLights` runs after every command, next to `keepTime`, and burns each light once per `playerActionCompleted` event. That event already existed and fires only for action posts, skips and play-as action turns, so the tick rules follow from it. Combat's one-tick-per-round (ticket 12) can hook in here, for example by ignoring `playerActionCompleted` in combat and ticking on `roundCompleted`.
- **Flame levels**: bright above 10, flickering 4–10, guttering 1–3. Every new torch (11–30) starts bright. `torchLevelChanged` is an event only, with no log entry: players see the change in the tracker. Going out is logged (`torchOut`), whether it burned down or the GM set it to 0.
- **Lighting** works any time, also out of turn, and doesn't count as an action. A character can carry only one burning light at a time, which also stops a double tap from burning two torches. The engine doesn't count torches: the gear list is read-only from the import, and loot goes into free-text inventory, so the button hint asks the player to cross the torch off themselves.
- **GM**: the counter editor sits under the torch tracker ("Torch counters", GM only). Edits aren't logged, because the log is public. Each area in "Rooms and corridors" has a three-way light control (carried light / always lit / always dark) that saves on tap.
- **View**: `MapArea.lit` and `lightOverride` (GM only), `MapToken.carriesLight` and `dark`, plus `MapView.lights` (counter null for players). Players see every light at the table and who stands in darkness: light is table knowledge, only the number is secret.
- **UI**: dark areas are hatched over the grid with the existing `--hatch` token, and carriers get a small ink flame on their token, as in the style mockup. The tracker shows chips with a text label and three bars, and a dashed chip for each character in darkness. The challenge form presets disadvantage with a 🌑 hint. The monster attack form presets advantage for a dark target, and switching the target resets the preset.
