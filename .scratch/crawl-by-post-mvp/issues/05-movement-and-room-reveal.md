# 05: Movement and room reveal

**What to build:** The spotlight player taps a square to move their token anywhere through known rooms and exits, with no enforced distance limit. A token that reaches the doorway of an unknown room stops there. In their turn, the GM reveals the room together with a description. Revealed rooms stay visible for good. The GM can also hide or reveal any room or corridor segment by hand.

**Blocked by:** 04

**Status:** done

- [x] The spotlight player can move their token with one tap to any reachable square in known rooms and corridors. Out-of-turn moves are rejected
- [x] Engine test: a move toward an unknown room stops at the doorway
- [x] The GM can reveal the room behind a doorway with a description post. The room is then drawn on the map for everyone
- [x] Revealed rooms stay revealed. The GM can hide or reveal any room or segment by hand (secret doors, collapses)
- [x] When the GM reveals a room or segment that has a mood text, the GM's compose box is prefilled with it in the session language (falling back to the file's default language). It stays an editable draft and is never posted automatically
- [x] The unknown room behind a doorway is shown only as a dashed "?" marker
- [x] Tap targets are at least 44 px

## Comments

**Implementation notes:**

- Engine: `src/lib/engine/movement.ts`. New commands are `moveToken` and `setAreaRevealed` (reveal or hide). Like `importCharacter`, both take the dungeon model. New events are `tokenMoved` (with `stoppedAt` set to the unknown area when a doorway stopped the move) and `areaHidden`. New log entries are `doorway` (which area stays secret) and `revealed`.
- Moving doesn't pass the spotlight. The spotlight player taps a square (the token moves right away), then posts their action. A move is allowed only in a crawl, on your own turn, onto a free square. The engine doesn't enforce any distance limit.
- Reachability is a flood fill through revealed areas, crossing only at exits (including the implicit corridor joints). Every exit type can be passed, because the engine doesn't track locks or portcullises; the GM rules on them. A secret exit only counts once both of its sides are revealed. Players also see it on the map from then on, as "found".
- To move toward an unknown area, you target the first square beyond a doorway (the "?" marker). Any other square in an unknown area is rejected, so players can't find the shape of a room by probing coordinates.
- `MapView` gets `unknown` (the "?" markers; only the GM gets the area id) and `moves` (reachable squares and doorways, only for the spotlight player). `mapView` takes the viewer's seat as an optional 4th argument.
- The GM can reveal or hide an area at any time, not only on their own turn, since it's a ruling. Hiding an area a token stands in is rejected. On a successful reveal, the area's mood text (already localized in the GM's map view) is added to the GM's draft through `Compose.insert()`. It's appended if a draft already exists and is never posted automatically.
- GM UI: when a token stands at the way into an unknown area, an "At a doorway" box under the map offers a one-tap Reveal. Every area in "Rooms and corridors" also has a Reveal/Hide button.
- Map: squares are now a fixed 44 px on screen, so every square is a 44 px tap target. The map sits in a scroll box and scrolls to the viewer's token on load. Reachable squares show a faint dot.
