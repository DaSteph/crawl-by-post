# 02: Dungeon file and graph-paper map

**What to build:** When creating a session, the GM uploads a hand-written dungeon file (JSON or YAML) describing rooms (grid position and size), corridor segments, exits/doors, GM-only notes and monsters per room (stats may be dice formulas; only parsed here). Invalid files are rejected with clear errors that say where the problem is. Everyone in the session sees the map: an SVG drawn in the black-and-white graph-paper style, with the start room revealed.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The dungeon parser turns valid JSON or YAML into a dungeon model, and returns errors that say where the problem is for invalid input (missing fields, overlapping rooms, exits that lead nowhere, a malformed dice formula)
- [ ] Input/output tests cover valid and invalid dungeon files
- [ ] The map is drawn as SVG from the geometry. The graph-paper grid runs everywhere, including inside rooms and corridors. Walls are ink lines and doors use standard map notation
- [ ] Only revealed rooms and corridor segments are drawn. The start room is revealed when the session is created
- [ ] GM-only notes are visible to the GM only
- [ ] The map reads well at phone width (about 400 px) and works on desktop
- [ ] Light and dark modes both follow the art direction (b/w only, no fire colour), as in the reference mockup linked in the spec
