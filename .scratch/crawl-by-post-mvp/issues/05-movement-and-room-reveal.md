# 05: Movement and room reveal

**What to build:** The spotlight player taps a square to move their token anywhere through known rooms and exits, with no enforced distance limit. A token that reaches the doorway of an unknown room stops there. In their turn, the GM reveals the room together with a description. Revealed rooms stay visible for good. The GM can also hide or reveal any room or corridor segment by hand.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The spotlight player can move their token with one tap to any reachable square in known rooms and corridors. Out-of-turn moves are rejected
- [ ] Engine test: a move toward an unknown room stops at the doorway
- [ ] The GM can reveal the room behind a doorway with a description post. The room is then drawn on the map for everyone
- [ ] Revealed rooms stay revealed. The GM can hide or reveal any room or segment by hand (secret doors, collapses)
- [ ] When the GM reveals a room or segment that has a mood text, the GM's compose box is prefilled with it in the session language (falling back to the file's default language). It stays an editable draft and is never posted automatically
- [ ] The unknown room behind a doorway is shown only as a dashed "?" marker
- [ ] Tap targets are at least 44 px
