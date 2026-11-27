/**
 * Wandering monster checks: in crawl mode, every few completed rounds (by the
 * crawl's danger level) a check comes due for the GM. The GM turns it into a
 * committed roll for a player with one tap, or postpones or skips it. The
 * round counter keeps going whatever the GM decides.
 *
 * A due check is the GM's knowledge: nothing is logged until the GM sets it.
 */
import type { CommandResult, Deps, EngineEvent, SessionState } from './index.ts';
import { askChallenge, type Challenge, type CommittedRoll } from './challenges.ts';
import type { Danger } from './turns.ts';

/** How many completed rounds lie between two checks, per danger level. */
export const CHECK_EVERY: Record<Danger, number> = { unsafe: 3, risky: 2, deadly: 1 };

/** Shadowdark's check: a 1 on a d6 means a wandering monster turns up. */
export const WANDERING_ROLL: CommittedRoll = { type: 'committedRoll', purpose: 'wandering', sides: 6, on: 1 };

/** `due` shows the GM the prompt; `postponed` comes due again when the next round completes. */
export type WanderingCheck = 'due' | 'postponed';

/** `seat` picks the player who rolls; absent means the next player in the spotlight order. */
export type SetWanderingCheck = { type: 'setWanderingCheck'; by: string; seat?: number };
export type PostponeWanderingCheck = { type: 'postponeWanderingCheck'; by: string };
export type SkipWanderingCheck = { type: 'skipWanderingCheck'; by: string };

/**
 * Runs after every successful command: a completed round brings a check due
 * every `CHECK_EVERY` rounds, and brings a postponed check back.
 */
export function watchRounds(result: CommandResult): CommandResult {
	// Paused in combat. Ending the fight starts a new crawl, which counts from round 1.
	if (!result.ok || !result.state.crawl || result.state.crawl.combat) return result;
	const crawl = result.state.crawl;
	let check = crawl.wanderingCheck;
	const events: EngineEvent[] = [];
	for (const e of result.events) {
		if (e.type !== 'roundCompleted') continue;
		if (check === 'due') continue;
		if (check === 'postponed' || e.round % CHECK_EVERY[crawl.danger] === 0) {
			check = 'due';
			events.push({ type: 'wanderingCheckDue', round: e.round });
		}
	}
	if (events.length === 0) return result;
	return {
		ok: true,
		state: { ...result.state, crawl: { ...crawl, wanderingCheck: check } },
		events: [...result.events, ...events]
	};
}

function pendingCheck(state: SessionState, by: string) {
	if (by !== state.gmSecret) return { ok: false as const, reason: 'Only the GM decides on wandering monster checks.' };
	const crawl = state.crawl;
	if (!crawl?.wanderingCheck) return { ok: false as const, reason: 'No wandering monster check is due.' };
	return { ok: true as const, crawl, check: crawl.wanderingCheck };
}

/** The player the check goes to by default: whoever gets the spotlight after the GM's turn. */
export function nextInOrder(order: number[], afterSeat: number): number {
	return order[(order.indexOf(afterSeat) + 1) % order.length];
}

export function setWanderingCheck(state: SessionState, command: SetWanderingCheck, deps: Deps): CommandResult {
	const found = pendingCheck(state, command.by);
	if (!found.ok) return found;
	const { crawl } = found;
	const spotlight = crawl.spotlight;
	if (spotlight.kind !== 'gm') return { ok: false, reason: 'You can set the check in your turn.' };
	const seat = command.seat ?? nextInOrder(crawl.order, spotlight.afterSeat);
	if (!crawl.order.includes(seat)) return { ok: false, reason: 'Pick a player who is in the crawl.' };

	const challenge: Challenge = {
		seat,
		check: WANDERING_ROLL,
		dc: 0,
		edge: null,
		stakes: '',
		// The check doesn't take the GM's turn: afterwards it goes on where it was.
		...(seat !== spotlight.afterSeat ? { returnTo: spotlight.afterSeat } : {})
	};
	const cleared: SessionState = { ...state, crawl: { ...crawl, wanderingCheck: undefined } };
	return askChallenge(cleared, challenge, deps);
}

export function postponeWanderingCheck(state: SessionState, command: PostponeWanderingCheck): CommandResult {
	const found = pendingCheck(state, command.by);
	if (!found.ok) return found;
	if (found.check === 'postponed') return { ok: false, reason: 'The check is postponed already.' };
	return {
		ok: true,
		state: { ...state, crawl: { ...found.crawl, wanderingCheck: 'postponed' } },
		events: [{ type: 'wanderingCheckPostponed' }]
	};
}

export function skipWanderingCheck(state: SessionState, command: SkipWanderingCheck): CommandResult {
	const found = pendingCheck(state, command.by);
	if (!found.ok) return found;
	return {
		ok: true,
		state: { ...state, crawl: { ...found.crawl, wanderingCheck: undefined } },
		events: [{ type: 'wanderingCheckSkipped' }]
	};
}
