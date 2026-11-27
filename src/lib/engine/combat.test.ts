import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import { mapView } from './map.ts';
import type { LogEntry } from './turns.ts';

// Example dungeon (dungeons/example.yaml): r1 is the start room; the goblins of r2 have DEX +1.
const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

// The fixture character has DEX 18 (+4).
const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');
const character = imported.character;

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

const at = '2026-11-27T12:00:00.000Z';

function run(state: SessionState | null, command: Command, deps: Deps = dice()) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

function reject(state: SessionState, command: Command, deps: Deps = dice()) {
	const result = applyCommand(state, command, deps);
	if (result.ok) throw new Error('expected a rejection');
	return result.reason;
}

const entries = (events: EngineEvent[]): LogEntry[] => events.flatMap((e) => (e.type === 'logged' ? [e.entry] : []));
const types = (events: EngineEvent[]) => events.map((e) => e.type);

const action = (by: string, text = 'I swing.'): Command => ({ type: 'postAction', by, text });
const pass: Command = { type: 'passSpotlight', by: 'gm' };
const startCombat: Command = { type: 'startCombat', by: 'gm' };
const endCombat = (danger: 'unsafe' | 'risky' | 'deadly' = 'risky', by = 'gm'): Command => ({ type: 'endCombat', by, danger });

/** Two players in a risky crawl (player 1 won initiative), in the GM's turn after player 1 acted. */
function gmTurn() {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	for (const seat of [1, 2]) {
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: `p${seat}` }).state;
		state = run(state, { type: 'importCharacter', by: `p${seat}`, character, dungeon }).state;
	}
	state = run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(15, 10)).state;
	return run(state, action('p1')).state;
}

/** In combat, player 1 first (characters 16 and 12, monsters 10). */
function fighting(state = gmTurn()) {
	return run(state, startCombat, dice(12, 8, 10)).state;
}

/** Plays a whole combat round from player 1's turn; returns the events of the GM's pass that ends it. */
function playRound(state: SessionState, outIn: number[] = []) {
	state = run(state, action('p1')).state;
	state = run(state, pass).state;
	state = run(state, action('p2')).state;
	return run(state, pass, dice(...outIn));
}

/** Player 1 carries a torch at `counter`. */
function withTorch(state: SessionState, counter: number) {
	state = run(state, { type: 'lightTorch', by: 'p1' }, dice(10)).state;
	return run(state, { type: 'setLightCounter', by: 'gm', id: 1, counter }).state;
}

const gmLight = (state: SessionState) => mapView(state, dungeon, 'gm').lights[0];
const playerLight = (state: SessionState) => mapView(state, dungeon, 'player', 2).lights[0];

describe('starting combat', () => {
	it('rolls initiative for every character and once for the monsters, locked in the log', () => {
		const { state, events } = run(gmTurn(), startCombat, dice(5, 14, 3));

		expect(entries(events)).toEqual([
			{ at, kind: 'combatStarted' },
			{
				at,
				kind: 'initiative',
				rolls: [
					{ seat: 1, d20: 5, modifier: 4, total: 9 },
					{ seat: 2, d20: 14, modifier: 4, total: 18 }
				],
				rollOffs: [],
				winner: 2,
				monsters: { d20: 3, modifier: 0, total: 3 }
			}
		]);
		expect(state.crawl).toMatchObject({ combat: true, round: 1, order: [2, 1], spotlight: { kind: 'player', seat: 2 } });
		expect(events).toContainEqual({ type: 'spotlightChanged', spotlight: { kind: 'player', seat: 2 } });
	});

	it('gives the monsters the best DEX modifier among the monsters on the map', () => {
		let state = run(gmTurn(), { type: 'placeMonster', by: 'gm', areaId: 'r2', index: 0, dungeon }, dice(4)).state;
		const { events } = run(state, startCombat, dice(12, 8, 10));

		const initiative = entries(events).find((e) => e.kind === 'initiative');
		expect(initiative).toMatchObject({ monsters: { d20: 10, modifier: 1, total: 11 } });
	});

	it('opens with the GM’s turn when the monsters beat every character', () => {
		const { state, events } = run(gmTurn(), startCombat, dice(12, 8, 17));

		expect(entries(events).find((e) => e.kind === 'initiative')).toMatchObject({ gmFirst: true, winner: 1 });
		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 2, opening: true });
	});

	it('lets the characters win a tie with the monsters', () => {
		const { state, events } = run(gmTurn(), startCombat, dice(12, 8, 16));

		expect(entries(events).find((e) => e.kind === 'initiative')).not.toHaveProperty('gmFirst');
		expect(state.crawl!.spotlight).toEqual({ kind: 'player', seat: 1 });
	});

	it('only works for the GM, in the GM’s turn, during a crawl, and not twice', () => {
		expect(reject(gmTurn(), { type: 'startCombat', by: 'p1' })).toMatch(/Only the GM/);
		const playersTurn = run(gmTurn(), pass).state;
		expect(reject(playersTurn, startCombat)).toMatch(/in your turn/);
		const noCrawl = { ...gmTurn(), crawl: undefined };
		expect(reject(noCrawl, startCombat)).toMatch(/Start a crawl first/);
		const inCombat = run(fighting(), action('p1')).state;
		expect(reject(inCombat, startCombat)).toMatch(/on already/);
	});
});

