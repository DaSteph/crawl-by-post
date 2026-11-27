// Service worker for installability (and, in a later ticket, web push).
// There is no offline mode: nothing is cached and every request goes to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
