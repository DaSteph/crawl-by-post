# 04: Crawl and spotlight turns

**What to build:** The GM taps "Start crawl" and picks a danger level (unsafe, risky or deadly). Initiative is rolled automatically (d20 + DEX for each character) and locked into the log. The spotlight goes to the winner, then follows seat order, with a GM turn between every player turn. The spotlight player posts a short action. The GM responds or passes with one tap. Non-spotlight players can chat at any time with a gentle out-of-turn warning. The log shows spotlight posts and rolls prominently and collapses side chat and long posts.

**Blocked by:** 03

**Status:** done

- [x] "Start crawl" with a danger level rolls initiative for every character using the imported DEX, with results locked in the log
- [x] Engine tests: the spotlight goes winner → GM → next player in seat order → GM → … and a round is complete when the spotlight returns to the first player
- [x] Only the spotlight player can post an action. Others get a gentle out-of-turn warning and their message is posted as quiet chat
- [x] The GM can pass the spotlight with one tap, or post a response
- [x] The soft length limit: a counter appears from 200 characters and turns red above 300 (GM: 400/600), but posting is never blocked
- [x] Long posts are collapsed with "read more". Runs of chat are collapsed ("+N chat messages")
- [x] It's clear on screen whose turn it is, and the spotlight token has a thick ring or pulse (respecting `prefers-reduced-motion`)
- [x] The compose draft survives an app restart (local only). Posting without a connection shows a clear message

## Comments

**Implementation notes:**

- Engine: `src/lib/engine/turns.ts`. New commands: `startCrawl`, `postAction`, `postChat` and `passSpotlight`. State gets `crawl` (danger, turn order, round, spotlight). Spotlight is `{kind:'player', seat}` or `{kind:'gm', afterSeat}`.
- The log isn't kept in session state. Every entry is a `logged` engine event, stored in the `events` table, and the page loads the latest 300. Other new events are `spotlightChanged` and `roundCompleted`, as hooks for push (07), torches (10) and wandering checks (11).
- Initiative ties for the top are broken with plain d20 roll-offs, which are logged. Seats without a character are left out of the turn order. A player who imports mid-crawl joins at the next crawl.
- `postAction` is rejected out of turn. The UI sends `postChat` instead and shows the out-of-turn warning. If the spotlight moves while you're writing, the action is rejected and the draft stays.
- Posts have a hard cap of 4000 characters (abuse guard). The soft counter never blocks. Chat runs of 2 or more collapse. A single chat message stays inline but quiet.
- The GM can start a "New crawl" at any time, which rerolls initiative and resets the round to 1.
- Clients refresh when the app becomes visible again (no live updates).
