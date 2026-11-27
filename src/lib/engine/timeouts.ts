/**
 * Turn timeouts: every spotlight turn runs on a clock. Halfway through, the
 * holder gets a reminder; at the end, a GM turn passes by itself and a player
 * turn goes to the GM as a ruling (skip, wait longer, or play the character).
 *
 * The engine only says when the clock starts and stops. The server adapter
 * turns that into scheduled jobs, which come back as `turnTimerFired`. A job
 * that fires for a clock that has since been replaced is ignored, so a missed
 * cancellation can never end the wrong turn.
 */
import type { CommandResult, Deps, EngineEvent, SessionState } from './index.ts';
import { acceptChallenge, rollDamageCommand } from './challenges.ts';
import { cleanText, logged, nextPlayer, type Spotlight } from './turns.ts';

export const DEFAULT_TURN_TIMEOUT_HOURS = 24;
export const MIN_TURN_TIMEOUT_HOURS = 1;
/** A week. Longer than that and the table has stopped, not slowed down. */
export const MAX_TURN_TIMEOUT_HOURS = 168;

/**
 * The clock of the current spotlight turn. `id` goes up with every (re)start,
 * across crawls, so fired jobs can tell whether they still belong to it.
 * `timedOut` is set when a player's turn ran out and the GM has to decide.
 */
export type TurnClock = { id: number; startedAt: string; timedOut?: true };

export type TimeoutResolution = 'skip' | 'wait' | 'playAs';

export type SetTurnTimeout = { type: 'setTurnTimeout'; by: string; hours: number };
/** Sent by the server when a scheduled job comes due. */
export type TurnTimerFired = { type: 'turnTimerFired'; clock: number; kind: 'reminder' | 'timeout' };
/** `text` is the post the GM writes for the player with `playAs` on an action turn. */
export type ResolveTimeout = { type: 'resolveTimeout'; by: string; resolution: TimeoutResolution; text?: string };

export type TimeoutEntry =
	| { kind: 'timedOut'; seat: number }
	| { kind: 'timeoutResolved'; seat: number; resolution: TimeoutResolution }
	| { kind: 'timeoutChanged'; hours: number };

const HOUR = 3600_000;

export function turnTimeoutHours(state: SessionState): number {
	return state.turnTimeoutHours ?? DEFAULT_TURN_TIMEOUT_HOURS;
}

/** When the current turn times out, or null when no clock is running. */
export function timeoutAt(state: SessionState): Date | null {
	const clock = state.turnClock;
	if (!state.crawl || !clock || clock.timedOut) return null;
	return new Date(Date.parse(clock.startedAt) + turnTimeoutHours(state) * HOUR);
}

/** Starts clock `id`, counting from `startedAt`. Moments already past fire right away (or not at all, for the reminder). */
function startClock(state: SessionState, startedAt: string, deps: Deps): { state: SessionState; events: EngineEvent[] } {
	const previous = state.turnClock;
	const clock: TurnClock = { id: (previous?.id ?? 0) + 1, startedAt };
	const now = deps.now().getTime();
	const start = Date.parse(startedAt);
	const period = turnTimeoutHours(state) * HOUR;
	const reminder = start + period / 2;
	const timeout = Math.max(start + period, now);
	const events: EngineEvent[] = [];
	if (previous) events.push({ type: 'turnTimerStopped', clock: previous.id });
	events.push({
		type: 'turnTimerStarted',
		clock: clock.id,
		reminderAt: reminder > now ? new Date(reminder).toISOString() : null,
		timeoutAt: new Date(timeout).toISOString()
	});
	return { state: { ...state, turnClock: clock }, events };
}

/**
 * Runs after every successful command: a command that moved the spotlight
 * starts a fresh clock for the new turn (and stops the old one).
 */
export function keepTime(result: CommandResult, deps: Deps): CommandResult {
	if (!result.ok || !result.state.crawl) return result;
	if (!result.events.some((e) => e.type === 'spotlightChanged')) return result;
	const started = startClock(result.state, deps.now().toISOString(), deps);
	return { ok: true, state: started.state, events: [...result.events, ...started.events] };
}

