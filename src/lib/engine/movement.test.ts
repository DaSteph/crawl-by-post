import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type Deps, type SessionState } from './index.ts';
import { mapView } from './map.ts';

// Example dungeon (dungeons/example.yaml): r1 is the start room at x0-4 y0-3.
// r1 --open [4,1]→[5,1]--> c1 (x5-9, y1) --door [9,1]→[10,1]--> r2
// r1 --door [2,3]→[2,4]--> c2 (x2, y4-7) — c3 (x3-6, y7) --locked--> r3 --secret--> r4
const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');
const character = { ...imported.character, abilities: { ...imported.character.abilities, DEX: { score: 10, modifier: 0 } } };

function dice(...results: number[]): Deps {
	const queue = [...results];
	return {
		dice: (sides) => {
			const next = queue.shift();
			if (next === undefined) throw new Error(`unexpected d${sides} roll`);
			return next;
		},
		now: () => new Date('2026-11-27T12:00:00Z')
	};
}

function run(state: SessionState | null, command: Command, deps: Deps = dice()) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

function reject(state: SessionState, command: Command) {
	const result = applyCommand(state, command, dice());
	if (result.ok) throw new Error('expected a rejection');
	return result.reason;
}

/** Two players in r1 at [0,0] and [1,0]; player 1 has the spotlight. */
function crawling() {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	for (const seat of [1, 2]) {
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: `p${seat}` }).state;
		state = run(state, { type: 'importCharacter', by: `p${seat}`, character, dungeon }).state;
	}
	return run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(15, 10)).state;
}

const move = (by: string, x: number, y: number): Command => ({ type: 'moveToken', by, to: { x, y }, dungeon });
const reveal = (areaId: string, revealed = true): Command => ({
	type: 'setAreaRevealed',
	by: 'gm',
	areaId,
	revealed,
	dungeon
});
const tokenOf = (state: SessionState, seat: number) => mapView(state, dungeon, 'player').tokens.find((t) => t.seat === seat);

/** Hands the spotlight back to player 1 after their action. */
function backToPlayer1(state: SessionState) {
	state = run(state, { type: 'postAction', by: 'p1', text: 'I go on.' }).state;
	state = run(state, { type: 'passSpotlight', by: 'gm' }).state;
	state = run(state, { type: 'postAction', by: 'p2', text: 'I wait.' }).state;
	return run(state, { type: 'passSpotlight', by: 'gm' }).state;
}

describe('moving a token', () => {
	it('moves the spotlight token with one command to any square of a known room', () => {
		const { state, events } = run(crawling(), move('p1', 3, 2));

		expect(tokenOf(state, 1)).toMatchObject({ area: 'r1', cell: { x: 3, y: 2 } });
		expect(events).toEqual([{ type: 'tokenMoved', seat: 1, to: { area: 'r1', cell: { x: 3, y: 2 } }, stoppedAt: null }]);
	});

	it('doesn’t pass the spotlight, so the player can still post their action', () => {
		const { state } = run(crawling(), move('p1', 3, 2));

		expect(state.crawl!.spotlight).toEqual({ kind: 'player', seat: 1 });
		expect(applyCommand(state, { type: 'postAction', by: 'p1', text: 'I look around.' }, dice()).ok).toBe(true);
	});

	it('rejects moves out of turn, by the GM and before the crawl starts', () => {
		const state = crawling();

		expect(reject(state, move('p2', 3, 2))).toMatch(/your turn/);
		expect(reject(state, move('gm', 3, 2))).toMatch(/Only players/);
		const { crawl: _, ...noCrawl } = state;
		expect(reject(noCrawl, move('p1', 3, 2))).toMatch(/hasn’t started/);
	});

	it('rejects a square someone else stands on, and the square you are on', () => {
		expect(reject(crawling(), move('p1', 1, 0))).toMatch(/already standing/);
		expect(reject(crawling(), move('p1', 0, 0))).toMatch(/already there/);
	});

	it('stops at the doorway when moving toward an unknown area', () => {
		const { state, events } = run(crawling(), move('p1', 5, 1));

		expect(tokenOf(state, 1)).toMatchObject({ area: 'r1', cell: { x: 4, y: 1 } });
		expect(events).toEqual([
			{ type: 'tokenMoved', seat: 1, to: { area: 'r1', cell: { x: 4, y: 1 } }, stoppedAt: 'c1' },
			{ type: 'logged', entry: { at: '2026-11-27T12:00:00.000Z', kind: 'doorway', seat: 1 } }
		]);
	});

	it('doesn’t let a player probe squares deeper inside an unknown area', () => {
		expect(reject(crawling(), move('p1', 7, 1))).toMatch(/can’t get there/);
		expect(reject(crawling(), move('p1', 12, 2))).toMatch(/can’t get there/);
	});

	it('moves on through revealed areas, and stops again at the next unknown doorway', () => {
		let state = run(crawling(), reveal('c1')).state;
		state = run(state, move('p1', 9, 1)).state;
		expect(tokenOf(state, 1)).toMatchObject({ area: 'c1', cell: { x: 9, y: 1 } });

		state = run(state, reveal('c2')).state;
		state = run(state, move('p1', 2, 7)).state;
		expect(tokenOf(state, 1)).toMatchObject({ area: 'c2', cell: { x: 2, y: 7 } });

		// c3 joins c2 openly (corridor segments touching end to end); beyond it, r3 is unknown.
		state = run(state, reveal('c3')).state;
		const { state: stopped, events } = run(state, move('p1', 7, 7));
		expect(tokenOf(stopped, 1)).toMatchObject({ area: 'c3', cell: { x: 6, y: 7 } });
		expect(events[0]).toMatchObject({ stoppedAt: 'r3' });
	});

	it('only passes a secret door once the GM has revealed both sides', () => {
		let state = crawling();
		for (const id of ['c2', 'c3', 'r3']) state = run(state, reveal(id)).state;
		state = run(state, move('p1', 10, 7)).state;

		// r4 is hidden behind the secret door: no doorway, no way through.
		expect(reject(backToPlayer1(state), move('p1', 11, 7))).toMatch(/can’t get there/);
		expect(mapView(state, dungeon, 'player').unknown).not.toContainEqual(expect.objectContaining({ at: { x: 11, y: 7 } }));

		state = run(backToPlayer1(state), reveal('r4')).state;
		expect(mapView(state, dungeon, 'player').exits.some((e) => e.type === 'secret')).toBe(true);
		state = run(state, move('p1', 12, 7)).state;
		expect(tokenOf(state, 1)).toMatchObject({ area: 'r4', cell: { x: 12, y: 7 } });
	});
});

