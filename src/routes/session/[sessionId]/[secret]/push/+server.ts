import { error, json } from '@sveltejs/kit';
import { isParticipant } from '#lib/server/sessions.ts';
import { parseSubscription, saveSubscription } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

async function body(request: Request): Promise<Record<string, unknown>> {
	const value: unknown = await request.json().catch(() => null);
	if (typeof value !== 'object' || value === null) error(400, 'Expected a JSON object.');
	return value as Record<string, unknown>;
}

/** Stores this device's push subscription for the link. Body: `{ subscription }`. */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!(await isParticipant(params.sessionId, params.secret))) error(404);
	const subscription = parseSubscription((await body(request)).subscription);
	if (!subscription) error(400, 'Invalid push subscription.');
	await saveSubscription(params.sessionId, params.secret, subscription);
	return json({ ok: true });
};
