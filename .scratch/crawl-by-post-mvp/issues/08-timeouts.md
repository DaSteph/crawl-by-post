# 08: Timeouts

**What to build:** Each session has a turn timeout (24 h by default, configurable by the GM, the same for GM and players). Halfway through, the spotlight holder gets a reminder push. When a GM turn times out, it auto-passes. When a player's turn times out, the GM gets a push and a prompt to skip them, wait longer, or play their character for this turn (posted with a visible note).

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `pg-boss` runs in the app process. Timeout and reminder jobs are scheduled and cancelled from engine events
- [ ] The GM can set the session timeout (default 24 h)
- [ ] A reminder push is sent at half time
- [ ] A GM timeout auto-passes the spotlight
- [ ] A player timeout notifies the GM and shows the skip / wait / play-as prompt. Play-as posts are marked in the log
- [ ] In the engine, skip and play-as both count as a completed player action (the same event torch ticking will build on)
- [ ] Engine tests: timeout fired → auto-pass for the GM, prompt for a player, each resolution behaves as specified, and a fired job for an already-finished turn is ignored
