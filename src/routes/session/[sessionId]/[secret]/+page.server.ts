import { error, fail } from '@sveltejs/kit';
import {
	addPlayerSlot,
	answerChallenge,
	editInventory,
	importCharacter,
	lightTorch,
	loadSessionView,
	monsterAttack,
	moveMonster,
	moveToken,
	passSpotlight,
	placeMonster,
	removeMonster,
	ruleOnHpChange,
	setCharacterHp,
	setMonsterHp,
	postAction,
	postChat,
	resolveTimeout,
	rollDamage,
	setAreaRevealed,
	setAreaLight,
	setChallenge,
	setLightCounter,
	setTurnTimeout,
	setLanguage,
	startCrawl,
	startCombat,
	endCombat,
	decideWanderingCheck
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
		hpChanges: view.hpChanges,
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

	startCombat: async ({ params }) => {
		const result = await startCombat(params.sessionId, params.secret);
		if (!result.ok) return fail(400, { combatError: result.reason });
	},

	endCombat: async ({ params, request }) => {
		const danger = String((await request.formData()).get('danger') ?? '') as Danger;
		const result = await endCombat(params.sessionId, params.secret, danger);
		if (!result.ok) return fail(400, { combatError: result.reason });
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
		// `target` is a monster id, or empty for an attack against a DC the GM sets.
		const target = String(form.get('target') ?? '');
		const check: CheckChoice =
			type === 'attack'
				? { type: 'attack', weapon: Number(value), ...(target ? { target } : {}) }
				: { type: 'test', ability: value as Ability };
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

	language: async ({ params, request }) => {
		const language = String((await request.formData()).get('language') ?? '');
		const result = await setLanguage(params.sessionId, params.secret, language);
		if (!result.ok) return fail(400, { languageError: result.reason });
		return { languageSaved: true };
	},

	/** `resolution` is `skip`, `wait` or `playAs`; `text` is the post for `playAs` on an action turn. */
	resolveTimeout: async ({ params, request }) => {
		const form = await request.formData();
		const resolution = String(form.get('resolution') ?? '') as TimeoutResolution;
		const result = await resolveTimeout(params.sessionId, params.secret, resolution, String(form.get('text') ?? ''));
		if (!result.ok) return fail(400, { resolveError: result.reason });
	},

	/** `decision` is `set` (for player `seat`, or the next one when empty), `postpone` or `skip`. */
	wanderingCheck: async ({ params, request }) => {
		const form = await request.formData();
		const decision = form.get('decision');
		const seat = Number(form.get('seat')) || undefined;
		if (decision !== 'set' && decision !== 'postpone' && decision !== 'skip') {
			return fail(400, { wanderingError: text.wandering.badDecision });
		}
		const result = await decideWanderingCheck(
			params.sessionId,
			params.secret,
			decision === 'set' ? { decision, seat } : { decision }
		);
		if (!result.ok) return fail(400, { wanderingError: result.reason });
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

	placeMonster: async ({ params, request }) => {
		const form = await request.formData();
		const areaId = String(form.get('area') ?? '');
		const wandering = form.get('wandering') === '1';
		const result = await placeMonster(params.sessionId, params.secret, areaId, Number(form.get('index')), wandering);
		if (!result.ok) return fail(400, wandering ? { wanderingPlaceError: result.reason } : { monsterError: result.reason });
	},

	moveMonster: async ({ params, request }) => {
		const form = await request.formData();
		const x = Number(form.get('x'));
		const y = Number(form.get('y'));
		if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(400, { moveError: text.map.badMove });
		const result = await moveMonster(params.sessionId, params.secret, String(form.get('id') ?? ''), { x, y });
		if (!result.ok) return fail(400, { moveError: result.reason });
	},

	removeMonster: async ({ params, request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const result = await removeMonster(params.sessionId, params.secret, id);
		if (!result.ok) return fail(400, { monsterError: result.reason });
	},

	monsterHp: async ({ params, request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const result = await setMonsterHp(params.sessionId, params.secret, id, Number(form.get('hp')), Number(form.get('maxHp')));
		if (!result.ok) return fail(400, { monsterError: result.reason, monsterId: id });
	},

	/** `option` indexes the monster's attack options; `edge` is empty for neither. */
	monsterAttack: async ({ params, request }) => {
		const form = await request.formData();
		const edgeValue = String(form.get('edge') ?? '');
		const edge: Edge = edgeValue === 'advantage' || edgeValue === 'disadvantage' ? edgeValue : null;
		const id = String(form.get('id') ?? '');
		const result = await monsterAttack(params.sessionId, params.secret, {
			id,
			option: Number(form.get('option')),
			seat: Number(form.get('seat')),
			edge
		});
		if (!result.ok) return fail(400, { monsterError: result.reason, monsterId: id });
	},

	/** `ruling` is `confirm` or `dismiss`; `amount` is the damage as the GM confirms it. */
	hpChange: async ({ params, request }) => {
		const form = await request.formData();
		const confirm = form.get('ruling') === 'confirm';
		const amountText = String(form.get('amount') ?? '').trim();
		const amount = amountText === '' ? undefined : Number(amountText);
		const result = await ruleOnHpChange(params.sessionId, params.secret, Number(form.get('id')), confirm, amount);
		if (!result.ok) return fail(400, { hpError: result.reason });
	},

	characterHp: async ({ params, request }) => {
		const form = await request.formData();
		const seat = Number(form.get('seat'));
		const result = await setCharacterHp(params.sessionId, params.secret, seat, Number(form.get('hp')));
		if (!result.ok) return fail(400, { characterHpError: result.reason, characterHpSeat: seat });
	},

	lightTorch: async ({ params }) => {
		const result = await lightTorch(params.sessionId, params.secret);
		if (!result.ok) return fail(400, { lightError: result.reason });
	},

	lightCounter: async ({ params, request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const result = await setLightCounter(params.sessionId, params.secret, id, Number(form.get('counter')));
		if (!result.ok) return fail(400, { lightError: result.reason, lightId: id });
	},

	/** `light` is `lit`, `dark`, or empty to let carried light decide again. */
	areaLight: async ({ params, request }) => {
		const form = await request.formData();
		const value = String(form.get('light') ?? '');
		const light = value === 'lit' || value === 'dark' ? value : null;
		const result = await setAreaLight(params.sessionId, params.secret, String(form.get('area') ?? ''), light);
		if (!result.ok) return fail(400, { areaLightError: result.reason });
	},

	/** `reveal` is `1` to reveal the area and `0` to hide it. */
	reveal: async ({ params, request }) => {
		const form = await request.formData();
		const areaId = String(form.get('area') ?? '');
		const result = await setAreaRevealed(params.sessionId, params.secret, areaId, form.get('reveal') === '1');
		if (!result.ok) return fail(400, { revealError: result.reason });
	}
};
