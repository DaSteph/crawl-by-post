import { error, fail } from '@sveltejs/kit';
import { addPlayerSlot, loadSessionView } from '#lib/server/sessions.ts';
import { text } from '#lib/text.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const view = await loadSessionView(params.sessionId, params.secret);
	// Same response for unknown sessions and wrong secrets, so a link never
	// reveals whether a session exists.
	if (!('players' in view)) error(404, text.errors.badLinkTitle);

	return {
		visitor: view.visitor,
		players:
			view.players?.map((p) => ({
				seat: p.seat,
				tokenColour: p.tokenColour,
				link: `${url.origin}/session/${params.sessionId}/${p.secret}`
			})) ?? null
	};
};

export const actions: Actions = {
	addPlayer: async ({ params }) => {
		const result = await addPlayerSlot(params.sessionId, params.secret);
		if (!result.ok) return fail(400, { error: result.reason });
	}
};
