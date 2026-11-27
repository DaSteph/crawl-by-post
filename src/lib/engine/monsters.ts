/**
 * Monsters and damage: the GM places monsters from the dungeon file, moves and
 * removes their tokens, and rolls their attacks in the open. Damage, from a
 * player's weapon or a monster's attack, never changes HP by itself: it becomes
 * a suggestion that takes effect when the GM confirms it.
 *
 * Players see a monster's condition, never its HP. The log is public, so no
 * log entry carries a monster's HP.
 */
import { cellsOf, inRect, localize, type AttackOption, type Cell, type Dungeon } from '../dungeon/model.ts';
import { formatDice, rollDice, type DiceFormula } from './dice.ts';
import type { CommandResult, Deps, EngineEvent, PlayerSlot, Position, SessionState } from './index.ts';
import type { Edge } from './challenges.ts';
import { logged, type LogEntry } from './turns.ts';

export const MAX_HP = 999;

/** How a monster's HP looks to players. `down` is 0 HP: the GM decides what that means and removes the token. */
export type Condition = 'unhurt' | 'wounded' | 'nearDeath' | 'down';

/** A monster token on the map, with what the engine needs of its stat block, copied at placement. */
export type PlacedMonster = {
	/** The token label, unique in the session: the file's label plus a number ("G1", "G2"). */
	id: string;
	/** In the dungeon's default language. */
	name: string;
	ac: number;
	attacks: AttackOption[];
	hp: number;
	maxHp: number;
	position: Position;
};

/** What a log entry or challenge names a monster by. */
export type MonsterRef = { id: string; name: string };

export type HpTarget = { kind: 'monster'; id: string } | { kind: 'player'; seat: number };

/** Damage waiting for the GM: `amount` comes off `target`'s HP once confirmed. */
export type HpChange = { id: number; target: HpTarget; amount: number };

export type PlaceMonster = { type: 'placeMonster'; by: string; areaId: string; index: number; dungeon: Dungeon };
export type MoveMonster = { type: 'moveMonster'; by: string; id: string; to: Cell; dungeon: Dungeon };
export type RemoveMonster = { type: 'removeMonster'; by: string; id: string };
export type SetMonsterHp = { type: 'setMonsterHp'; by: string; id: string; hp: number; maxHp: number };
/** `amount` overrides the suggested amount, when the GM rules on a different one. */
export type ConfirmHpChange = { type: 'confirmHpChange'; by: string; id: number; amount?: number };
export type DismissHpChange = { type: 'dismissHpChange'; by: string; id: number };
/** `option` is an index into the monster's attack options ("or"); every attack in it is rolled ("and"). */
export type MonsterAttack = { type: 'monsterAttack'; by: string; id: string; option: number; seat: number; edge: Edge };
/** The GM's ruling on a character's HP, e.g. healing or stabilising a dying character. */
export type SetCharacterHp = { type: 'setCharacterHp'; by: string; seat: number; hp: number };

export type Strike = {
	attack: string;
	d20s: number[];
	d20: number;
	bonus: number;
	total: number;
	hit: boolean;
	/** Null on a miss, or for an attack that only causes an effect. */
	damage: { formula: string; rolls: number[]; modifier: number; total: number } | null;
	/** Shown on a hit. */
	effect: string | null;
};

export type MonsterEntry =
	/** One attack option, against one character's AC: every strike in it, each with its damage on a hit. */
	| { kind: 'monsterAttack'; monster: MonsterRef; seat: number; ac: number; edge: Edge; strikes: Strike[] }
	/** A confirmed HP change on a monster, as players may see it. */
	| { kind: 'monsterHurt'; monster: MonsterRef; condition: Condition }
	/** A confirmed HP change on a character. */
	| { kind: 'characterHurt'; seat: number; amount: number }
	| { kind: 'dying'; seat: number };

/** Unhurt at full HP, near death at a third or less, down at 0. */
export function conditionOf(hp: number, maxHp: number): Condition {
	if (hp <= 0) return 'down';
	if (hp >= maxHp) return 'unhurt';
	if (hp * 3 <= maxHp) return 'nearDeath';
	return 'wounded';
}

export const isDying = (p: PlayerSlot): boolean => Boolean(p.character) && (p.hp ?? 1) <= 0;

const key = (c: Cell) => `${c.x},${c.y}`;

/** Squares a token or monster stands on, except the given player's or monster's own. */
export function occupiedCells(state: SessionState, except: { seat?: number; monster?: string } = {}): Set<string> {
	const cells = new Set<string>();
	for (const p of state.players) {
		if (p.seat !== except.seat && p.character && p.position) cells.add(key(p.position.cell));
	}
	for (const m of state.monsters ?? []) {
		if (m.id !== except.monster) cells.add(key(m.position.cell));
	}
	return cells;
}

const refOf = (m: PlacedMonster): MonsterRef => ({ id: m.id, name: m.name });

function withMonster(state: SessionState, id: string, change: Partial<PlacedMonster>): SessionState {
	return { ...state, monsters: (state.monsters ?? []).map((m) => (m.id === id ? { ...m, ...change } : m)) };
}

