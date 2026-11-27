/**
 * Movement and reveals: where a token can go through known rooms and exits,
 * the stop at the doorway of an unknown area, and the GM revealing or hiding
 * areas by hand.
 *
 * A plain passage (a corridor segment with no mood text, notes or monsters)
 * isn't a room to reveal: a move into one reveals it, and the plain passages
 * joined to it, on the spot and carries on. The stop comes at the next room
 * or at a passage with something in it.
 *
 * Movement has no distance limit and no line of sight (spec, Out of Scope).
 * Exits are passable whatever their type: the engine doesn't track locks or
 * portcullises, the GM rules on them.
 */
import { cellsOf, inRect, neighbour, type Area, type Cell, type Dungeon, type Exit } from '../dungeon/model.ts';
import type { CommandResult, Deps, Position, SessionState } from './index.ts';
import type { LogEntry } from './turns.ts';
import { occupiedCells } from './monsters.ts';

export type MoveToken = { type: 'moveToken'; by: string; to: Cell; dungeon: Dungeon };
export type SetAreaRevealed = {
	type: 'setAreaRevealed';
	by: string;
	areaId: string;
	revealed: boolean;
	dungeon: Dungeon;
};

/** The way into an unknown area: `doorway` is the known side, `beyond` the first unknown square. */
export type Doorway = { area: string; doorway: Position; beyond: Cell };

/** Moving is part of a player's own action, not of accepting a challenge or rolling damage. */
function canMove(state: SessionState, seat: number): boolean {
	const s = state.crawl?.spotlight;
	return s?.kind === 'player' && s.seat === seat;
}

const key = (c: Cell) => `${c.x},${c.y}`;
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/**
 * Exits a token can pass. A secret exit only counts once both of its areas
 * are revealed: then the GM has ruled it found.
 */
function passable(exit: Exit, revealed: Set<string>): boolean {
	return exit.type !== 'secret' || (revealed.has(exit.from) && revealed.has(exit.to));
}

/** Both squares of an exit, as [square in `from`, square in `to`]. */
function ends(exit: Exit): [Cell, Cell] {
	return [exit.at, neighbour(exit.at, exit.side)];
}

/**
 * The doorways from revealed areas into unrevealed ones, through exits a
 * player can see. Secret exits never show up here.
 */
export function doorways(state: SessionState, dungeon: Dungeon): Doorway[] {
	const revealed = new Set(state.revealed);
	const result: Doorway[] = [];
	for (const exit of dungeon.exits) {
		if (exit.type === 'secret') continue;
		const [a, b] = ends(exit);
		if (revealed.has(exit.from) && !revealed.has(exit.to)) {
			result.push({ area: exit.to, doorway: { area: exit.from, cell: a }, beyond: b });
		} else if (revealed.has(exit.to) && !revealed.has(exit.from)) {
			result.push({ area: exit.from, doorway: { area: exit.to, cell: b }, beyond: a });
		}
	}
	return result;
}

/** A corridor segment with nothing for the GM to describe or rule on. */
export function isPlainPassage(area: Area): boolean {
	return area.kind === 'corridor' && !area.mood && !area.notes && area.monsters.length === 0;
}

/**
 * The unrevealed plain passages a move through `start` opens up: `start` itself
 * and every plain passage joined to it through visible exits, transitively.
 */
function plainPassagesFrom(state: SessionState, dungeon: Dungeon, start: string): string[] {
	const revealed = new Set(state.revealed);
	const plain = new Set(dungeon.areas.filter(isPlainPassage).map((a) => a.id));
	if (!plain.has(start) || revealed.has(start)) return [];
	const found = new Set([start]);
	const queue = [start];
	while (queue.length) {
		const here = queue.shift()!;
		for (const exit of dungeon.exits) {
			if (exit.type === 'secret') continue;
			const other = exit.from === here ? exit.to : exit.to === here ? exit.from : null;
			if (other && plain.has(other) && !revealed.has(other) && !found.has(other)) {
				found.add(other);
				queue.push(other);
			}
		}
	}
	return [...found];
}

/** Every square of a revealed area that `from` connects to, `from` included. */
function reachableFrom(state: SessionState, dungeon: Dungeon, from: Position): Map<string, Position> {
	const revealed = new Set(state.revealed);
	const areas = new Map(dungeon.areas.map((a) => [a.id, a]));

	// Crossings between areas, in both directions, keyed by the square you leave from.
	const crossings = new Map<string, Position[]>();
	const addCrossing = (fromCell: Cell, to: Position) => {
		crossings.set(key(fromCell), [...(crossings.get(key(fromCell)) ?? []), to]);
	};
	for (const exit of dungeon.exits) {
		if (!revealed.has(exit.from) || !revealed.has(exit.to) || !passable(exit, revealed)) continue;
		const [a, b] = ends(exit);
		addCrossing(a, { area: exit.to, cell: b });
		addCrossing(b, { area: exit.from, cell: a });
	}

	const seen = new Map<string, Position>([[key(from.cell), from]]);
	const queue: Position[] = [from];
	while (queue.length) {
		const here = queue.shift()!;
		const rect = areas.get(here.area)!.rect;
		const next: Position[] = [
			...(['n', 'e', 's', 'w'] as const)
				.map((side) => neighbour(here.cell, side))
				.filter((c) => inRect(c, rect))
				.map((cell) => ({ area: here.area, cell })),
			...(crossings.get(key(here.cell)) ?? [])
		];
		for (const p of next) {
			if (seen.has(key(p.cell))) continue;
			seen.set(key(p.cell), p);
			queue.push(p);
		}
	}
	return seen;
}

