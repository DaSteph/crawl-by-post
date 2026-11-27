# 03: Shadowdarklings import

**What to build:** A player opens their link and uploads their Shadowdarklings JSON export. They get a read-only character card (class, level, ability scores, AC, weapons, gear, spells), their current HP is tracked, and their token appears in the start room as a disc in the slot's colour with the character's initials.

**Blocked by:** 02

**Status:** done

- [x] Before implementing, confirm the field mapping against a real Shadowdarklings export and add it as a test fixture
- [x] The importer maps name, class, level, ability scores and modifiers, AC, max HP, weapons (attack bonus and damage formula), gear and spells onto the character model
- [x] Input/output tests cover the fixture and malformed exports, with clear error messages
- [x] The read-only character card is reachable from the session screen
- [x] Current HP starts at max HP and is shown on the card
- [x] The token appears in the start room in the slot's colour with the character's initials. Initials keep players identifiable without relying on colour
- [x] Each player has a free-text inventory they can edit

## Comments

**Field mapping, confirmed against two real exports** (`src/lib/character/fixtures/`: a level-3 elf ranger and a level-2 human witch):

- `name`, `class`, `level`, `ancestry`, `title`, `alignment` are used as given. Names carry a campaign suffix ("Gelan (Arden Vul)"); the card shows it, while token initials ignore it (`Ge`; two words give `RS`).
- `stats` already include talent bonuses. Modifiers follow the Shadowdark table, clamped to −4…+4. `rolledStats` is ignored.
- `armorClass` and `maxHitPoints` are taken as precomputed totals.
- **Weapons come from `attacks`, not `gear`**: gear entries carry no weapon stats. Lines look like `LONGBOW: +5 (F), 1d8 (2H)`, with the bonus already including every talent and ancestry bonus. The range code is optional (C/N/F) and properties are optional. Lines the importer can't read are kept verbatim as `otherAttacks` instead of failing the import.
- Casters get a `SPELLS: … roll 1d20+5 …` line, which becomes `spellcasting: 5` (for spell attack challenges later). `spellsKnown` is a comma-separated string, or `"None"`.
- Gear quantity comes from `totalUnits` (Arrows 20, Rations 3). `treasures` and `magicItems` become treasures with their descriptions.
- Ignored: `ledger`, `levels`, `bonuses`, `edits`, coins, gear slots, XP, deity, background.

Engine: `importCharacter` (the player only, and only once; re-import is ticket 14) and `editInventory`. HP starts at max. The token goes on the first free square of the start room. `sheets()` gives a player their own card and the GM every card.
