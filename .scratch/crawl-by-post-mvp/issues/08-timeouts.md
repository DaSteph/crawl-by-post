# 08: Timeouts

**What to build:** Each session has a turn timeout (24 h by default, configurable by the GM, the same for GM and players). Halfway through, the spotlight holder gets a reminder push. When a GM turn times out, it auto-passes. When a player's turn times out, the GM gets a push and a prompt to skip them, wait longer, or play their character for this turn (posted with a visible note).

**Blocked by:** 07

**Status:** done

- [x] `pg-boss` runs in the app process. Timeout and reminder jobs are scheduled and cancelled from engine events
- [x] The GM can set the session timeout (default 24 h)
- [x] A reminder push is sent at half time
- [x] A GM timeout auto-passes the spotlight
- [x] A player timeout notifies the GM and shows the skip / wait / play-as prompt. Play-as posts are marked in the log
- [x] In the engine, skip and play-as both count as a completed player action (the same event torch ticking will build on)
- [x] Engine tests: timeout fired → auto-pass for the GM, prompt for a player, each resolution behaves as specified, and a fired job for an already-finished turn is ignored

## Comments

**Agent (2026-11-27):** Implemented. Engine tests cover the clock, the setting, reminders, both timeouts and every resolution. Smoke-tested against the dev database: jobs are scheduled and cancelled in the session transaction, a forced GM timeout auto-passed, a forced player timeout showed the GM prompt, play-as posted a marked action, and a stale job changed nothing. Needs a real-device check of the reminder and GM-timeout pushes.

- **Turn clock** (`src/lib/engine/timeouts.ts`): `state.turnClock` has an `id` that goes up on every (re)start and keeps counting across crawls. `applyCommand` restarts it after any command that emits `spotlightChanged`, emitting `turnTimerStopped` (old id) and `turnTimerStarted` (new id, `reminderAt`, `timeoutAt`). Fired jobs come back as `turnTimerFired { clock, kind }`; a mismatched id, or a clock that has already timed out, is a no-op. So a missed cancellation can never end the wrong turn.
- **Setting**: `setTurnTimeout`, whole hours from 1 to 168, logged publicly. It also changes the running turn, counted from that turn's start. A deadline that has already passed fires right away, and a reminder that is already past is dropped.
- **GM timeout**: logs `pass` with `timedOut: true` and hands the spotlight to the next player, who gets the usual turn push.
- **Player timeout**: the spotlight stays with the player, `turnClock.timedOut` is set, a `timedOut` entry is logged, and the GM gets a push. No further timers run until the GM decides. If the player posts in the meantime, the prompt goes away (the spotlight moves on).
- **Resolutions**: every resolution logs `timeoutResolved`. *Wait* starts a fresh full clock. *Skip* gives the GM their turn after the player. *Play-as* on an action turn posts the GM's text as the player's action with `playedByGm: true`, shown as "played by the GM" in the log. On a challenge or damage turn, play-as rolls for the player (reusing accept / roll damage) and skip returns the turn to the GM without a roll.
- **`playerActionCompleted { seat }`** is the event for light ticks (ticket 10). It is emitted by a player's own action and by skip or play-as on an *action* turn. It is not emitted for timed-out challenge or damage turns, matching the rule that separate accept turns don't tick.
- **Server** (`src/lib/server/jobs.ts`): one pg-boss queue `turn-timer`. Jobs are written through the open transaction (`db` option), so state and timers commit together. Job ids are uuids derived from session, clock and kind, so cancelling needs no bookkeeping. Commands that change nothing (stale timers) are rolled back without writing. When a timeout auto-passes, it cancels its own active job; pg-boss then shows that job as `cancelled` instead of `completed`, which is harmless.
- **Push**: `spotlightPush` became `planPush`. It also covers the player-timeout push to the GM and the reminder ("Reminder: …") to the holder.
- **UI**: the turn banner shows "N h left" (or "timed out: the GM decides"). The GM gets a timeout prompt above the challenge form (skip / wait another N h / play, which opens a text box on action turns) and a "Turn timeout" setting card.
- pg-boss 12 needs Node ≥ 22.17, which matches `.nvmrc` and the README.
