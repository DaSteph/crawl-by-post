# Spec: crawl-by-post MVP: async OSR dungeon crawl on the phone

Status: ready-for-agent

## Problem Statement

Adults with jobs, kids and different time zones can't find a shared evening for their OSR game, so they try play-by-post. On Discord, posts grow into walls of text, nobody knows whose turn it is, and fights never get settled. Apps built for 5e automate and enforce every rule, which takes rulings away from the GM, and rulings are the heart of OSR play. As the GM of a Shadowdark group, I want to run a dungeon asynchronously in short phone-sized turns, with a clear rhythm, and still make every ruling myself.

## Solution

crawl-by-post is a mobile-first PWA that plays like a board game. The spotlight passes GM → Player 1 → GM → Player 2 → … Each turn is short. Whoever holds the spotlight gets a push notification, takes their turn in a couple of minutes, and closes the app. Dice only come out when the GM sets a challenge and the player accepts it, either beforehand (pre-consent) or explicitly. Torches burn down by turns, not minutes, so darkness stays close even if the game runs for weeks. The app keeps track of state (spotlight, torches, HP, revealed rooms) and suggests mechanical consequences. The GM always decides.

The first milestone is a playable prototype: one hand-authored dungeon, 2–4 players, spotlight turns with push notifications, GM challenges, torch timers, monsters, and Shadowdarklings character import. It gets tested with the author's own group. Success means the GM (the author) has fun and wants to continue.

## User Stories

### Sessions & access

1. As a GM, I want to create a new session from the start page without an account, so that I can set up a table in a minute.
2. As a GM, I want to receive my secret GM link on a "save this link" screen, so that I understand it is my only key to the session.
3. As a GM, I want to add 2–4 player slots and get an individual secret link for each, so that I can send each player their own link.
4. As a GM, I want to regenerate a player's link, so that a lost or leaked link can be replaced and the old one stops working.
5. As a player, I want to join a session by opening my secret link, so that I don't need an account or password.
6. As a player, I want to be in several sessions at the same time, each with its own link, so that I can play at more than one table.
7. As a GM, I want many sessions to run side by side on the same server, so that I (or other GMs) can run more than one table.

### Onboarding & notifications

8. As a player, I want an onboarding flow that walks me through adding the app to my home screen, allowing notifications and receiving a test push, so that I know notifications will actually reach me.
9. As a player, I want a push notification when the spotlight passes to me, so that I don't have to keep checking the app.
10. As a player, I want the notification to open the map centred on my token, together with a summary since my last turn, so that I can act right away.
11. As a player, I want a reminder notification when my turn has been waiting 12 hours, so that I don't miss it.
12. As a GM, I want a push notification when the spotlight comes back to me, so that I can keep the game moving.
13. As a GM, I want a push notification when a player's turn times out, so that I can make a ruling about it.

### Characters

14. As a player, I want to upload my Shadowdarklings JSON export, so that my character is ready to play without typing anything in.
15. As a player, I want to see my imported character as a read-only card (stats, class, spells, gear), so that I can check my abilities during play.
16. As a player, I want my current HP, light sources and free-text inventory tracked in the app, so that the table always knows my state.
17. As a player, I want to edit my own free-text inventory, so that I can record loot and items I've used up.
18. As a player, I want to re-import my Shadowdarklings JSON after a level-up, so that my stats, AC, max HP and weapons are updated without resetting my current HP, light sources or inventory.
19. As a GM, I want a log entry whenever a player re-imports, and re-import to be blocked while that player holds the spotlight unless I approve it, so that sheets don't change in the middle of an action.
20. As a GM, I want the app to show "dying" when a character reaches 0 HP, so that I can rule on what happens next.

### Spotlight & turn rhythm

21. As a player, I want to see clearly whose turn it is, so that I know whether I'm expected to act.
22. As a spotlight player, I want to post a short action and move my token, so that I can take my turn with one thumb.
23. As a non-spotlight player, I want to be able to chat at any time, with a gentle out-of-turn warning, so that I can join the table talk without taking someone else's turn.
24. As a reader of the log, I want out-of-turn chat shown quieter and collapsed, so that spotlight posts and rolls stand out.
25. As a GM, I want a turn between every player turn, so that every action can get a consequence before the next player acts.
26. As a GM, I want to pass the spotlight on with one tap when an action needs no response, so that my turns cost almost nothing.
27. As a GM, I want my turn to auto-pass after the timeout (24 h by default) if I do nothing, so that a busy GM doesn't freeze the table.
28. As a GM, I want to set the turn timeout per session (24 h by default, for both players and GM), so that I can match my group's pace.
29. As a GM, when a player's turn times out, I want to choose between skipping them, waiting longer and playing their character for this turn, so that an absent player becomes a ruling and not a punishment.
30. As a GM playing an absent character, I want to post on their behalf with a visible note in the log, so that everyone knows who acted.

