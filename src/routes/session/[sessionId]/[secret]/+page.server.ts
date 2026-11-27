import { error, fail } from '@sveltejs/kit';
import { addPlayerSlot, editInventory, importCharacter, loadSessionView } from '#lib/server/sessions.ts';
import { text } from '#lib/text.ts';
import type { Actions, PageServerLoad } from './$types';

/** Shadowdarklings exports are a few dozen KB; anything far larger is not one. */
const MAX_EXPORT_BYTES = 1_000_000;

export const load: PageServerLoad = async ({ params, url }) => {
	const view = await loadSessionView(params.sessionId, params.secret);
	// Same response for unknown sessions and wrong secrets, so a link never
	// reveals whether a session exists.
	if (!('players' in view)) error(404, text.errors.badLinkTitle);

	return {
		visitor: view.visitor,
		map: view.map,
		sheets: view.sheets,
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
	},

	importCharacter: async ({ params, request }) => {
		const file = (await request.formData()).get('export');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { importErrors: [text.character.noFile] });
		}
		if (file.size > MAX_EXPORT_BYTES) return fail(400, { importErrors: [text.character.tooLarge] });
		const result = await importCharacter(params.sessionId, params.secret, await file.text());
		if (!result.ok) return fail(400, { importErrors: result.errors });
	},

	saveInventory: async ({ params, request }) => {
		const inventory = String((await request.formData()).get('inventory') ?? '').replace(/\r\n/g, '\n');
		const result = await editInventory(params.sessionId, params.secret, inventory);
		if (!result.ok) return fail(400, { inventoryError: result.reason });
		return { inventorySaved: true };
	}
};
