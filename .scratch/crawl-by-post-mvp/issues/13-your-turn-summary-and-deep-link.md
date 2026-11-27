# 13: "Your turn" summary and deep link

**What to build:** Tapping a "your turn" notification opens the session with the map centred on the player's token, together with a filtered summary of everything since their last turn: spotlight posts, rolls, HP changes and room reveals, with side chat collapsed ("+N chat messages"). There's no generated text.

**Blocked by:** 07

**Status:** done

- [x] The notification deep link opens the session and centres the map on the player's token
- [x] The summary contains spotlight posts, rolls, HP changes, room reveals and torch events since the player's last turn, in order
- [x] Side chat in that range is collapsed into a single "+N chat messages" entry that can be expanded
- [x] The summary is built from log events (testable as a pure function of the log and the player's last turn)
- [x] The GM gets the same summary when the spotlight returns to them

## Comments

**Agent (2026-11-27):** Implemented. `lastTurnEnd(log, who)` and `turnSummary(log, lastTurn)` in `src/lib/engine/log.ts` are pure, tested in `src/lib/engine/log.test.ts`. The page shows a "Since your last turn" card under the turn banner whenever the spotlight is the visitor's (GM, player turn, challenge or damage turn), rendered by the same `Log` component as the main log (it now takes precomputed blocks). The map already centred on the player's own token on load; a notification tapped while the page is already open now makes the service worker post `opened`, and the page reloads its data, re-centres the map and scrolls to the summary. Smoke-tested against the dev database through the form actions (GM turn, player turn, no summary outside one's turn); the tap-on-open-page path and phones not tried yet.

- **What "last turn" means**: a player's turn ends with their own action post (one the GM played for them doesn't count, nor a skipped turn, so they see what they missed). The GM's ends with a response, a pass of their own (not a timed-out one) or a challenge. Challenge and damage turns don't count as turns, so the next summary still shows the challenge, roll and what came of it. With no turn yet, the summary covers the whole loaded log (the last 300 entries).
- **What's kept**: actions and GM responses, initiative, challenges, rolls (tests, attacks, wandering checks), declines, damage, monster attacks, HP changes (monster condition, character hurt, dying), reveals, torch lit/out, combat start/end. Left out: round dividers, passes, doorway stops, timeouts and timeout settings, crawl starts.
- **Chat**: all chat in the range is one collapsed "+N chat messages" block at the end of the summary, even a single message (and the visitor's own chat counts too).
