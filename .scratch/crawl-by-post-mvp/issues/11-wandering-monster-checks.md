# 11: Wandering monster checks

**What to build:** In crawl mode, every N completed rounds (unsafe 3, risky 2, deadly 1, based on the danger level chosen at "Start crawl"), the GM gets a prompt that a wandering monster check is due. With one tap the GM sets the check as a challenge for the next spotlight player (or another player), or postpones or skips it.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Engine tests: a check-due event fires after the right number of completed rounds for each danger level
- [ ] The GM sees a "wandering monster check due" prompt
- [ ] With one tap the check becomes a challenge, by default for the next spotlight player, and the GM can pick another player
- [ ] The GM can postpone or skip the check, and the round counter continues
- [ ] The check is rolled by the player as a normal challenge (pre-consent applies)
