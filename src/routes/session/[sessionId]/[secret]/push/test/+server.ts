import { error, json } from '@sveltejs/kit';
import { isParticipant } from '#lib/server/sessions.ts';
import { sendTestPush } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

/**
 * Sends the onboarding test push to one device. Body: `{ endpoint }`.
 * Answers `sent` once the push service accepted it; the service worker reports
 * actual arrival to the page.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!(await isParticipant(params.sessionId, params.secret))) error(404);
	const value = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof value?.endpoint !== 'string') error(400, 'Missing endpoint.');
	return json({ result: await sendTestPush(params.sessionId, params.secret, value.endpoint) });
};
