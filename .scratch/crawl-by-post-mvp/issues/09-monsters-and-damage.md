# 09: Monsters and damage

**What to build:** Monsters defined per room in the dungeon file can be placed by the GM, with HP rolled once from its dice formula and editable. The GM can also move and remove monster tokens. Players see each monster's condition (unhurt, wounded or near death), not its HP. Player attacks use the target monster's AC, and damage produces an HP change the GM confirms with one tap. The GM rolls monster attacks and damage in the open against the player's AC, and the player's HP change is also GM-confirmed. At 0 HP a character shows as "dying".

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] The GM can place monsters from the room's list when revealing it or later. HP is rolled once from the formula and the GM can edit it
- [ ] Monster tokens are black discs with short labels ("G1", "G2"). In dark mode they get the stronger light outline
- [ ] The GM can move and remove monster tokens
- [ ] Players see a monster's condition. The GM sees exact HP
- [ ] An attack challenge against a monster uses its AC. A successful player damage roll suggests an HP subtraction that the GM confirms
- [ ] A monster attack is an open one-tap roll against the player's AC, locked in the log, and damage suggests an HP subtraction that the GM confirms
- [ ] A character at 0 HP is shown as "dying" and the GM rules on what happens
- [ ] Engine tests cover HP suggestions not applying before confirmation, the condition thresholds, and dying at 0 HP
