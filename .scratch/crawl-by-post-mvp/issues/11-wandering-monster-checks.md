# 11: Wandering monster checks

**What to build:** In crawl mode, every N completed rounds (unsafe 3, risky 2, deadly 1, based on the danger level chosen at "Start crawl"), the GM gets a prompt that a wandering monster check is due. With one tap the GM sets the check as a challenge for the next spotlight player (or another player), or postpones or skips it.

**Blocked by:** 06

**Status:** done

- [x] Engine tests: a check-due event fires after the right number of completed rounds for each danger level
- [x] The GM sees a "wandering monster check due" prompt
- [x] With one tap the check becomes a challenge, by default for the next spotlight player, and the GM can pick another player
- [x] The GM can postpone or skip the check, and the round counter continues
- [x] The check is rolled by the player as a normal challenge (pre-consent applies)

## Comments

**Agent (2026-11-27):** Implemented. Engine tests in `src/lib/engine/wandering.test.ts` cover the rhythm for each danger level (unsafe 3/6, risky 2/4/6, deadly every round), no second due event while one is waiting, a new crawl clearing the check, the default target (next in spotlight order, wrapping), picking another player, the 1d6 roll (1 = monster), returning to the GM turn the check came from (after a roll, a decline, a timed-out skip and a played timeout), pre-consent, no torch tick, postpone and skip, rejections, and placing wandering monsters. Smoke-tested against the dev database through the form actions: deadly crawl → due after round 1, a bad decision and a player's attempt rejected, set → challenge for the next player with `returnTo`, accept → back to the GM after the player who acted, postpone, set for another seat, decline, a wandering monster placed in c1, an unknown index rejected. Not looked at on a real phone yet.

- **Roll** (decided with the user): Shadowdark's 1d6, where a 1 brings a wandering monster. It's a new check type, the **committed roll** (`CommittedRoll` in `challenges.ts`: `sides`, `on`, `purpose: 'wandering'`), so it uses the normal challenge flow: accept or back out, pre-consent, timeouts and play-as all work unchanged. `dc` and `edge` are 0 and null for it and the UI hides them. The result goes into a `committedRoll` log entry with `triggered`.
- **Rhythm** (`src/lib/engine/wandering.ts`): `watchRounds` runs after every command, next to `burnLights`, and checks for `roundCompleted` events. When `round % CHECK_EVERY[danger] === 0` it sets `crawl.wanderingCheck = 'due'` and emits `wanderingCheckDue`. The check lives on the crawl, so a new crawl starts clean. A due check isn't logged: it's the GM's knowledge until the GM sets it.
- **Who rolls**: by default the next player in spotlight order after the GM's turn. Setting the check only works in the GM's turn. When the check goes to someone other than the player who just acted, the challenge gets `returnTo`, so a roll, a decline or a skipped timeout hands back to the GM turn it came from and the next player still gets their own turn. Pre-consent only covers the player who just acted (it's their consent).
- **Postpone / skip**: both work any time, not only in the GM's turn, and don't move the spotlight. A postponed check comes due again when the next round completes, even off the regular rhythm. A postponed check can still be set early. Skip drops it, and the next check comes at the regular rhythm. The round counter never changes.
- **Extra**: the dungeon file's `wandering` monsters (dungeon-format.md: "the GM can place them anywhere when a check hits") can now be placed. `placeMonster` takes `wandering: true`, and `index` then points into `dungeon.wandering`. The monsters card has a "Wandering monsters" section with an area picker that defaults to the area of the player in or just out of the spotlight. `MapView.wandering` is GM only.
- **UI**: `WanderingPrompt.svelte` sits above the challenge form in the log card. It has a player picker (next player preselected), "Set check for X" (or "X rolls now" with pre-consent), Postpone and Skip. Outside the GM's turn it shows only Postpone/Skip. A postponed check shows a dashed prompt.
- Ticket 12 (pause in combat) can hook in at `watchRounds`, by returning early when the crawl is in combat mode.
