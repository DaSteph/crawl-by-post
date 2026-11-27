/**
 * Challenges and dice: the GM sets a test or an attack in response to a
 * player's action, the player rolls it (right away if they pre-consented,
 * otherwise after accepting), and a hit lets them roll damage.
 *
 * Every roll is made in the open and locked into the log. The engine shows
 * success or failure against the DC; what follows is the GM's ruling.
 */
import { ABILITIES, type Ability } from '../character/model.ts';
import { formatDice, rollDice, type DiceFormula } from './dice.ts';
import type { CommandResult, Deps, EngineEvent, SessionState } from './index.ts';
import type { LogEntry, Spotlight } from './turns.ts';

/** The DC quick picks in the challenge form, and the one preset. */
export const DC_PICKS = [9, 12, 15, 18] as const;
export const DEFAULT_DC = 12;
export const MIN_DC = 1;
export const MAX_DC = 30;
export const MAX_STAKES_LENGTH = 200;

export type Edge = 'advantage' | 'disadvantage' | null;

/** The weapon as it stood when the challenge was set, so a later re-import can't change the roll. */
export type WeaponRef = { name: string; attackBonus: number; damage: DiceFormula };

export type Check = { type: 'test'; ability: Ability } | { type: 'attack'; weapon: WeaponRef };

export type Challenge = { seat: number; check: Check; dc: number; edge: Edge; stakes: string };

/** What the GM picks in the form. `weapon` is an index into the character's weapons. */
export type CheckChoice = { type: 'test'; ability: Ability } | { type: 'attack'; weapon: number };

export type SetChallenge = {
	type: 'setChallenge';
	by: string;
	check: CheckChoice;
	dc: number;
	edge: Edge;
	stakes: string;
};
export type AcceptChallenge = { type: 'acceptChallenge'; by: string };
export type DeclineChallenge = { type: 'declineChallenge'; by: string };
export type RollDamage = { type: 'rollDamage'; by: string };

export type ChallengeEntry = { kind: 'challenge' } & Challenge;

export type RollEntry = {
	kind: 'roll';
	seat: number;
	check: Check;
	edge: Edge;
	/** Both d20s with advantage or disadvantage, otherwise one. */
	d20s: number[];
	/** The d20 that counts. */
	d20: number;
	modifier: number;
	total: number;
	dc: number;
	success: boolean;
};

export type DamageEntry = {
	kind: 'damage';
	seat: number;
	weapon: string;
	formula: string;
	rolls: number[];
	modifier: number;
	total: number;
};

const logged = (entry: LogEntry): EngineEvent => ({ type: 'logged', entry });

function roll(state: SessionState, challenge: Challenge, deps: Deps, at: string): { entry: LogEntry; hit: boolean } {
	const { check, edge, dc, seat } = challenge;
	const d20s = edge ? [deps.dice(20), deps.dice(20)] : [deps.dice(20)];
	const d20 = edge === 'advantage' ? Math.max(...d20s) : edge === 'disadvantage' ? Math.min(...d20s) : d20s[0];
	const character = state.players.find((p) => p.seat === seat)!.character!;
	const modifier = check.type === 'test' ? character.abilities[check.ability].modifier : check.weapon.attackBonus;
	const total = d20 + modifier;
	const success = total >= dc;
	return {
		entry: { at, kind: 'roll', seat, check, edge, d20s, d20, modifier, total, dc, success },
		hit: success && check.type === 'attack'
	};
}

function damage(seat: number, weapon: WeaponRef, deps: Deps, at: string): LogEntry {
	const { rolls, modifier, total } = rollDice(weapon.damage, deps.dice);
	return { at, kind: 'damage', seat, weapon: weapon.name, formula: formatDice(weapon.damage), rolls, modifier, total };
}

function withSpotlight(state: SessionState, spotlight: Spotlight): SessionState {
	return { ...state, crawl: { ...state.crawl!, spotlight } };
}

