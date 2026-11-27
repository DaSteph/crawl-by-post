# 12: Combat mode

**What to build:** The GM taps "Start combat". Initiative is rolled automatically (each character d20 + DEX, monsters rolling once as the GM's side), and the table switches to combat mode with a clear ⚔️ indicator. The GM → player rhythm stays, and monsters act in whichever GM turn the GM chooses. Light sources tick once per round instead of per action. A counter that runs out is detected on the GM/monster turn and the light goes out on a random player turn after that. Wandering monster checks pause. "End combat" switches back and immediately starts a new crawl with fresh initiative and a danger level.

**Blocked by:** 09, 10, 11

**Status:** ready-for-agent

- [ ] "Start combat" rolls initiative for characters and once for the monster side, with results locked in the log
- [ ] The combat indicator is visible to everyone and doesn't rely on colour alone
- [ ] Engine tests: in combat, light sources tick once per round
- [ ] Engine tests: a counter that runs out is detected on the GM turn, and the light goes out on a random later player turn (deterministic with the injected roller)
- [ ] Wandering monster checks pause during combat
- [ ] "End combat" starts a new crawl with fresh initiative and a danger level choice