describe('the GM turn that opens a fight', () => {
	const opened = () => run(gmTurn(), startCombat, dice(12, 8, 17)).state;

	it('hands on to the first player without completing a round', () => {
		const { state, events } = run(opened(), pass);

		expect(state.crawl).toMatchObject({ round: 1, spotlight: { kind: 'player', seat: 1 } });
		expect(types(events)).not.toContain('roundCompleted');
		expect(entries(events).map((e) => e.kind)).toEqual(['pass']);
	});

	it('counts the first round once every player has had a turn', () => {
		const state = run(opened(), pass).state;
		const { events } = playRound(state);

		expect(events).toContainEqual({ type: 'roundCompleted', round: 1 });
	});

	it('takes no challenge, since nobody has acted yet', () => {
		const reason = reject(opened(), {
			type: 'setChallenge',
			by: 'gm',
			check: { type: 'test', ability: 'DEX' },
			dc: 12,
			edge: null,
			stakes: ''
		});
		expect(reason).toMatch(/Nobody has acted yet/);
	});
});

describe('light in combat', () => {
	it('ticks once per round, not per player action', () => {
		let state = fighting(withTorch(gmTurn(), 5));
		state = run(state, action('p1')).state;
		expect(gmLight(state).counter).toBe(5);
		state = run(state, pass).state;
		state = run(state, action('p2')).state;
		expect(gmLight(state).counter).toBe(5);

		const { state: next, events } = run(state, pass);
		expect(events).toContainEqual({ type: 'roundCompleted', round: 1 });
		expect(gmLight(next).counter).toBe(4);
	});

	it('detects a counter that runs out on the GM’s turn, and puts the light out on a random later player turn', () => {
		const state = fighting(withTorch(gmTurn(), 1));
		// The round ends on the GM's pass; a d2 (two players) picks the second player turn from here.
		const { state: ranOut, events } = playRound(state, [2]);

		expect(events).toContainEqual({ type: 'lightRanOut', seat: 1, id: 1, outIn: 2 });
		expect(types(events)).not.toContain('torchExtinguished');
		expect(entries(events).map((e) => e.kind)).not.toContain('torchOut');
		// Player 1's turn has started: one more player turn to go.
		expect(gmLight(ranOut)).toMatchObject({ counter: 0, outIn: 1 });
		// Players see nothing but a guttering flame.
		expect(playerLight(ranOut)).toMatchObject({ level: 'guttering', counter: null, outIn: null });

		const acted = run(ranOut, action('p1'));
		expect(types(acted.events)).not.toContain('torchExtinguished');

		const { state: dark, events: out } = run(acted.state, pass);
		expect(out).toContainEqual({ type: 'spotlightChanged', spotlight: { kind: 'player', seat: 2 } });
		expect(entries(out)).toContainEqual({ at, kind: 'torchOut', seat: 1 });
		expect(out).toContainEqual({ type: 'torchExtinguished', seat: 1, id: 1 });
		expect(mapView(dark, dungeon, 'gm').lights).toEqual([]);
	});

	it('can put the light out on the very next player turn', () => {
		const { state, events } = playRound(fighting(withTorch(gmTurn(), 1)), [1]);

		expect(events).toContainEqual({ type: 'lightRanOut', seat: 1, id: 1, outIn: 1 });
		expect(entries(events)).toContainEqual({ at, kind: 'torchOut', seat: 1 });
		expect(mapView(state, dungeon, 'gm').lights).toEqual([]);
	});

	it('lets the GM call it off with a new counter', () => {
		let state = playRound(fighting(withTorch(gmTurn(), 1)), [2]).state;
		state = run(state, { type: 'setLightCounter', by: 'gm', id: 1, counter: 6 }).state;
		expect(gmLight(state)).toMatchObject({ counter: 6, outIn: null });

		state = run(state, action('p1')).state;
		const { state: next, events } = run(state, pass);
		expect(types(events)).not.toContain('torchExtinguished');
		expect(gmLight(next).counter).toBe(6);
	});

	it('still puts a light that ran out out after the fight ends', () => {
		let state = playRound(fighting(withTorch(gmTurn(), 1)), [2]).state;
		state = run(state, action('p1')).state;
		const { events } = run(state, endCombat(), dice(15, 10));

		expect(entries(events)).toContainEqual({ at, kind: 'torchOut', seat: 1 });
	});

	it('ticks per player action again once the fight is over', () => {
		let state = run(fighting(withTorch(gmTurn(), 5)), action('p1')).state;
		state = run(state, endCombat(), dice(15, 10)).state;
		state = run(state, action('p1')).state;
		expect(gmLight(state).counter).toBe(4);
	});
});