export function setChallenge(state: SessionState, command: SetChallenge, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can set a challenge.' };
	const spotlight = state.crawl?.spotlight;
	if (spotlight?.kind !== 'gm') return { ok: false, reason: 'You can set a challenge in your turn.' };
	const seat = spotlight.afterSeat;
	const character = state.players.find((p) => p.seat === seat)?.character;
	if (!character) return { ok: false, reason: 'That player has no character.' };

	const { dc, edge } = command;
	if (!Number.isInteger(dc) || dc < MIN_DC || dc > MAX_DC) {
		return { ok: false, reason: `The DC must be a whole number from ${MIN_DC} to ${MAX_DC}.` };
	}
	if (edge !== null && edge !== 'advantage' && edge !== 'disadvantage') {
		return { ok: false, reason: 'Pick advantage, disadvantage or neither.' };
	}
	const stakes = command.stakes.replace(/\s+/g, ' ').trim();
	if (stakes.length > MAX_STAKES_LENGTH) {
		return { ok: false, reason: `The stakes can be at most ${MAX_STAKES_LENGTH} characters long.` };
	}

	let check: Check;
	if (command.check.type === 'test') {
		if (!ABILITIES.includes(command.check.ability)) return { ok: false, reason: 'Pick an ability for the test.' };
		check = { type: 'test', ability: command.check.ability };
	} else {
		const weapon = character.weapons[command.check.weapon];
		if (!weapon) return { ok: false, reason: 'Pick one of the character’s weapons.' };
		check = { type: 'attack', weapon: { name: weapon.name, attackBonus: weapon.attackBonus, damage: weapon.damage } };
	}

	const challenge: Challenge = { seat, check, dc, edge, stakes };
	const at = deps.now().toISOString();
	const events: EngineEvent[] = [logged({ at, kind: 'challenge', ...challenge })];

	if (!spotlight.preConsent) {
		// The player sees the DC and stakes first, then accepts or backs out.
		const next: Spotlight = { kind: 'challenge', seat, challenge };
		return { ok: true, state: withSpotlight(state, next), events: [...events, { type: 'spotlightChanged', spotlight: next }] };
	}

	// Pre-consent covers this one challenge: roll now (and the damage on a hit), and the GM's turn goes on.
	const result = roll(state, challenge, deps, at);
	events.push(logged(result.entry));
	if (result.hit && check.type === 'attack') events.push(logged(damage(seat, check.weapon, deps, at)));
	return { ok: true, state: withSpotlight(state, { kind: 'gm', afterSeat: seat }), events };
}

function challengedPlayer(state: SessionState, by: string) {
	const player = state.players.find((p) => p.secret === by);
	if (!player) return { ok: false as const, reason: 'Only players can answer a challenge.' };
	const spotlight = state.crawl?.spotlight;
	if (spotlight?.kind !== 'challenge' || spotlight.seat !== player.seat) {
		return { ok: false as const, reason: 'There is no challenge waiting for you.' };
	}
	return { ok: true as const, spotlight };
}

export function acceptChallenge(state: SessionState, command: AcceptChallenge, deps: Deps): CommandResult {
	const found = challengedPlayer(state, command.by);
	if (!found.ok) return found;
	const { challenge } = found.spotlight;
	const at = deps.now().toISOString();
	const result = roll(state, challenge, deps, at);
	// A hit keeps the spotlight with the player for the damage roll; anything else goes to the GM.
	const next: Spotlight =
		result.hit && challenge.check.type === 'attack'
			? { kind: 'damage', seat: challenge.seat, weapon: challenge.check.weapon }
			: { kind: 'gm', afterSeat: challenge.seat };
	return {
		ok: true,
		state: withSpotlight(state, next),
		events: [logged(result.entry), { type: 'spotlightChanged', spotlight: next }]
	};
}

export function declineChallenge(state: SessionState, command: DeclineChallenge, deps: Deps): CommandResult {
	const found = challengedPlayer(state, command.by);
	if (!found.ok) return found;
	const seat = found.spotlight.seat;
	const next: Spotlight = { kind: 'gm', afterSeat: seat };
	return {
		ok: true,
		state: withSpotlight(state, next),
		events: [logged({ at: deps.now().toISOString(), kind: 'declined', seat }), { type: 'spotlightChanged', spotlight: next }]
	};
}

export function rollDamageCommand(state: SessionState, command: RollDamage, deps: Deps): CommandResult {
	const player = state.players.find((p) => p.secret === command.by);
	const spotlight = state.crawl?.spotlight;
	if (!player || spotlight?.kind !== 'damage' || spotlight.seat !== player.seat) {
		return { ok: false, reason: 'There is no damage to roll.' };
	}
	const next: Spotlight = { kind: 'gm', afterSeat: player.seat };
	return {
		ok: true,
		state: withSpotlight(state, next),
		events: [
			logged(damage(player.seat, spotlight.weapon, deps, deps.now().toISOString())),
			{ type: 'spotlightChanged', spotlight: next }
		]
	};
}
