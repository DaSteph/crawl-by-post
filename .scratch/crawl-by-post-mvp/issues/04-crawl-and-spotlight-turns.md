# 04: Crawl and spotlight turns

**What to build:** The GM taps "Start crawl" and picks a danger level (unsafe, risky or deadly). Initiative is rolled automatically (d20 + DEX for each character) and locked into the log. The spotlight goes to the winner, then follows seat order, with a GM turn between every player turn. The spotlight player posts a short action. The GM responds or passes with one tap. Non-spotlight players can chat at any time with a gentle out-of-turn warning. The log shows spotlight posts and rolls prominently and collapses side chat and long posts.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] "Start crawl" with a danger level rolls initiative for every character using the imported DEX, with results locked in the log
- [ ] Engine tests: the spotlight goes winner → GM → next player in seat order → GM → … and a round is complete when the spotlight returns to the first player
- [ ] Only the spotlight player can post an action. Others get a gentle out-of-turn warning and their message is posted as quiet chat
- [ ] The GM can pass the spotlight with one tap, or post a response
- [ ] The soft length limit: a counter appears from 200 characters and turns red above 300 (GM: 400/600), but posting is never blocked
- [ ] Long posts are collapsed with "read more". Runs of chat are collapsed ("+N chat messages")
- [ ] It's clear on screen whose turn it is, and the spotlight token has a thick ring or pulse (respecting `prefers-reduced-motion`)
- [ ] The compose draft survives an app restart (local only). Posting without a connection shows a clear message
