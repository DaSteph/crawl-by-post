/**
 * Crawl mode and the spotlight: initiative, turn order, round counting, and the
 * posts that move the spotlight on (actions, GM responses, passes) or don't (chat).
 */
import type { CommandResult, Deps, EngineEvent, SessionState } from './index.ts';

export const DANGER_LEVELS = ['unsafe', 'risky', 'deadly'] as const;
export type Danger = (typeof DANGER_LEVELS)[number];

/** Hard cap against abuse. The soft limits in `POST_LIMITS` never block. */
export const MAX_POST_LENGTH = 4000;

/** The soft length limit: a counter from `show` characters, marked as too long above `over`. */
export const POST_LIMITS = {
	player: { show: 200, over: 300 },
	gm: { show: 400, over: 600 }
} as const;

/** A GM turn sits between every two player turns; `afterSeat` is the player who just acted. */
export type Spotlight = { kind: 'player'; seat: number } | { kind: 'gm'; afterSeat: number };

export type Crawl = {
	danger: Danger;
	/** Seats in turn order: the initiative winner first, then seat order. */
	order: number[];
	/** Starts at 1 and goes up each time the spotlight returns to `order[0]`. */
	round: number;
	spotlight: Spotlight;
};

export type InitiativeRoll = { seat: number; d20: number; modifier: number; total: number };

export type LogEntry = { at: string } & (
	| { kind: 'crawlStarted'; danger: Danger }
	| {
			kind: 'initiative';
			rolls: InitiativeRoll[];
			/** Plain d20 roll-offs between characters tied for the top, in order. */
			rollOffs: { seat: number; d20: number }[][];
			winner: number;
	  }
	| { kind: 'round'; round: number }
	/** A spotlight post by a player. */
	| { kind: 'action'; seat: number; text: string }
	/** A GM post during the GM's turn. */
	| { kind: 'response'; text: string }
	| { kind: 'pass' }
	/** Anything posted out of turn. */
	| { kind: 'chat'; author: number | 'gm'; text: string }
);

export type StartCrawl = { type: 'startCrawl'; by: string; danger: Danger };
export type PostAction = { type: 'postAction'; by: string; text: string };
export type PostChat = { type: 'postChat'; by: string; text: string };
export type PassSpotlight = { type: 'passSpotlight'; by: string };

/** Who holds the spotlight now, as `'gm'`, a seat, or null outside a crawl. */
export function spotlightHolder(state: SessionState): 'gm' | number | null {
	const s = state.crawl?.spotlight;
	if (!s) return null;
	return s.kind === 'gm' ? 'gm' : s.seat;
}

function author(state: SessionState, secret: string): 'gm' | number | null {
	if (secret === state.gmSecret) return 'gm';
	return state.players.find((p) => p.secret === secret)?.seat ?? null;
}

function cleanText(text: string): { ok: true; text: string } | { ok: false; reason: string } {
	const clean = text.replace(/\r\n/g, '\n').trim();
	if (!clean) return { ok: false, reason: 'Write something first.' };
	if (clean.length > MAX_POST_LENGTH) {
		return { ok: false, reason: `A post can be at most ${MAX_POST_LENGTH} characters long.` };
	}
	return { ok: true, text: clean };
}

function logged(entry: LogEntry): EngineEvent {
	return { type: 'logged', entry };
}

/** Rolls d20 + DEX for every character; ties for the top roll off with plain d20s. */
function rollInitiative(state: SessionState, deps: Deps) {
	const rolls: InitiativeRoll[] = state.players.flatMap((p) => {
		if (!p.character) return [];
		const d20 = deps.dice(20);
		const modifier = p.character.abilities.DEX.modifier;
		return [{ seat: p.seat, d20, modifier, total: d20 + modifier }];
	});
	const best = Math.max(...rolls.map((r) => r.total));
	let tied = rolls.filter((r) => r.total === best).map((r) => r.seat);
	const rollOffs: { seat: number; d20: number }[][] = [];
	while (tied.length > 1) {
		const round = tied.map((seat) => ({ seat, d20: deps.dice(20) }));
		rollOffs.push(round);
		const top = Math.max(...round.map((r) => r.d20));
		tied = round.filter((r) => r.d20 === top).map((r) => r.seat);
	}
	return { rolls, rollOffs, winner: tied[0] };
}

