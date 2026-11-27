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
import { suggestHp, type MonsterRef } from './monsters.ts';

/** The DC quick picks in the challenge form, and the one preset. */
export const DC_PICKS = [9, 12, 15, 18] as const;
export const DEFAULT_DC = 12;
export const MIN_DC = 1;
export const MAX_DC = 30;
export const MAX_STAKES_LENGTH = 200;

export type Edge = 'advantage' | 'disadvantage' | null;

/** The weapon as it stood when the challenge was set, so a later re-import can't change the roll. */
export type WeaponRef = { name: string; attackBonus: number; damage: DiceFormula };

/**
 * A plain die roll the player commits to, with no ability, DC or advantage:
 * a result of `on` or lower triggers it. A wandering monster check is 1d6 on 1.
 */
export type CommittedRoll = { type: 'committedRoll'; purpose: 'wandering'; sides: number; on: number };

/** `target` is the monster attacked, whose AC is the DC. Absent when the GM set the DC by hand. */
export type Check =
	| { type: 'test'; ability: Ability }
	| { type: 'attack'; weapon: WeaponRef; target?: MonsterRef }
	| CommittedRoll;

/**
 * `dc` and `edge` mean nothing for a committed roll (0 and null). `returnTo` is
 * the GM turn to go back to when the challenge went to someone other than the
 * player who just acted (a wandering monster check); absent means `seat`.
 */
export type Challenge = { seat: number; check: Check; dc: number; edge: Edge; stakes: string; returnTo?: number };

/**
 * What the GM picks in the form. `weapon` is an index into the character's weapons;
 * `target` is the id of a monster on the map, whose AC replaces the DC.
 */
export type CheckChoice = { type: 'test'; ability: Ability } | { type: 'attack'; weapon: number; target?: string };

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

/** A committed roll, locked into the log. `triggered` when the die showed `on` or lower. */
export type CommittedRollEntry = {
	kind: 'committedRoll';
	seat: number;
	roll: CommittedRoll;
	result: number;
	triggered: boolean;
};

export type DamageEntry = {
	kind: 'damage';
	seat: number;
	weapon: string;
	formula: string;
	rolls: number[];
	modifier: number;
	total: number;
	/** The monster hit. Its HP change waits for the GM. */
	target?: MonsterRef;
};

const logged = (entry: LogEntry): EngineEvent => ({ type: 'logged', entry });

function roll(state: SessionState, challenge: Challenge, deps: Deps, at: string): { entry: LogEntry; hit: boolean } {
	const { check, edge, dc, seat } = challenge;
	if (check.type === 'committedRoll') {
		const result = deps.dice(check.sides);
		return { entry: { at, kind: 'committedRoll', seat, roll: check, result, triggered: result <= check.on }, hit: false };
	}
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

/** Rolls a hit's damage. Against a monster still on the map, it also suggests the HP change for the GM to confirm. */
function damage(
	state: SessionState,
	seat: number,
	weapon: WeaponRef,
	target: MonsterRef | undefined,
	deps: Deps,
	at: string
): { state: SessionState; events: EngineEvent[] } {
	const { rolls, modifier, total } = rollDice(weapon.damage, deps.dice);
	const entry: LogEntry = {
		at,
		kind: 'damage',
		seat,
		weapon: weapon.name,
		formula: formatDice(weapon.damage),
		rolls,
		modifier,
		total,
		...(target ? { target } : {})
	};
	const onMap = target && state.monsters?.some((m) => m.id === target.id);
	const suggested = onMap ? suggestHp(state, { kind: 'monster', id: target.id }, total) : { state, events: [] };
	return { state: suggested.state, events: [logged(entry), ...suggested.events] };
}

function withSpotlight(state: SessionState, spotlight: Spotlight): SessionState {
	return { ...state, crawl: { ...state.crawl!, spotlight } };
}

export function setChallenge(state: SessionState, command: SetChallenge, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can set a challenge.' };
	const spotlight = state.crawl?.spotlight;
	if (spotlight?.kind !== 'gm') return { ok: false, reason: 'You can set a challenge in your turn.' };
	if (spotlight.opening) return { ok: false, reason: 'Nobody has acted yet. Have the monsters act, or pass.' };
	const seat = spotlight.afterSeat;
	const character = state.players.find((p) => p.seat === seat)?.character;
	if (!character) return { ok: false, reason: 'That player has no character.' };

	const { edge } = command;
	let { dc } = command;
	const targetId = command.check.type === 'attack' ? command.check.target : undefined;
	const target = targetId ? state.monsters?.find((m) => m.id === targetId) : undefined;
	if (targetId && !target) return { ok: false, reason: 'That monster isn’t on the map any more.' };
	// An attack on a monster uses its AC; nobody has to look it up.
	if (target) dc = target.ac;
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
		check = {
			type: 'attack',
			weapon: { name: weapon.name, attackBonus: weapon.attackBonus, damage: weapon.damage },
			...(target ? { target: { id: target.id, name: target.name } } : {})
		};
	}

	return askChallenge(state, { seat, check, dc, edge, stakes }, deps);
}

/** The GM turn a challenge hands back to once it's rolled or declined. */
const backToGm = (challenge: Challenge): Spotlight => ({ kind: 'gm', afterSeat: challenge.returnTo ?? challenge.seat });

/**
 * Puts a challenge to a player in the GM's turn. When the player who just acted
 * ticked pre-consent and the challenge is theirs, it rolls right away;
 * otherwise the player sees it first and accepts or backs out.
 */
export function askChallenge(state: SessionState, challenge: Challenge, deps: Deps): CommandResult {
	const spotlight = state.crawl!.spotlight;
	const preConsented = spotlight.kind === 'gm' && spotlight.preConsent && challenge.seat === spotlight.afterSeat;
	const at = deps.now().toISOString();
	const events: EngineEvent[] = [logged({ at, kind: 'challenge', ...challenge })];

	if (!preConsented) {
		const next: Spotlight = { kind: 'challenge', seat: challenge.seat, challenge };
		return { ok: true, state: withSpotlight(state, next), events: [...events, { type: 'spotlightChanged', spotlight: next }] };
	}

	// Pre-consent covers this one challenge: roll now (and the damage on a hit), and the GM's turn goes on.
	const { check, seat } = challenge;
	const result = roll(state, challenge, deps, at);
	events.push(logged(result.entry));
	let next = state;
	if (result.hit && check.type === 'attack') {
		const rolled = damage(state, seat, check.weapon, check.target, deps, at);
		next = rolled.state;
		events.push(...rolled.events);
	}
	return { ok: true, state: withSpotlight(next, backToGm(challenge)), events };
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
			? {
					kind: 'damage',
					seat: challenge.seat,
					weapon: challenge.check.weapon,
					...(challenge.check.target ? { target: challenge.check.target } : {})
				}
			: backToGm(challenge);
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
	const next = backToGm(found.spotlight.challenge);
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
	const rolled = damage(state, player.seat, spotlight.weapon, spotlight.target, deps, deps.now().toISOString());
	return {
		ok: true,
		state: withSpotlight(rolled.state, next),
		events: [...rolled.events, { type: 'spotlightChanged', spotlight: next }]
	};
}
