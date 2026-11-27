# 07: Push notifications and onboarding

**What to build:** When a participant opens their link for the first time, an onboarding flow walks them through adding the app to their home screen, allowing notifications and receiving a test push. From then on, whoever gets the spotlight receives a web push notification.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The onboarding flow detects the platform and explains the steps (add to home screen, allow notifications, test push), including the iOS requirement that push only works from the home screen app
- [ ] The push subscription is stored per device and tied to the participant's secret. One participant can have several devices
- [ ] The test push confirms delivery
- [ ] A "spotlight changed" engine event sends a push to the new spotlight holder
- [ ] Regenerated or invalid secrets don't receive pushes
- [ ] There are no fallback channels (email, ntfy, webhooks)
