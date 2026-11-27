# 06: Challenges and dice

**What to build:** The GM sets a challenge in response to a player's action: a test (STR/DEX/CON/INT/WIS/CHA) with a DC, or an attack, plus advantage/disadvantage and a short stakes line. If the player ticked "I'll roll whatever you set" when posting, the roll happens immediately. Otherwise the spotlight goes back to the player, who sees the DC and stakes and accepts or backs out. Rolls are d20 + the character's modifier, locked in the log, with success or failure shown. After a successful attack, the player can roll damage in the same turn.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The dice formula evaluator handles `NdM±K` formulas using the injected roller, and has input/output tests
- [ ] The challenge form has a type (test or attack), DC quick picks (9 / 12 / 15 / 18, with 12 preset, or a typed value), an advantage/disadvantage toggle and a stakes line
- [ ] The pre-consent checkbox on an action makes the roll happen immediately when the GM sets the challenge, and the spotlight returns to the GM
- [ ] Without pre-consent, the spotlight returns to the player, who sees the DC and stakes and can accept or back out
- [ ] Rolls are locked in the log showing the d20 result, modifier, total, DC and success or failure. There are no hidden rolls
- [ ] After a successful attack, a "Roll damage" button rolls the weapon's damage formula in the same turn
- [ ] Engine tests cover pre-consent, accepting, backing out, advantage/disadvantage and damage after a hit
