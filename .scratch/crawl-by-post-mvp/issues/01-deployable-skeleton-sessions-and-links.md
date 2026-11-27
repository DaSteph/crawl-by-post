# 01: Minimal deployable app: sessions and secret links

**What to build:** A GM can open the start page, create a session without an account, and see their secret GM link on a "save this link" screen. The GM adds 2–4 player slots, each of which gets its own secret link and fixed token colour. Opening any link at `/session/<sessionId>/<individualSecret>` shows a placeholder session page that knows whether the visitor is the GM or a player. Many sessions can exist side by side. The app runs as a Docker Swarm stack behind Traefik on the vserver.

This ticket also sets up the structure every later ticket builds on: a SvelteKit (Node adapter) app with Postgres, and the pure game engine module with its interface `applyCommand(state, command, { dice, now }) → { state, events }`, where dice and clock are injected. The engine starts with only the commands this ticket needs (create session, add player slot). The server adapter loads state, calls the engine and persists state plus events in one transaction.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The start page creates a session and shows the GM link once on a "save this link" screen that explains the link can't be recovered
- [ ] The GM can add 2–4 player slots. Each slot gets a unique secret link and a fixed token colour
- [ ] An unknown or invalid secret gets a clear error page and doesn't reveal whether the session exists
- [ ] The page shows the visitor's role (GM or player) and the session name
- [ ] Session creation and player slots go through `applyCommand`. Engine tests run with an injected dice roller and clock
- [ ] A Docker image and Swarm stack file exist, with Traefik labels and Let's Encrypt, and a configurable Postgres connection
- [ ] The app is installable as a PWA (manifest + service worker), with no offline mode
- [ ] UI text lives in one place (English only)
- [ ] The UI uses the system font stack and colour design tokens, with the dark variant ("chalk on slate") applied through `prefers-color-scheme`