export function startCrawl(state: SessionState, command: StartCrawl, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can start a crawl.' };
	if (!DANGER_LEVELS.includes(command.danger)) return { ok: false, reason: 'Pick a danger level.' };
	if (!state.players.some((p) => p.character)) {
		return { ok: false, reason: 'At least one player needs to import a character first.' };
	}

	const at = deps.now().toISOString();
	const { rolls, rollOffs, winner } = rollInitiative(state, deps);
	const seats = rolls.map((r) => r.seat).sort((a, b) => a - b);
	const start = seats.indexOf(winner);
	const order = [...seats.slice(start), ...seats.slice(0, start)];
	const spotlight: Spotlight = { kind: 'player', seat: winner };

	return {
		ok: true,
		state: { ...state, crawl: { danger: command.danger, order, round: 1, spotlight } },
		events: [
			logged({ at, kind: 'crawlStarted', danger: command.danger }),
			logged({ at, kind: 'initiative', rolls, rollOffs, winner }),
			{ type: 'spotlightChanged', spotlight }
		]
	};
}

/** Hands the spotlight from the GM to the next player, counting a round when it wraps. */
function nextPlayer(state: SessionState, crawl: Crawl, afterSeat: number, at: string): CommandResult {
	const index = (crawl.order.indexOf(afterSeat) + 1) % crawl.order.length;
	const spotlight: Spotlight = { kind: 'player', seat: crawl.order[index] };
	const events: EngineEvent[] = [];
	let round = crawl.round;
	if (index === 0) {
		events.push({ type: 'roundCompleted', round });
		round += 1;
		events.push(logged({ at, kind: 'round', round }));
	}
	events.push({ type: 'spotlightChanged', spotlight });
	return { ok: true, state: { ...state, crawl: { ...crawl, round, spotlight } }, events };
}

export function postAction(state: SessionState, command: PostAction, deps: Deps): CommandResult {
	const who = author(state, command.by);
	if (who === null) return { ok: false, reason: 'Only participants can post.' };
	const crawl = state.crawl;
	if (!crawl) return { ok: false, reason: 'The crawl hasn’t started yet. You can still chat.' };
	if (spotlightHolder(state) !== who) {
		return { ok: false, reason: 'It’s not your turn any more. Your text is still in the box; post it as chat.' };
	}
	const text = cleanText(command.text);
	if (!text.ok) return text;
	const at = deps.now().toISOString();

	if (crawl.spotlight.kind === 'gm') {
		const result = nextPlayer(state, crawl, crawl.spotlight.afterSeat, at);
		return result.ok
			? { ...result, events: [logged({ at, kind: 'response', text: text.text }), ...result.events] }
			: result;
	}

	const seat = crawl.spotlight.seat;
	const spotlight: Spotlight = { kind: 'gm', afterSeat: seat };
	return {
		ok: true,
		state: { ...state, crawl: { ...crawl, spotlight } },
		events: [logged({ at, kind: 'action', seat, text: text.text }), { type: 'spotlightChanged', spotlight }]
	};
}

export function passSpotlight(state: SessionState, command: PassSpotlight, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can pass.' };
	const crawl = state.crawl;
	if (!crawl || crawl.spotlight.kind !== 'gm') return { ok: false, reason: 'It’s not your turn.' };
	const at = deps.now().toISOString();
	const result = nextPlayer(state, crawl, crawl.spotlight.afterSeat, at);
	return result.ok ? { ...result, events: [logged({ at, kind: 'pass' }), ...result.events] } : result;
}

export function postChat(state: SessionState, command: PostChat, deps: Deps): CommandResult {
	const who = author(state, command.by);
	if (who === null) return { ok: false, reason: 'Only participants can post.' };
	const text = cleanText(command.text);
	if (!text.ok) return text;
	return {
		ok: true,
		state,
		events: [logged({ at: deps.now().toISOString(), kind: 'chat', author: who, text: text.text })]
	};
}
