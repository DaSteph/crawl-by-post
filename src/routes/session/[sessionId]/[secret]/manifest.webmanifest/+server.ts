import { error } from '@sveltejs/kit';
import { isParticipant } from '#lib/server/sessions.ts';
import { text } from '#lib/text.ts';
import type { RequestHandler } from './$types';

/**
 * The web manifest for one participant link. The home screen app starts at this
 * link (the secret is the only way in), so each link installs as its own app.
 */
export const GET: RequestHandler = async ({ params }) => {
	if (!(await isParticipant(params.sessionId, params.secret))) error(404);
	const link = `/session/${params.sessionId}/${params.secret}`;
	const manifest = {
		id: link,
		name: text.appName,
		short_name: text.appName,
		description: text.tagline,
		start_url: link,
		scope: '/',
		display: 'standalone',
		background_color: '#f7f6f1',
		theme_color: '#f7f6f1',
		icons: [
			{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
		]
	};
	return new Response(JSON.stringify(manifest), {
		headers: {
			'content-type': 'application/manifest+json',
			'cache-control': 'private, no-store',
			'referrer-policy': 'no-referrer'
		}
	});
};
