import { error, fail } from '@sveltejs/kit';
import {
	addPlayerSlot,
	answerChallenge,
	editInventory,
	importCharacter,
	loadSessionView,
	moveToken,
	passSpotlight,
	postAction,
	postChat,
	resolveTimeout,
	rollDamage,
	setAreaRevealed,
	setChallenge,
	setTurnTimeout,
	startCrawl
} from '#lib/server/sessions.ts';
import type { Danger } from '#lib/engine/turns.ts';
import type { TimeoutResolution } from '#lib/engine/timeouts.ts';
import type { CheckChoice, Edge } from '#lib/engine/challenges.ts';
import type { Ability } from '#lib/character/model.ts';
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
		manifest: `/session/${params.sessionId}/${params.secret}/manifest.webmanifest`,
		visitor: view.visitor,
		map: view.map,
		sheets: view.sheets,
		crawl: view.crawl,
		timer: view.timer,
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
				? await postAction(params.sessionId, params.secret, text, form.get('preConsent') === 'on')
				: await postChat(params.sessionId, params.secret, text);
		if (!result.ok) return fail(400, { postError: result.reason });
		return { posted: true };
	},

	/**
	 * `check` is `test:<ABILITY>` or `attack:<weapon index>`; `dc` is a quick pick,
	 * overridden by `customDc` when that is filled in; `edge` is empty for neither.
	 */
	challenge: async ({ params, request }) => {
		const form = await request.formData();
		const [type, value] = String(form.get('check') ?? '').split(':');
		const check: CheckChoice =
			type === 'attack' ? { type: 'attack', weapon: Number(value) } : { type: 'test', ability: value as Ability };
		const custom = String(form.get('customDc') ?? '').trim();
		const dc = Number(custom || form.get('dc'));
		const edgeValue = String(form.get('edge') ?? '');
		const edge: Edge = edgeValue === 'advantage' || edgeValue === 'disadvantage' ? edgeValue : null;
		const stakes = String(form.get('stakes') ?? '');
		const result = await setChallenge(params.sessionId, params.secret, { check, dc, edge, stakes });
		if (!result.ok) return fail(400, { challengeError: result.reason });
	},

	/** `answer` is `accept` or `decline`. */
	answer: async ({ params, request }) => {
		const accept = (await request.formData()).get('answer') === 'accept';
		const result = await answerChallenge(params.sessionId, params.secret, accept);
		if (!result.ok) return fail(400, { challengeError: result.reason });
	},

	damage: async ({ params }) => {
		const result = await rollDamage(params.sessionId, params.secret);
		if (!result.ok) return fail(400, { challengeError: result.reason });
	},

	turnTimeout: async ({ params, request }) => {
		const hours = Number((await request.formData()).get('hours'));
		const result = await setTurnTimeout(params.sessionId, params.secret, hours);
		if (!result.ok) return fail(400, { timeoutError: result.reason });
		return { timeoutSaved: true };
	},

	/** `resolution` is `skip`, `wait` or `playAs`; `text` is the post for `playAs` on an action turn. */
	resolveTimeout: async ({ params, request }) => {
		const form = await request.formData();
		const resolution = String(form.get('resolution') ?? '') as TimeoutResolution;
		const result = await resolveTimeout(params.sessionId, params.secret, resolution, String(form.get('text') ?? ''));
		if (!result.ok) return fail(400, { resolveError: result.reason });
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