### Crawl mode & initiative

31. As a GM, I want to start a crawl by tapping "Start crawl" and choosing a danger level (unsafe, risky or deadly), so that the app knows how often to check for wandering monsters.
32. As a table, we want initiative rolled automatically (d20 + DEX for each character, using the imported stats) when a crawl starts, with the results locked in the log, so that we don't have to wait for everyone before the first move.
33. As a table, we want the spotlight to go to the initiative winner and then continue in seat order, so that turn order is clear.
34. As a GM, I want a round to count as complete each time the spotlight returns to the first player, so that wandering monster checks and other per-round rules have a clear clock.
35. As a GM, I want a prompt every N rounds (unsafe: 3, risky: 2, deadly: 1) saying a wandering monster check is due, so that I don't have to count.
36. As a GM, I want to set the wandering monster check as a challenge with one tap (by default for the next spotlight player), or postpone or skip it, so that the check stays my ruling.

### Combat mode

37. As a GM, I want to tap "Start combat" to switch the table into combat mode, so that the app changes to round-based timing.
38. As a table, we want initiative rolled automatically when combat starts (each character d20 + DEX, monsters rolling once as the GM's side), so that the fight order is clear.
39. As a player, I want a clear combat indicator (for example a red edge or a ⚔️ banner), so that I know rounds are now ticking down instead of individual actions.
40. As a GM, I want wandering monster checks paused during combat, so that a fight doesn't trigger extra encounters.
41. As a GM, I want combat to keep the same GM → player rhythm, so that I can set each challenge in response to what the player wrote.
42. As a GM, I want to have monsters act in whichever GM turn I choose, so that the app doesn't enforce a monster slot.
43. As a GM, I want to tap "End combat" to return to crawl mode, which immediately starts a new crawl with fresh initiative and a danger level, so that exploration resumes cleanly.

### Challenges & dice

44. As a GM, I want to set a challenge as either a test (STR/DEX/CON/INT/WIS/CHA) or an attack (melee/ranged/spell), so that the right modifier is used.
45. As a GM, I want to pick a DC from quick choices (9, 12, 15, 18, with 12 preset) or type one in, so that setting a test takes one tap.
46. As a GM, I want an attack challenge to use the target monster's AC, so that I don't have to look it up.
47. As a GM, I want to add a short line describing the stakes ("If you fail, the floor gives way"), so that the player knows what is at risk.
48. As a player, I want to see the DC and the stakes before rolling, so that I can make a real choice about whether to go ahead.
49. As a player, I want to tick "I'll roll whatever you set" when writing my action, so that the roll happens the moment the GM sets the challenge and my action costs two handoffs instead of four.
50. As a player who didn't pre-consent, I want the spotlight to come back to me when the GM sets a challenge, so that I can accept or back out.
51. As a player, I want my roll (d20 + modifier from my character, with advantage or disadvantage) made instantly and locked in the log, so that results can't be disputed.
52. As a table, we want the app to show success or failure against the DC, so that the outcome is clear while the GM narrates what follows.
53. As a player whose attack hit, I want a "Roll damage" button for my weapon's damage, so that I can resolve the hit in the same turn.
54. As a GM, I want the app to suggest subtracting the damage from the target monster's HP and confirm it with one tap, so that HP tracking is quick and stays my call.
55. As a GM, I want to roll monster attacks and damage in the open with one tap, against the player's imported AC, with the result locked in the log, so that monster rolls are as trustworthy as player rolls.
56. As a GM, I want the app to suggest subtracting monster damage from the player's HP and confirm it with one tap, so that player HP stays accurate.
57. As a table, we want no hidden rolls at all, so that every roll is visible.

### Light & torches

58. As a player, I want to light a torch from my inventory with one tap, so that the light gets tracked.
59. As a GM, I want every newly lit torch to get a secret counter of 1d20+10, so that nobody knows exactly when it will die.
60. As a table, we want each lit light source to tick once per completed player action (including skipped turns and turns the GM plays for an absent player), but not for GM turns, GM passes or separate challenge-accept turns, so that the clock follows the fiction.
61. As a table, we want light sources to tick once per round in combat, so that fights don't burn through torches.
62. As a player, I want to see each light source only as bright, flickering or guttering, so that I feel the darkness approaching without knowing the exact number.
63. As a GM, I want to see and edit every light source's exact counter, so that I can adjust it as a ruling.
64. As a table in combat, we want a torch that runs out to be detected on the GM/monster turn and then go out on a random player turn after that, so that darkness falls without warning.
65. As a player, I want my light to count for whatever room I'm in, so that it matters who carries the torch when we split up.
66. As a player in a room with no burning light source, I want that room drawn with hatching, so that I can see I'm in the dark.
67. As a GM, I want the challenge form to preset disadvantage (with a 🌑 hint) for a player in darkness, and advantage for monsters attacking characters in darkness, so that I don't have to remember it and can still change it with one tap.
68. As a GM, I want to override any room's light state, so that special light (magic, daylight, a fire) can be ruled on.

### Dungeon & map

69. As a GM, I want to load a hand-written dungeon file (JSON or YAML) when creating a session, so that I can prepare the test dungeon once without an editor.
70. As a GM, I want the dungeon file to describe rooms (grid position, size, exits), corridors, GM-only notes and monsters per room, so that everything for a session is in one place.
71. As a GM, I want monster stats in the dungeon file to support dice formulas (for example `hp: 2d6`, `damage: 1d6+1`), so that I can copy stat blocks straight from the book.
72. As a GM, I want a monster's HP rolled once when I place it or reveal its room, and to be able to edit the result, so that each monster is a bit different and stays under my control.
73. As a GM, I want clear validation errors if my dungeon file is malformed, so that I can fix it before the session starts.
74. As a player, I want to see the explored dungeon as a grid with tokens, so that I can understand the space at a glance on my phone.
75. As a spotlight player, I want to tap a square to move my token anywhere through known rooms and exits, with no enforced distance limit, so that moving takes one tap.
76. As a spotlight player, I want my token to stop at the doorway of an unknown room, so that the GM can reveal what's behind it.
77. As a GM, I want to reveal a room during my turn together with a description (and possibly a challenge), so that revealing new rooms stays my best moment.
78. As a table, we want revealed rooms to stay visible for good, so that the map builds up as we explore.
79. As a GM, I want to hide or reveal any room by hand, so that I can rule on secret doors, collapses and similar events.
80. As a GM, I want to place, move and remove monster tokens, so that the board shows the encounter.
81. As a player, I want to see a monster's condition (unhurt, wounded or near death) rather than its HP numbers, so that combat keeps its mystery.

### Log & reading

82. As a player opening my turn, I want a filtered excerpt of everything since my last turn (spotlight posts, rolls, HP changes, room reveals), with side chat collapsed ("+7 chat messages"), so that I can catch up in a minute.
83. As a reader, I want the log to show spotlight posts and rolls first and collapse side chat, so that what matters stands out.
84. As a player, I want a character counter that appears from 200 characters and turns red above 300 (400/600 for the GM), so that I'm nudged toward short posts without being blocked.
85. As a reader, I want long posts collapsed with "read more", so that the log stays scannable.
86. As a player, I want my unsent draft kept across an app restart, so that I don't lose a half-written turn.
87. As a player without a connection, I want a clear message that posting needs a connection, so that I know why I can't send.

### GM on desktop

88. As a GM, I want the same app to work comfortably on a desktop browser, so that I can use a bigger screen for managing the board when I want to.

## Implementation Decisions

### Architecture

- **One TypeScript codebase**: SvelteKit with the Node adapter, Postgres for persistence, and `pg-boss` (Postgres-backed job queue) for timeouts, reminders and push delivery, all running in a single long-running Node process.
- **PWA**: installable through a web manifest and service worker (`@vite-pwa/sveltekit` or equivalent). The service worker is used for installability and web push, **not** for offline play.
- **Deployment**: a Docker Swarm stack on the author's existing vserver, behind Traefik with Let's Encrypt. Postgres either runs as a service in the stack or uses an existing instance (configurable).
- **No offline mode**: posting requires a connection. Only the compose-box draft is kept locally.
- **UI language**: English only, with all UI text kept in one place so translation is possible later.

### Modules

1. **Game engine (deep module, pure, shared)**: the single place where game rules live.
   - Interface: `applyCommand(state, command, { dice, now }) → { state, events }` or a rejection with a reason.
   - `dice` is an injected roller and `now` is an injected clock, so the engine is fully deterministic in tests.
   - Commands include: post action (with optional token move and pre-consent flag), post chat, set challenge, accept challenge, decline challenge, roll damage, GM pass, GM reveal or hide room, GM place, move or remove monster, GM confirm HP change, GM edit monster HP, GM edit torch counter, GM override room light, light a light source, edit inventory, start crawl (with danger level), start combat, end combat, set wandering monster check, postpone or skip wandering monster check, timeout fired, GM resolve player timeout (skip, wait or play-as), import character, re-import character.
   - Events include: log entries (with visibility and prominence, e.g. spotlight, roll, quiet chat, late, GM-only), spotlight changed, notify participant, schedule timeout, cancel timeout, schedule reminder, torch level changed, torch extinguished, wandering monster check due, character dying, re-import pending approval.
   - The engine owns: spotlight order (initiative winner, then seat order, with a GM turn between players), round counting, mode (crawl or combat), torch counters and tick rules, light per room, darkness presets for advantage/disadvantage, challenge lifecycle, roll resolution, HP changes as GM-confirmed suggestions, and room reveal state.
   - Everything the GM can change is a suggestion plus confirmation or a direct override. The engine never applies a ruling by itself, apart from the mechanical bookkeeping above.

2. **Server adapter (thin)**: SvelteKit endpoints authenticate the request by `sessionId` + secret, load the session state, call the engine, save the new state plus events in one transaction, and turn events into side effects: web push sends, `pg-boss` jobs for timeouts and reminders. Fired jobs re-enter the engine as `timeout fired` commands.

3. **Dungeon file parser**: reads JSON/YAML into a validated dungeon model containing rooms (grid rect), corridors/segments, exits/doors, GM notes, and monsters per room with stat fields that may be dice formulas. Returns clear, located validation errors.

4. **Dice formula evaluator**: parses and rolls `NdM±K` style formulas (used by the dungeon model, weapons and damage). Lives alongside the engine and takes the injected roller.

5. **Shadowdarklings importer**: maps a Shadowdarklings JSON export onto the character model: name, class, level, ability scores and modifiers, AC, max HP, weapons (attack bonus, damage formula), gear and spells (shown read-only). Re-import replaces only rules values (stats, AC, max HP, weapons, sheet) and leaves live state alone (current HP, light sources and their counters, free-text inventory).

6. **Client UI**: map view (grid, tokens, darkness shading, doorway stop), log view (prominence, collapsed chat, "read more", the summary since your last turn), compose (soft character counter, pre-consent checkbox, draft persistence), challenge form for the GM (type, DC quick picks, advantage/disadvantage preset with a hint, stakes line), GM control panel (pass, reveal, monsters, torch counters, mode switches, timeout resolution, link regeneration), and onboarding (install, permission, test push).

### Key rules (as decided)

- **Access**: there are no accounts. URLs take the form `/session/<sessionId>/<individualSecret>`. The GM's link is a secret with the GM role. Player links can be regenerated by the GM, which invalidates the old secret. A lost GM link can't be recovered.
- **Push**: web push only, with one subscription per device tied to the participant's secret. No fallback channel in the MVP.
- **Timeouts**: one per-session value, 24 h by default, used for both GM and players. A reminder is sent at half time. There's no night pause. A GM timeout auto-passes the turn. A player timeout prompts the GM to skip, wait or play-as.
- **Torch ticks**: one tick per completed player action (skips and play-as included). GM turns, GM passes and separate accept turns don't tick. In combat, one tick per round. A counter that runs out in combat is detected on the GM/monster turn and the light goes out on a random player turn after that. Players see three levels (bright, flickering, guttering) and the GM sees exact counters.
- **Light**: a character is lit if a burning light source is in the same room or corridor segment. Every light source belongs to the room of its carrier. The GM can override per room.
- **Darkness effects**: a room without light is drawn hatched. Challenges for a player in darkness preset disadvantage, and monster attacks against them preset advantage. The GM can change either.
- **Wandering monster checks**: a prompt every N completed rounds (unsafe 3, risky 2, deadly 1) in crawl mode, rolled by a player as a challenge. Paused in combat.
- **Post length**: a soft limit. The counter appears at 200 characters and turns red above 300 (GM: 400/600). Posting is never blocked. Long posts are collapsed in the log.

## Art Direction

- **Black-and-white graph-paper style.** The map looks like a dungeon hand-mapped on graph paper: a fine square grid on an off-white paper background, with walls, doors and room outlines drawn as black ink lines.
- **Rendering**: vector shapes (SVG) generated from the dungeon geometry. No image tiles or textures, and the dungeon file only describes geometry.
- **Colour**: the whole UI is black-and-white ink on paper. The only colour is the **player tokens**, so they stand out from the map. There is no fire colour or glow.
- **Light**: the flame level (bright, flickering, guttering) appears only in the torch tracker, as a text label plus three bars. On the map, a lit room is plain graph paper and a room in darkness is hatched over the grid.
- **Grid everywhere**: the graph-paper grid continues inside rooms and corridors, not just around them.
- **Tokens**:
  - **Players**: a coloured disc with the character's initials. Each player slot has a fixed colour.
  - **Monsters**: black discs with a short label (for example "G1", "G2"), so they belong to the ink world and the player colours stand out. They are black in both modes. In dark mode they get a stronger light outline (about 2.5 px instead of 1.5 px) so they stand out against the slate paper.
- **Reference mockup**: `style-mockup.html` next to this spec (throwaway, open it in a browser; shows the "your turn" screen in both modes).
  - **Spotlight token**: a thicker ink outline or a gentle pulse.
- **Typography**: the system font stack everywhere, chosen for accessibility and readability. The graph-paper mood comes from the map, not from the type.
- **Accessibility as a principle**: information is never carried by colour alone. Token initials identify players, flame levels also have a text or icon label, darkness is shown as hatching. Text meets WCAG AA contrast, and tap targets are at least 44 px.
- **Dark mode**: follows the system setting (`prefers-color-scheme`), with no in-app toggle. The dark variant is "chalk on slate": dark grey paper, light grey grid, off-white lines. Token colours are tuned separately for each mode so they keep their contrast. Every colour is defined once as a design token, so both modes share one set of definitions.

## Testing Decisions

- **One main seam: the game engine.** Tests drive it only through `applyCommand` with commands, and assert on the resulting events and the publicly visible state (what a player or GM view would show). They never assert on internal fields or helpers.
- **Deterministic by injection**: tests supply a scripted dice roller and a fixed clock. Example scenarios:
  - Strict rhythm: GM → P1 → GM → P2, with seat order after the initiative winner.
  - Pre-consent: an action with the flag ticked, followed by a challenge, rolls immediately and returns the spotlight to the GM. Without the flag, the spotlight goes back to the player, who can accept or decline.
  - A successful attack enables a damage roll in the same turn. Damage produces an HP change suggestion that only takes effect after GM confirmation.
  - A torch counter with 1 left produces a level change, then goes out after the next player action in crawl mode. In combat, the random extinguish happens on a later player turn.
  - Separate accept turns, GM passes and GM turns don't tick torches. Skips and play-as turns do.
  - Darkness presets: a player in a room without light gets disadvantage preset, and monster attacks against them get advantage preset.
  - A GM timeout produces an auto-pass event. A player timeout produces a GM prompt, and each of the three resolutions behaves as specified.
  - Wandering monster check due after N rounds for each danger level, and paused in combat.
  - Start and end combat roll initiative and switch tick rules. End combat starts a new crawl.
  - A token stops at an unknown doorway. A reveal makes the room permanently visible.
  - Re-import while holding the spotlight requires GM approval, and re-import keeps live state.
  - Out-of-turn chat is accepted and marked quiet. Out-of-turn moves are rejected.
- **Input/output tests** for the dungeon file parser (valid files → model, invalid files → located errors), the dice formula evaluator, and the Shadowdarklings importer (fixture exports → character model, plus re-import merge behaviour).
- **No prior art**: the repository is empty. These tests establish the conventions.
- The server adapter, push delivery and UI are kept thin and tested manually during the group playtest for the MVP.

## Out of Scope

- Dungeon generation from random tables. Rulebook tables are not included in the code.
- A map editor of any kind.
- Hex overland travel and the hex/grid board switch.
- An offline mode and offline post queue.
- Accounts, email or OAuth login, and recovering a lost GM link.
- Notification fallbacks (email, ntfy, Discord or Telegram webhooks).
- AI-generated summaries.
- Hidden or secret rolls.
- Full character sheet automation: spells, XP, leveling, gear slots, conditions.
- Enforced movement range, line of sight and per-tile light radius.
- Real-time live updates (websockets). Clients refresh on open or focus and on push.
- Localisation beyond English.
- Analytics, metrics and success questionnaires.

## Further Notes

- The product name is **crawl-by-post**, the same as the repository.
- The guiding principle behind most decisions is **"the app suggests, the GM decides"**. When in doubt, add a one-tap GM override instead of an automatic rule.
- The success criterion for the milestone is that the GM (the author) has fun running the test dungeon with their group and wants to continue.
- The Shadowdarklings JSON export format has not been checked yet. The importer's field mapping must be confirmed against a real export before implementation, and a real export should be added as a test fixture.
- The Shadowdark third-party license has not been checked. That's irrelevant for the MVP, since no rulebook tables or text ship in the code, but it must be checked before any generator milestone.
