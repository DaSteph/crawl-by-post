# 07: Push notifications and onboarding

**What to build:** When a participant opens their link for the first time, an onboarding flow walks them through adding the app to their home screen, allowing notifications and receiving a test push. From then on, whoever gets the spotlight receives a web push notification.

**Blocked by:** 04

**Status:** done

- [x] The onboarding flow detects the platform and explains the steps (add to home screen, allow notifications, test push), including the iOS requirement that push only works from the home screen app
- [x] The push subscription is stored per device and tied to the participant's secret. One participant can have several devices
- [x] The test push confirms delivery
- [x] A "spotlight changed" engine event sends a push to the new spotlight holder
- [x] Regenerated or invalid secrets don't receive pushes
- [x] There are no fallback channels (email, ntfy, webhooks)

## Comments

**Agent (2026-11-27):** Implemented. Needs a manual check on real devices (iPhone home screen app, Android Chrome, desktop) with VAPID keys set and HTTPS.

- Push planning is pure (`src/lib/push/plan.ts`, tested): the last `spotlightChanged` event in a command picks the recipient by their *current* secret. Nobody is pushed for a turn they handed to themselves (a hit that keeps the spotlight for the damage roll).
- Delivery (`src/lib/server/push.ts`) runs fire-and-forget after the transaction commits. pg-boss isn't used yet; it comes with timeouts (08). Subscriptions the push service reports as gone (404/410) are deleted.
- `push_subscriptions` is keyed by (session, secret, endpoint): one browser has one endpoint, but can hold several links (e.g. the GM testing a player link). Regenerated secrets never match the lookup; ticket 14 can delete their rows.
- Each session page serves its own web manifest with `start_url` set to the participant's link, so the home screen app opens the session and not the start page.
- Onboarding (`src/lib/push/Onboarding.svelte`) opens on the first visit per device and link, and shrinks to a "notifications are off · Set up" line after "Later". If notification permission is already granted (e.g. for another link on the same device), the link is registered silently.
- The test push is confirmed when the service worker reports its arrival to the page. If that message never comes, an "I saw the notification" button appears after 6 s.
- Open session pages refresh when a turn push arrives.