function findMonster(state: SessionState, id: string): PlacedMonster | undefined {
	return state.monsters?.find((m) => m.id === id);
}

function rollHp(hp: DiceFormula | null, level: number, con: number, deps: Deps): number {
	// The book's way when the file gives no HP: level × d8 + CON, at least 1.
	const formula = hp ?? { count: level, sides: 8, modifier: con };
	return Math.min(MAX_HP, Math.max(1, rollDice(formula, deps.dice).total));
}

const isHp = (n: number, min: number) => Number.isInteger(n) && n >= min && n <= MAX_HP;

export function placeMonster(state: SessionState, command: PlaceMonster, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can place monsters.' };
	const { dungeon } = command;
	const area = dungeon.areas.find((a) => a.id === command.areaId);
	if (!area) return { ok: false, reason: 'That area isn’t in the dungeon.' };
	const monster = area.monsters[command.index];
	if (!monster) return { ok: false, reason: 'That monster isn’t listed for this area.' };

	const taken = occupiedCells(state);
	const cell = cellsOf(area.rect).find((c) => !taken.has(key(c)));
	if (!cell) return { ok: false, reason: 'Every square of that area is taken.' };

	const counts = state.monsterCounts ?? {};
	const number = (counts[monster.label] ?? 0) + 1;
	const hp = rollHp(monster.hp, monster.level, monster.stats.c ?? 0, deps);
	const placed: PlacedMonster = {
		id: `${monster.label}${number}`,
		name: localize(monster.name, dungeon.languages[0], dungeon.languages[0]),
		ac: monster.ac,
		attacks: monster.attacks,
		hp,
		maxHp: hp,
		position: { area: area.id, cell }
	};
	return {
		ok: true,
		state: {
			...state,
			monsters: [...(state.monsters ?? []), placed],
			monsterCounts: { ...counts, [monster.label]: number }
		},
		events: [{ type: 'monsterPlaced', id: placed.id, position: placed.position }]
	};
}

export function moveMonster(state: SessionState, command: MoveMonster): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can move monsters.' };
	const monster = findMonster(state, command.id);
	if (!monster) return { ok: false, reason: 'That monster isn’t on the map.' };
	const area = command.dungeon.areas.find((a) => inRect(command.to, a.rect));
	if (!area) return { ok: false, reason: 'That square isn’t part of the dungeon.' };
	if (occupiedCells(state, { monster: monster.id }).has(key(command.to))) {
		return { ok: false, reason: 'Something is already standing there.' };
	}
	const position: Position = { area: area.id, cell: command.to };
	return {
		ok: true,
		state: withMonster(state, monster.id, { position }),
		events: [{ type: 'monsterMoved', id: monster.id, position }]
	};
}

export function removeMonster(state: SessionState, command: RemoveMonster): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can remove monsters.' };
	if (!findMonster(state, command.id)) return { ok: false, reason: 'That monster isn’t on the map.' };
	return {
		ok: true,
		state: {
			...state,
			monsters: state.monsters!.filter((m) => m.id !== command.id),
			// Damage waiting for a monster that is gone has nothing left to apply to.
			hpChanges: (state.hpChanges ?? []).filter((c) => !(c.target.kind === 'monster' && c.target.id === command.id))
		},
		events: [{ type: 'monsterRemoved', id: command.id }]
	};
}

export function setMonsterHp(state: SessionState, command: SetMonsterHp): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can change a monster’s HP.' };
	const monster = findMonster(state, command.id);
	if (!monster) return { ok: false, reason: 'That monster isn’t on the map.' };
	const { hp, maxHp } = command;
	if (!isHp(maxHp, 1)) return { ok: false, reason: `Max HP must be a whole number from 1 to ${MAX_HP}.` };
	if (!isHp(hp, 0) || hp > maxHp) return { ok: false, reason: 'HP must be a whole number from 0 to max HP.' };
	return {
		ok: true,
		state: withMonster(state, monster.id, { hp, maxHp }),
		events: [{ type: 'monsterHpSet', id: monster.id }]
	};
}

/** Adds a suggestion for the GM to confirm. No damage, no suggestion. */
export function suggestHp(state: SessionState, target: HpTarget, amount: number): { state: SessionState; events: EngineEvent[] } {
	if (amount <= 0) return { state, events: [] };
	const change: HpChange = { id: (state.lastHpChangeId ?? 0) + 1, target, amount };
	return {
		state: { ...state, hpChanges: [...(state.hpChanges ?? []), change], lastHpChangeId: change.id },
		events: [{ type: 'hpChangeSuggested', change }]
	};
}

function pendingChange(state: SessionState, by: string, id: number) {
	if (by !== state.gmSecret) return { ok: false as const, reason: 'Only the GM can rule on HP changes.' };
	const change = state.hpChanges?.find((c) => c.id === id);
	if (!change) return { ok: false as const, reason: 'That HP change has already been handled.' };
	return { ok: true as const, change, rest: state.hpChanges!.filter((c) => c.id !== id) };
}

