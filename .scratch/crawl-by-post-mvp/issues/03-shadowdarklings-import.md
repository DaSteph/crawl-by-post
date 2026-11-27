# 03: Shadowdarklings import

**What to build:** A player opens their link and uploads their Shadowdarklings JSON export. They get a read-only character card (class, level, ability scores, AC, weapons, gear, spells), their current HP is tracked, and their token appears in the start room as a disc in the slot's colour with the character's initials.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Before implementing, confirm the field mapping against a real Shadowdarklings export and add it as a test fixture
- [ ] The importer maps name, class, level, ability scores and modifiers, AC, max HP, weapons (attack bonus and damage formula), gear and spells onto the character model
- [ ] Input/output tests cover the fixture and malformed exports, with clear error messages
- [ ] The read-only character card is reachable from the session screen
- [ ] Current HP starts at max HP and is shown on the card
- [ ] The token appears in the start room in the slot's colour with the character's initials. Initials keep players identifiable without relying on colour
- [ ] Each player has a free-text inventory they can edit
