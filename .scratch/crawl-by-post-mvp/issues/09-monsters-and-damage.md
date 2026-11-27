# 09: Monsters and damage

**What to build:** Monsters defined per room in the dungeon file can be placed by the GM, with HP rolled once from its dice formula and editable. The GM can also move and remove monster tokens. Players see each monster's condition (unhurt, wounded or near death), not its HP. Player attacks use the target monster's AC, and damage produces an HP change the GM confirms with one tap. The GM rolls monster attacks and damage in the open against the player's AC, and the player's HP change is also GM-confirmed. At 0 HP a character shows as "dying".

**Blocked by:** 05, 06

**Status:** done

- [x] The GM can place monsters from the room's list when revealing it or later. HP is rolled once from the formula and the GM can edit it
- [x] Monster tokens are black discs with short labels ("G1", "G2"). In dark mode they get the stronger light outline
- [x] The GM can move and remove monster tokens
- [x] Players see a monster's condition. The GM sees exact HP
- [x] An attack challenge against a monster uses its AC. A successful player damage roll suggests an HP subtraction that the GM confirms
- [x] A monster attack is an open one-tap roll against the player's AC, locked in the log, and damage suggests an HP subtraction that the GM confirms
- [x] A character at 0 HP is shown as "dying" and the GM rules on what happens
- [x] Engine tests cover HP suggestions not applying before confirmation, the condition thresholds, and dying at 0 HP

## Comments

**Agent (2026-11-27):** Implemented. Engine tests in `src/lib/engine/monsters.test.ts` cover placement and HP rolls, labels, token visibility, move/remove, condition thresholds, attacks against AC, suggestions that don't apply before confirmation (confirm, adjust, dismiss), monster attacks, and dying at 0 HP. Smoke-tested against the dev database through the form actions: place, reveal, pre-consent attack on G1 → pending suggestion, confirm → G1 shows "near death" to the player, monster attack, GM sets HP 0 → dying, move, remove. The UI still needs a look on a real phone, especially the monster tokens in dark mode.

- **State** (`src/lib/engine/monsters.ts`): `state.monsters` holds placed monsters as snapshots (id, name in the default language, AC, attacks, HP, max HP, position), so a later edit of the dungeon file doesn't change a monster mid-fight. `monsterCounts` per file label keeps token labels unique: removing G1 and placing again gives G2, never a second G1.
- **Placing** puts the monster on the first free square of its area. The GM can place before or after the reveal. HP is rolled from `hp` (a formula or a number), or as level × d8 + CON when the file gives none, with a minimum of 1. The GM edits HP and max HP together (0 ≤ HP ≤ max HP ≤ 999). Placement is one token per tap; the file's `count` shows next to the button as a hint. Placing and moving aren't logged, because players see them on the map.
- **Visibility**: players see monsters in revealed areas only, with their condition. HP, AC and attacks are only in the GM's view (`MapMonsterToken.gm`). Monsters block squares for player moves.
- **Conditions**: unhurt at full HP, near death at a third or less, wounded in between, plus a fourth one, **down**, at 0 HP. The GM decides what down means and removes the token.
- **HP suggestions**: a player hit against a targeted monster, and every hit from a monster attack, adds `state.hpChanges`. Only the GM sees them, in a "HP changes to confirm" box under the log: one tap confirms, the amount can be changed first, or the suggestion can be dismissed. Confirming a change logs `monsterHurt` (condition only, never HP, because the log is public) or `characterHurt` (amount). Removing a monster drops the changes waiting for it.
- **Attacks on a monster**: `CheckChoice.attack` takes an optional `target`, and the monster's AC replaces the DC. The challenge form lists the monsters on the map plus "Something else", which keeps the manual DC. The target goes with the challenge, the damage spotlight and the damage log entry, including the pre-consent and play-as paths.
- **Monster attacks**: `monsterAttack` is GM-only and only in the GM's turn. The GM picks an attack option, a target character and advantage. Every attack in the option is rolled, `count` times each (e.g. 2 claws + 1 bite), against the character's AC, with damage on a hit. Everything is logged in one `monsterAttack` entry, and the summed damage becomes one suggestion. A missing `bonus` counts as +0. The spotlight stays with the GM.
- **Dying**: a character at 0 HP gets `dying` on the sheet and map token (dashed and faded), a `dying` log entry and a `characterDying` event, emitted once when HP drops from above 0. HP never goes below 0. The GM can set a character's HP (0 to max) from the players list, to rule on healing or stabilising.
- **Styling**: new design tokens `--monster`, `--monster-text`, `--monster-outline` and `--monster-outline-width`: 1.5 px in light mode, 2.5 px in dark mode, where the outline follows `--ink`.
- Ticket 10's darkness preset for monster attacks can hook into the advantage choice in `MonsterPanel.svelte`. Ticket 11 can reuse `placeMonster` by adding a wandering source next to the area index.