describe('wandering monster checks in combat', () => {
	it('pause: completed rounds bring no check', () => {
		let state = fighting();
		const events: EngineEvent[] = [];
		for (let i = 0; i < 2; i++) {
			const round = playRound(state);
			events.push(...round.events);
			state = round.state;
		}
		expect(events.filter((e) => e.type === 'roundCompleted')).toHaveLength(2);
		expect(types(events)).not.toContain('wanderingCheckDue');
	});

	it('drop a check that was waiting when the fight starts', () => {
		// Risky: due after round 2.
		let state = gmTurn();
		state = run(state, pass).state;
		state = run(state, action('p2')).state;
		state = run(state, pass).state;
		state = playRound(state).state;
		expect(state.crawl!.wanderingCheck).toBe('due');

		state = fighting(run(state, action('p1')).state);
		expect(state.crawl!.wanderingCheck).toBeUndefined();
		expect(reject(state, { type: 'postponeWanderingCheck', by: 'gm' })).toMatch(/No wandering monster check/);
	});
});

describe('ending combat', () => {
	it('starts a new crawl with fresh initiative and the danger level the GM picks', () => {
		const state = run(fighting(), action('p1')).state;
		const { state: next, events } = run(state, endCombat('deadly'), dice(3, 19));

		expect(entries(events)).toEqual([
			{ at, kind: 'combatEnded' },
			{ at, kind: 'crawlStarted', danger: 'deadly' },
			{
				at,
				kind: 'initiative',
				rolls: [
					{ seat: 1, d20: 3, modifier: 4, total: 7 },
					{ seat: 2, d20: 19, modifier: 4, total: 23 }
				],
				rollOffs: [],
				winner: 2
			}
		]);
		expect(next.crawl).toEqual({ danger: 'deadly', order: [2, 1], round: 1, spotlight: { kind: 'player', seat: 2 } });
	});

	it('brings wandering monster checks back', () => {
		let state = run(run(fighting(), action('p1')).state, endCombat('deadly'), dice(15, 10)).state;
		const { events } = playRound(state);
		expect(events).toContainEqual({ type: 'wanderingCheckDue', round: 1 });
	});

	it('only works for the GM, in the GM’s turn, during a fight', () => {
		const inCombat = run(fighting(), action('p1')).state;
		expect(reject(inCombat, endCombat('risky', 'p1'))).toMatch(/Only the GM/);
		expect(reject(fighting(), endCombat())).toMatch(/in your turn/);
		expect(reject(gmTurn(), endCombat())).toMatch(/no fight to end/);
		expect(reject(inCombat, { type: 'endCombat', by: 'gm', danger: 'mild' as never })).toMatch(/danger level/);
	});

	it('is the only way back to a crawl', () => {
		const inCombat = run(fighting(), action('p1')).state;
		expect(reject(inCombat, { type: 'startCrawl', by: 'gm', danger: 'risky' })).toMatch(/End the combat first/);
	});
});
