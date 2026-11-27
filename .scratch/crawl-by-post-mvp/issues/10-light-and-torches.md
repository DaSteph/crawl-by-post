# 10: Light and torches

**What to build:** A player lights a torch from their inventory with one tap. Each lit light source gets a secret 1d20+10 counter, which ticks once per completed player action (including skips and play-as turns), but not for GM turns, GM passes or separate challenge-accept turns. Players see only the flame level (bright, flickering, guttering) in the torch tracker. The GM sees and edits exact counters. A character is lit if a burning light source is in their room or corridor segment. Rooms without light are hatched over the grid. The challenge form presets disadvantage for players in darkness and advantage for monsters attacking them.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] Lighting a torch takes one tap and creates a secret counter of 1d20+10
- [ ] Engine tests for the tick rules: one tick per completed player action, skips and play-as included. No tick for GM turns, GM passes or accept turns
- [ ] The torch tracker shows a text label and three bars for the flame level. There's no colour or glow
- [ ] The GM sees every counter and can edit it
- [ ] Light is per room or segment, and moves with the character carrying the light source
- [ ] A room without a burning light source is drawn hatched over the grid. The GM can override any room's light state
- [ ] The challenge form presets disadvantage (with a 🌑 hint) for a player in darkness, and advantage for monster attacks against them. The GM can change either with one tap
- [ ] A torch that reaches zero goes out with a log entry
