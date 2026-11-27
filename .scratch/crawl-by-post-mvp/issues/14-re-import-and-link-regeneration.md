# 14: Re-import and link regeneration

**What to build:** A player can re-import their Shadowdarklings JSON after a level-up. Stats, AC, max HP, weapons and the sheet are replaced, while current HP, light sources and their counters and the free-text inventory stay as they are. While the player holds the spotlight, a re-import needs GM approval. The GM can regenerate any player's link, which invalidates the old secret immediately.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Re-import replaces only rules values and keeps live state (input/output test with two fixture versions)
- [ ] A re-import while holding the spotlight creates a pending approval for the GM. Otherwise it applies directly
- [ ] Every re-import produces a log entry
- [ ] The GM can regenerate a player's link. The old secret stops working at once, including for push subscriptions
- [ ] The new link is shown to the GM to share