export function setTurnTimeout(state: SessionState, command: SetTurnTimeout, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can set the turn timeout.' };
	const { hours } = command;
	if (!Number.isInteger(hours) || hours < MIN_TURN_TIMEOUT_HOURS || hours > MAX_TURN_TIMEOUT_HOURS) {
		return {
			ok: false,
			reason: `The turn timeout must be a whole number of hours from ${MIN_TURN_TIMEOUT_HOURS} to ${MAX_TURN_TIMEOUT_HOURS}.`
		};
	}
	const next: SessionState = { ...state, turnTimeoutHours: hours };
	const events: EngineEvent[] = [
		logged({ at: deps.now().toISOString(), kind: 'timeoutChanged', hours }),
		{ type: 'turnTimeoutChanged', hours }
	];
	// The running turn keeps its start, but ends by the new timeout.
	const clock = state.turnClock;
	if (!state.crawl || !clock || clock.timedOut) return { ok: true, state: next, events };
	const restarted = startClock(next, clock.startedAt, deps);
	return { ok: true, state: restarted.state, events: [...events, ...restarted.events] };
}

function holderSeat(spotlight: Spotlight): number | null {
	return spotlight.kind === 'gm' ? null : spotlight.seat;
}

export function turnTimerFired(state: SessionState, command: TurnTimerFired, deps: Deps): CommandResult {
	const clock = state.turnClock;
	const crawl = state.crawl;
	// A job for a turn that is already over, or for a clock that has run out, changes nothing.
	if (!crawl || !clock || clock.id !== command.clock || clock.timedOut) return { ok: true, state, events: [] };

	const spotlight = crawl.spotlight;
	if (command.kind === 'reminder') {
		return { ok: true, state, events: [{ type: 'turnReminderDue', holder: holderSeat(spotlight) ?? 'gm' }] };
	}

	const at = deps.now().toISOString();
	if (spotlight.kind === 'gm') {
		// A GM who does nothing never freezes the table: the turn passes by itself.
		const result = nextPlayer(state, crawl, spotlight.afterSeat, at);
		return result.ok ? { ...result, events: [logged({ at, kind: 'pass', timedOut: true }), ...result.events] } : result;
	}
	const seat = spotlight.seat;

	return {
		ok: true,
		state: { ...state, turnClock: { ...clock, timedOut: true } },
		events: [logged({ at, kind: 'timedOut', seat }), { type: 'playerTimedOut', seat }]
	};
}

export function resolveTimeout(state: SessionState, command: ResolveTimeout, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can decide on a timed-out turn.' };
	const crawl = state.crawl;
	const seat = crawl ? holderSeat(crawl.spotlight) : null;
	if (!crawl || seat === null || !state.turnClock?.timedOut) {
		return { ok: false, reason: 'No turn is waiting for your decision.' };
	}
	const player = state.players.find((p) => p.seat === seat)!;
	const at = deps.now().toISOString();
	const decided = logged({ at, kind: 'timeoutResolved', seat, resolution: command.resolution });

	switch (command.resolution) {
		case 'wait': {
			const restarted = startClock(state, at, deps);
			return { ok: true, state: restarted.state, events: [decided, ...restarted.events] };
		}

		case 'skip': {
			const spotlight: Spotlight = { kind: 'gm', afterSeat: seat };
			const events: EngineEvent[] = [decided, { type: 'spotlightChanged', spotlight }];
			// A skipped action turn is a completed player action; a skipped challenge or damage roll is not.
			if (crawl.spotlight.kind === 'player') events.push({ type: 'playerActionCompleted', seat });
			return { ok: true, state: { ...state, crawl: { ...crawl, spotlight } }, events };
		}

		case 'playAs': {
			if (crawl.spotlight.kind === 'challenge') {
				const result = acceptChallenge(state, { type: 'acceptChallenge', by: player.secret }, deps);
				return result.ok ? { ...result, events: [decided, ...result.events] } : result;
			}
			if (crawl.spotlight.kind === 'damage') {
				const result = rollDamageCommand(state, { type: 'rollDamage', by: player.secret }, deps);
				return result.ok ? { ...result, events: [decided, ...result.events] } : result;
			}
			const text = cleanText(command.text ?? '');
			if (!text.ok) return text;
			const spotlight: Spotlight = { kind: 'gm', afterSeat: seat };
			return {
				ok: true,
				state: { ...state, crawl: { ...crawl, spotlight } },
				events: [
					decided,
					logged({ at, kind: 'action', seat, text: text.text, playedByGm: true }),
					{ type: 'spotlightChanged', spotlight },
					{ type: 'playerActionCompleted', seat }
				]
			};
		}

		default:
			return { ok: false, reason: 'Pick skip, wait or play.' };
	}
}
