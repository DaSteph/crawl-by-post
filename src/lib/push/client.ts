/** Browser side of web push: platform detection and the device's subscription. */

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
	const ua = navigator.userAgent;
	// iPadOS reports itself as a Mac; touch gives it away.
	if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
	if (/Android/.test(ua)) return 'android';
	return 'desktop';
}

/** True when running as the installed home screen app. */
export function isStandalone(): boolean {
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** Push needs a service worker, the Push API and notifications. iOS has them only in the home screen app. */
export function pushSupported(): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/** This device's subscription, created if needed. Needs notification permission. */
async function deviceSubscription(publicKey: string, create: boolean): Promise<PushSubscription | null> {
	const registration = await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	if (existing) {
		// A subscription made with another server key can't receive our pushes.
		const key = existing.options.applicationServerKey;
		const same = !key || btoa(String.fromCharCode(...new Uint8Array(key))) === btoa(String.fromCharCode(...keyBytes(publicKey)));
		if (same) return existing;
		await existing.unsubscribe();
	}
	if (!create) return null;
	return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/**
 * Registers this device for the link at `base` (`/session/<id>/<secret>`).
 * With `create` false it only refreshes an existing subscription, e.g. on page load.
 * Returns the endpoint, or null if the device has no subscription.
 */
export async function registerDevice(base: string, publicKey: string, create: boolean): Promise<string | null> {
	const subscription = await deviceSubscription(publicKey, create);
	if (!subscription) return null;
	const response = await fetch(`${base}/push`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ subscription: subscription.toJSON() })
	});
	if (!response.ok) throw new Error(`Saving the subscription failed (${response.status}).`);
	return subscription.endpoint;
}

export async function sendTest(base: string, endpoint: string): Promise<'sent' | 'failed' | 'unknown'> {
	const response = await fetch(`${base}/push/test`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ endpoint })
	});
	if (!response.ok) return 'failed';
	return ((await response.json()) as { result: 'sent' | 'failed' | 'unknown' }).result;
}
