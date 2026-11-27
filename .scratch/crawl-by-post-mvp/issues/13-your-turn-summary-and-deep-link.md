# 13: "Your turn" summary and deep link

**What to build:** Tapping a "your turn" notification opens the session with the map centred on the player's token, together with a filtered summary of everything since their last turn: spotlight posts, rolls, HP changes and room reveals, with side chat collapsed ("+N chat messages"). There's no generated text.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] The notification deep link opens the session and centres the map on the player's token
- [ ] The summary contains spotlight posts, rolls, HP changes, room reveals and torch events since the player's last turn, in order
- [ ] Side chat in that range is collapsed into a single "+N chat messages" entry that can be expanded
- [ ] The summary is built from log events (testable as a pure function of the log and the player's last turn)
- [ ] The GM gets the same summary when the spotlight returns to them