/** Sets a character's HP, logging "dying" when it drops to 0 from above. */
function characterHp(state: SessionState, player: PlayerSlot, hp: number, at: string, entries: LogEntry[]) {
	const next = { ...state, players: state.players.map((p) => (p.seat === player.seat ? { ...p, hp } : p)) };
	const events: EngineEvent[] = entries.map(logged);
	if (hp <= 0 && !isDying(player)) {
		events.push(logged({ at, kind: 'dying', seat: player.seat }), { type: 'characterDying', seat: player.seat });
	}
	return { state: next, events };
}

export function confirmHpChange(state: SessionState, command: ConfirmHpChange, deps: Deps): CommandResult {
	const found = pendingChange(state, command.by, command.id);
	if (!found.ok) return found;
	const amount = command.amount ?? found.change.amount;
	if (!isHp(amount, 0)) return { ok: false, reason: `The damage must be a whole number from 0 to ${MAX_HP}.` };
	const at = deps.now().toISOString();
	const cleared: SessionState = { ...state, hpChanges: found.rest };
	const confirmed: EngineEvent = { type: 'hpChangeConfirmed', id: found.change.id, amount };
	const { target } = found.change;

	if (target.kind === 'monster') {
		const monster = findMonster(state, target.id)!;
		const hp = Math.max(0, monster.hp - amount);
		return {
			ok: true,
			state: withMonster(cleared, monster.id, { hp }),
			events: [confirmed, logged({ at, kind: 'monsterHurt', monster: refOf(monster), condition: conditionOf(hp, monster.maxHp) })]
		};
	}

	const player = state.players.find((p) => p.seat === target.seat)!;
	const hp = Math.max(0, (player.hp ?? player.character!.maxHp) - amount);
	const result = characterHp(cleared, player, hp, at, [{ at, kind: 'characterHurt', seat: player.seat, amount }]);
	return { ok: true, state: result.state, events: [confirmed, ...result.events] };
}

export function dismissHpChange(state: SessionState, command: DismissHpChange): CommandResult {
	const found = pendingChange(state, command.by, command.id);
	if (!found.ok) return found;
	return {
		ok: true,
		state: { ...state, hpChanges: found.rest },
		events: [{ type: 'hpChangeDismissed', id: found.change.id }]
	};
}

export function setCharacterHp(state: SessionState, command: SetCharacterHp, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can set a character’s HP.' };
	const player = state.players.find((p) => p.seat === command.seat);
	if (!player?.character) return { ok: false, reason: 'That player has no character.' };
	const { hp } = command;
	if (!Number.isInteger(hp) || hp < 0 || hp > player.character.maxHp) {
		return { ok: false, reason: `HP must be a whole number from 0 to ${player.character.maxHp}.` };
	}
	const result = characterHp(state, player, hp, deps.now().toISOString(), []);
	return { ok: true, state: result.state, events: [{ type: 'characterHpSet', seat: player.seat }, ...result.events] };
}

function strike(attack: AttackOption[number], ac: number, edge: Edge, deps: Deps): Strike {
	const d20s = edge ? [deps.dice(20), deps.dice(20)] : [deps.dice(20)];
	const d20 = edge === 'advantage' ? Math.max(...d20s) : edge === 'disadvantage' ? Math.min(...d20s) : d20s[0];
	const bonus = attack.bonus ?? 0;
	const total = d20 + bonus;
	const hit = total >= ac;
	const damage =
		hit && attack.damage ? { formula: formatDice(attack.damage), ...rollDice(attack.damage, deps.dice) } : null;
	return { attack: attack.name, d20s, d20, bonus, total, hit, damage, effect: hit ? attack.effect : null };
}

export function monsterAttack(state: SessionState, command: MonsterAttack, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM rolls for monsters.' };
	if (state.crawl?.spotlight.kind !== 'gm') return { ok: false, reason: 'Monsters act in your turn.' };
	const monster = findMonster(state, command.id);
	if (!monster) return { ok: false, reason: 'That monster isn’t on the map.' };
	const option = monster.attacks[command.option];
	if (!option) return { ok: false, reason: 'Pick one of the monster’s attacks.' };
	const player = state.players.find((p) => p.seat === command.seat);
	if (!player?.character) return { ok: false, reason: 'Pick a character to attack.' };
	const { edge } = command;
	if (edge !== null && edge !== 'advantage' && edge !== 'disadvantage') {
		return { ok: false, reason: 'Pick advantage, disadvantage or neither.' };
	}

	const ac = player.character.ac;
	const strikes = option.flatMap((attack) => Array.from({ length: attack.count }, () => strike(attack, ac, edge, deps)));
	const at = deps.now().toISOString();
	const entry: LogEntry = { at, kind: 'monsterAttack', monster: refOf(monster), seat: player.seat, ac, edge, strikes };
	const damage = strikes.reduce((sum, s) => sum + (s.damage?.total ?? 0), 0);
	const suggested = suggestHp(state, { kind: 'player', seat: player.seat }, damage);
	return { ok: true, state: suggested.state, events: [logged(entry), ...suggested.events] };
}
