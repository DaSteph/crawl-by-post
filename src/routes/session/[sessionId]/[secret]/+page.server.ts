import { error, fail } from '@sveltejs/kit';
import {
	addPlayerSlot,
	editInventory,
	importCharacter,
	loadSessionView,
	moveToken,
	passSpotlight,
	postAction,
	postChat,
	setAreaRevealed,
	startCrawl
} from '#lib/server/sessions.ts';
import type { Danger } from '#lib/engine/turns.ts';
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
		crawl: view.crawl,
		people: view.people,
		log: view.log,
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
	},

	startCrawl: async ({ params, request }) => {
		const danger = String((await request.formData()).get('danger') ?? '') as Danger;
		const result = await startCrawl(params.sessionId, params.secret, danger);
		if (!result.ok) return fail(400, { crawlError: result.reason });
	},

	/** `as` is `action` for a spotlight post and `chat` for anything out of turn. */
	post: async ({ params, request }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '');
		const result =
			form.get('as') === 'action'
				? await postAction(params.sessionId, params.secret, text)
				: await postChat(params.sessionId, params.secret, text);
		if (!result.ok) return fail(400, { postError: result.reason });
		return { posted: true };
	},

	pass: async ({ params }) => {
		const result = await passSpotlight(params.sessionId, params.secret);
		if (!result.ok) return fail(400, { postError: result.reason });
	},

	move: async ({ params, request }) => {
		const form = await request.formData();
		const x = Number(form.get('x'));
		const y = Number(form.get('y'));
		if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(400, { moveError: text.map.badMove });
		const result = await moveToken(params.sessionId, params.secret, { x, y });
		if (!result.ok) return fail(400, { moveError: result.reason });
	},

	/** `reveal` is `1` to reveal the area and `0` to hide it. */
	reveal: async ({ params, request }) => {
		const form = await request.formData();
		const areaId = String(form.get('area') ?? '');
		const result = await setAreaRevealed(params.sessionId, params.secret, areaId, form.get('reveal') === '1');
		if (!result.ok) return fail(400, { revealError: result.reason });
	}
};