describe('where a player can move', () => {
	it('lists the reachable squares and unknown doorways for the spotlight player only', () => {
		const state = crawling();
		const moves = mapView(state, dungeon, 'player', 1).moves!;

		// r1 has 20 squares; the player's own and player 2's are left out.
		expect(moves.cells).toHaveLength(18);
		expect(moves.cells).not.toContainEqual({ x: 1, y: 0 });
		expect(moves.doorways).toEqual([
			{ x: 5, y: 1 },
			{ x: 2, y: 4 }
		]);
		expect(mapView(state, dungeon, 'player', 2).moves).toBeNull();
		expect(mapView(state, dungeon, 'gm').moves).toBeNull();
	});

	it('marks unknown areas behind doorways with a "?" and tells only the GM which area it is', () => {
		const state = crawling();

		expect(mapView(state, dungeon, 'player').unknown).toEqual([
			{ at: { x: 5, y: 1 }, doorway: { x: 4, y: 1 }, area: null },
			{ at: { x: 2, y: 4 }, doorway: { x: 2, y: 3 }, area: null }
		]);
		expect(mapView(state, dungeon, 'gm').unknown.map((u) => u.area)).toEqual(['c1', 'c2']);
	});
});

describe('revealing and hiding areas', () => {
	it('lets the GM reveal an area, which logs it and draws it for everyone', () => {
		const { state, events } = run(crawling(), reveal('c1'));

		expect(events).toEqual([
			{ type: 'areaRevealed', areaId: 'c1' },
			{ type: 'logged', entry: { at: '2026-11-27T12:00:00.000Z', kind: 'revealed', areaId: 'c1' } }
		]);
		expect(mapView(state, dungeon, 'player').areas.map((a) => a.id)).toEqual(['r1', 'c1']);
	});

	it('keeps revealed areas revealed as the game goes on', () => {
		let state = run(crawling(), reveal('c1')).state;
		state = run(state, move('p1', 9, 1)).state;
		state = backToPlayer1(state);
		state = run(state, move('p1', 2, 2)).state;

		expect(mapView(state, dungeon, 'player').areas.map((a) => a.id)).toEqual(['r1', 'c1']);
	});

	it('lets the GM hide an area by hand and reveal it again', () => {
		let state = run(crawling(), reveal('c1')).state;
		const hidden = run(state, reveal('c1', false));

		expect(hidden.events).toEqual([{ type: 'areaHidden', areaId: 'c1' }]);
		expect(mapView(hidden.state, dungeon, 'player').areas.map((a) => a.id)).toEqual(['r1']);
		state = run(hidden.state, reveal('c1')).state;
		expect(mapView(state, dungeon, 'player').areas.map((a) => a.id)).toEqual(['r1', 'c1']);
	});

	it('won’t hide an area a token stands in', () => {
		expect(reject(crawling(), reveal('r1', false))).toMatch(/token stands/);
	});

	it('rejects players, unknown areas and reveals that change nothing', () => {
		const state = crawling();

		expect(reject(state, { ...reveal('c1'), by: 'p1' } as Command)).toMatch(/Only the GM/);
		expect(reject(state, reveal('nope'))).toMatch(/isn’t in the dungeon/);
		expect(reject(state, reveal('r1'))).toMatch(/already revealed/);
		expect(reject(state, reveal('c1', false))).toMatch(/already hidden/);
	});

	it('lets the GM reveal or hide outside their turn', () => {
		const state = crawling();
		expect(state.crawl!.spotlight.kind).toBe('player');

		expect(applyCommand(state, reveal('c1'), dice()).ok).toBe(true);
	});
});
