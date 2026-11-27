# 02: Dungeon file and graph-paper map

**What to build:** When creating a session, the GM picks a hand-written dungeon file (JSON or YAML) from a directory on the server (files on disk, not in the database). The file describes rooms (grid position and size), corridor segments, exits/doors, GM-only notes and monsters per room (stats may be dice formulas; only parsed here), and per-language mood texts for rooms and corridor segments. Format: `../dungeon-format.md`. Invalid files are rejected with clear errors that say where the problem is. Everyone in the session sees the map: an SVG drawn in the black-and-white graph-paper style, with the start room revealed.

**Blocked by:** 01

**Status:** done

- [x] The dungeon parser turns valid JSON or YAML into a dungeon model, and returns errors that say where the problem is for invalid input (missing fields, overlapping rooms, exits that lead nowhere, a malformed dice formula)
- [x] Monsters can be written as separate fields or as the one-line stat block copied from the book (`statblock:`), and both produce the same model. Separate fields override the stat block
- [x] Dungeon files are read from `DUNGEONS_DIR`. The GM picks one when creating a session, and invalid files are listed with their errors and can't be picked. The session stores only the dungeon id, and the parsed model is never saved
- [x] The repo ships `dungeons/example.yaml` with invented content
- [x] Rooms and corridor segments can carry a mood text (read-aloud prose). All prose fields are localized: a plain string (default language) or one text per language listed in the file's `languages`
- [x] Input/output tests cover valid and invalid dungeon files
- [x] The map is drawn as SVG from the geometry. The graph-paper grid runs everywhere, including inside rooms and corridors. Walls are ink lines and doors use standard map notation
- [x] Only revealed rooms and corridor segments are drawn. The start room is revealed when the session is created
- [x] GM-only notes are visible to the GM only
- [x] The map reads well at phone width (about 400 px) and works on desktop
- [x] Light and dark modes both follow the art direction (b/w only, no fire colour), as in the reference mockup linked in the spec

## Comments

**2026-11-27 (agent):** Implemented.
- Format agreed in `../dungeon-format.md`, adapted to the Shadowdark rulebook: stat-block fields, an optional one-line `statblock`, HP rolled the book's way (level × d8 + CON) when it's left out, `danger` (preselects "Start crawl"), `wandering` monsters, and per-language mood texts for rooms and corridor segments.
- Dungeon files live in `DUNGEONS_DIR` (agreed with the author: on disk, not in the database). The session stores only `dungeonId` and `revealed`. `src/lib/server/dungeons.ts` parses files on demand and caches them by modification time.
- Code: parser `src/lib/dungeon/parse.ts`, stat block `src/lib/dungeon/statblock.ts`, dice formulas `src/lib/engine/dice.ts` (parse only), per-role map view `src/lib/engine/map.ts`, geometry `src/lib/map/geometry.ts`, SVG `src/lib/map/DungeonMap.svelte`.
- Errors are sorted by line. An area that fails to parse doesn't cause extra errors in the exits or the start that point to it.
- The GM also sees unrevealed areas, as dashed walls only they see, plus secret doors ("S") and a list of all areas with read-aloud text, notes and monsters. Players get only revealed areas and the non-secret exits of those areas. The GM needs the full layout to run the dungeon, and ticket 05's manual reveal builds on that.
- Not done here, as planned: drafting the mood text on reveal (ticket 05), rolling dice (ticket 06), choosing a session language (content shows in the file's default language for now).
- Sessions created before this ticket have no dungeon. Their page tells the GM so instead of failing.
