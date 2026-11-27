# 06: Challenges and dice

**What to build:** The GM sets a challenge in response to a player's action: a test (STR/DEX/CON/INT/WIS/CHA) with a DC, or an attack, plus advantage/disadvantage and a short stakes line. If the player ticked "I'll roll whatever you set" when posting, the roll happens immediately. Otherwise the spotlight goes back to the player, who sees the DC and stakes and accepts or backs out. Rolls are d20 + the character's modifier, locked in the log, with success or failure shown. After a successful attack, the player can roll damage in the same turn.

**Blocked by:** 04

**Status:** done

- [x] The dice formula evaluator handles `NdM±K` formulas using the injected roller, and has input/output tests
- [x] The challenge form has a type (test or attack), DC quick picks (9 / 12 / 15 / 18, with 12 preset, or a typed value), an advantage/disadvantage toggle and a stakes line
- [x] The pre-consent checkbox on an action makes the roll happen immediately when the GM sets the challenge, and the spotlight returns to the GM
- [x] Without pre-consent, the spotlight returns to the player, who sees the DC and stakes and can accept or back out
- [x] Rolls are locked in the log showing the d20 result, modifier, total, DC and success or failure. There are no hidden rolls
- [x] After a successful attack, a "Roll damage" button rolls the weapon's damage formula in the same turn
- [x] Engine tests cover pre-consent, accepting, backing out, advantage/disadvantage and damage after a hit

## Comments

**Implementation decisions (agent):**
- Attack challenges: the GM picks the weapon from the challenged character's weapons in the form. The weapon (name, attack bonus, damage) is snapshotted into the challenge, so a later re-import can't change the roll.
- Until monsters exist (09), the GM types the target's AC as the DC for an attack.
- Pre-consent covers exactly one challenge. With pre-consent, a hit rolls damage straight away (the player agreed to roll whatever is set). Without it, the player keeps the spotlight after a hit until they tap "Roll damage".
- Accepting a challenge and rolling damage are their own spotlight kinds (`challenge`, `damage`), so no moves or new actions are possible in between. Both hand the spotlight back to the GM (`afterSeat` unchanged, so turn order and round counting are unaffected).
- Success is total ≥ DC. No natural-1/20 rules: the GM rules on those.
- Spellcasting checks are not a challenge type yet (the ticket lists only the six abilities and weapon attacks).

