/**
 * Web push delivery: stores subscriptions per device and participant link, and
 * sends what `spotlightPush` decides. Web push is the only channel.
 */
import { sendNotification, WebPushError, type PushSubscription } from 'web-push';
import { PUBLIC_SOURCE_URL, PUBLIC_VAPID_KEY } from '$app/env/public';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '$app/env/private';
import type { EngineEvent, SessionState } from '#lib/engine/index.ts';
import { spotlightPush, type PushMessage } from '#lib/push/plan.ts';
import { text } from '#lib/text.ts';
import { db } from './db.ts';

const enabled = Boolean(PUBLIC_VAPID_KEY && VAPID_PRIVATE_KEY);
if (!enabled) console.warn('PUBLIC_VAPID_KEY / VAPID_PRIVATE_KEY are not set: push notifications are off.');

const vapidDetails = {
	subject: VAPID_SUBJECT || PUBLIC_SOURCE_URL,
	publicKey: PUBLIC_VAPID_KEY ?? '',
	privateKey: VAPID_PRIVATE_KEY ?? ''
};

/** What the notification shows and opens. Read by `static/sw.js`. */
type Payload = { title: string; body: string; url: string; tag: string; test?: true };

/** A subscription as the browser serialises it, checked enough to store safely. */
export function parseSubscription(value: unknown): PushSubscription | null {
	if (typeof value !== 'object' || value === null) return null;
	const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) return null;
	if (typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
	if (keys.p256dh.length > 200 || keys.auth.length > 100) return null;
	return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Stores (or refreshes) this device's subscription for one participant link. */
export async function saveSubscription(sessionId: string, secret: string, sub: PushSubscription): Promise<void> {
	await db().query(
		`INSERT INTO push_subscriptions (session_id, secret, endpoint, keys) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (session_id, secret, endpoint) DO UPDATE SET keys = EXCLUDED.keys`,
		[sessionId, secret, sub.endpoint, sub.keys]
	);
}

/** Sends one payload; a subscription the push service has dropped is deleted everywhere. */
async function send(sub: PushSubscription, payload: Payload): Promise<boolean> {
	try {
		await sendNotification(sub, JSON.stringify(payload), { vapidDetails, TTL: 7 * 24 * 3600, urgency: 'high' });
		return true;
	} catch (e) {
		if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
			await db().query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
		} else {
			console.error('Push failed:', e);
		}
		return false;
	}
}

/** The test push from onboarding, to the one device that asked for it. */
export async function sendTestPush(sessionId: string, secret: string, endpoint: string): Promise<'sent' | 'failed' | 'unknown'> {
	if (!enabled) return 'failed';
	const { rows } = await db().query<{ keys: PushSubscription['keys'] }>(
		'SELECT keys FROM push_subscriptions WHERE session_id = $1 AND secret = $2 AND endpoint = $3',
		[sessionId, secret, endpoint]
	);
	if (rows.length === 0) return 'unknown';
	const ok = await send(
		{ endpoint, keys: rows[0].keys },
		{
			title: text.push.testTitle,
			body: text.push.testBody,
			url: `/session/${sessionId}/${secret}`,
			tag: `test-${sessionId}`,
			test: true
		}
	);
	return ok ? 'sent' : 'failed';
}

async function deliver(sessionId: string, message: PushMessage): Promise<void> {
	// Looked up by the holder's current secret, so a regenerated link's devices get nothing.
	const { rows } = await db().query<{ endpoint: string; keys: PushSubscription['keys'] }>(
		'SELECT endpoint, keys FROM push_subscriptions WHERE session_id = $1 AND secret = $2',
		[sessionId, message.secret]
	);
	const payload: Payload = { title: message.title, body: message.body, url: message.url, tag: sessionId };
	await Promise.all(rows.map((r) => send({ endpoint: r.endpoint, keys: r.keys }, payload)));
}

/**
 * Turns a committed command's events into pushes. Fire-and-forget: a failed
 * push never fails the command, which is already saved.
 */
export function pushAfterCommand(state: SessionState, events: EngineEvent[], by: string | null): void {
	if (!enabled) return;
	const message = spotlightPush(state, events, by);
	if (!message) return;
	deliver(state.id, message).catch((e) => console.error('Push delivery failed:', e));
}
