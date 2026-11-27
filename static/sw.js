// Service worker for installability and web push.
// There is no offline mode: nothing is cached and every request goes to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Payload from src/lib/server/push.ts: { title, body, url, tag, test? }.
self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : '' };
	}
	const url = new URL(data.url || '/', self.location.origin).href;
	event.waitUntil(
		(async () => {
			await self.registration.showNotification(data.title || 'crawl-by-post', {
				body: data.body || '',
				tag: data.tag,
				renotify: Boolean(data.tag),
				icon: '/icon-192.png',
				badge: '/icon-192.png',
				data: { url }
			});
			// Open pages refresh on a turn push; the onboarding page confirms its test push.
			const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const page of pages) page.postMessage({ type: data.test ? 'push-test' : 'push', url });
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = event.notification.data?.url || self.location.origin;
	event.waitUntil(
		(async () => {
			const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const same = pages.find((page) => page.url.split('#')[0] === url);
			return same ? same.focus() : self.clients.openWindow(url);
		})()
	);
});