export type Moves = {
	/** Squares the token can move to. */
	cells: Cell[];
	/** First unknown squares beyond a reachable doorway; moving there stops at the doorway. */
	doorways: Cell[];
};

/** Where the player in `seat` can move right now, or null when it isn't their move. */
export function movesFor(state: SessionState, dungeon: Dungeon, seat: number): Moves | null {
	const player = state.players.find((p) => p.seat === seat);
	if (!player?.position || !canMove(state, seat)) return null;
	const reach = reachableFrom(state, dungeon, player.position);
	const taken = occupied(state, seat);
	return {
		cells: [...reach.values()].map((p) => p.cell).filter((c) => !taken.has(key(c)) && !same(c, player.position!.cell)),
		doorways: doorways(state, dungeon)
			.filter((d) => reach.has(key(d.doorway.cell)))
			.map((d) => d.beyond)
	};
}

/** Squares other tokens and monsters stand on. */
const occupied = (state: SessionState, exceptSeat: number) => occupiedCells(state, { seat: exceptSeat });

export function moveToken(state: SessionState, command: MoveToken, deps: Deps): CommandResult {
	const player = state.players.find((p) => p.secret === command.by);
	if (!player) return { ok: false, reason: 'Only players can move a token.' };
	if (!player.position) return { ok: false, reason: 'Import your character first.' };
	if (!state.crawl) return { ok: false, reason: 'The crawl hasn’t started yet.' };
	if (!canMove(state, player.seat)) return { ok: false, reason: 'You can only move on your turn.' };

	const { dungeon, to } = command;
	let reach = reachableFrom(state, dungeon, player.position);
	let target = reach.get(key(to));
	let stoppedAt: string | null = null;
	let opened: string[] = [];
	if (!target) {
		const door = doorways(state, dungeon).find((d) => same(d.beyond, to) && reach.has(key(d.doorway.cell)));
		if (!door) return { ok: false, reason: 'You can’t get there from here.' };
		opened = plainPassagesFrom(state, dungeon, door.area);
		if (opened.length) {
			// Nothing to reveal in a plain passage: open it up and walk on in.
			state = { ...state, revealed: [...state.revealed, ...opened] };
			reach = reachableFrom(state, dungeon, player.position);
			target = reach.get(key(to))!;
		} else {
			// A move toward an unknown area stops at the doorway in front of it.
			target = door.doorway;
			stoppedAt = door.area;
		}
	}
	if (same(target.cell, player.position.cell)) return { ok: false, reason: 'You’re already there.' };
	if (occupied(state, player.seat).has(key(target.cell))) {
		return { ok: false, reason: 'Something is already standing there.' };
	}

	return {
		ok: true,
		state: {
			...state,
			players: state.players.map((p) => (p.seat === player.seat ? { ...p, position: target } : p))
		},
		events: [
			...opened.map((areaId) => ({ type: 'areaRevealed' as const, areaId })),
			{ type: 'tokenMoved', seat: player.seat, to: target, stoppedAt },
			...(stoppedAt
				? [
						{
							type: 'logged' as const,
							entry: { at: deps.now().toISOString(), kind: 'doorway', seat: player.seat } satisfies LogEntry
						}
					]
				: [])
		]
	};
}

export function setAreaRevealed(state: SessionState, command: SetAreaRevealed, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can reveal or hide areas.' };
	const area = command.dungeon.areas.find((a) => a.id === command.areaId);
	if (!area) return { ok: false, reason: 'That area isn’t in the dungeon.' };
	const isRevealed = state.revealed.includes(area.id);

	if (command.revealed) {
		if (isRevealed) return { ok: false, reason: 'That area is already revealed.' };
		return {
			ok: true,
			state: { ...state, revealed: [...state.revealed, area.id] },
			events: [
				{ type: 'areaRevealed', areaId: area.id },
				{ type: 'logged', entry: { at: deps.now().toISOString(), kind: 'revealed', areaId: area.id } }
			]
		};
	}

	if (!isRevealed) return { ok: false, reason: 'That area is already hidden.' };
	const cells = cellsOf(area.rect);
	if (state.players.some((p) => p.character && p.position && cells.some((c) => same(c, p.position!.cell)))) {
		return { ok: false, reason: 'A token stands in that area. Hide it once the party has left.' };
	}
	return {
		ok: true,
		state: { ...state, revealed: state.revealed.filter((id) => id !== area.id) },
		events: [{ type: 'areaHidden', areaId: area.id }]
	};
}
