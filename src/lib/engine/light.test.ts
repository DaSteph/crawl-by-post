import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import { mapView } from './map.ts';
import { darknessPresets, flameLevel, inDarkness, isLit } from './light.ts';
import type { LogEntry } from './turns.ts';

// Example dungeon (dungeons/example.yaml): r1 is the start room (x0-4, y0-3);
// an open archway at [4,1] leads east into corridor c1 (x5-9, y1).
const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

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

/** Two players in r1, player 1 holding the spotlight. */
function crawling() {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	for (const seat of [1, 2]) {
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: `p${seat}` }).state;
		state = run(state, { type: 'importCharacter', by: `p${seat}`, character, dungeon }).state;
	}
	return run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(15, 10)).state;
}

/** The crawl with player 1 carrying a torch at `counter`. */
function torchAt(counter: number, state = crawling()) {
	state = run(state, { type: 'lightTorch', by: 'p1' }, dice(10)).state;
	return run(state, { type: 'setLightCounter', by: 'gm', id: 1, counter }).state;
}

const counterOf = (state: SessionState, seat = 1) => state.players.find((p) => p.seat === seat)!.lights?.[0]?.counter;
const action = (by: string, text = 'I search.'): Command => ({ type: 'postAction', by, text });
const pass: Command = { type: 'passSpotlight', by: 'gm' };
const reveal = (areaId: string): Command => ({ type: 'setAreaRevealed', by: 'gm', areaId, revealed: true, dungeon });
const areaLight = (areaId: string, light: 'lit' | 'dark' | null, by = 'gm'): Command => ({
	type: 'setAreaLight',
	by,
	areaId,
	light,
	dungeon
});

describe('lighting a torch', () => {
	it('takes one command and gets a secret counter of 1d20 + 10', () => {
		const { state, events } = run(crawling(), { type: 'lightTorch', by: 'p2' }, dice(7));

		expect(counterOf(state, 2)).toBe(17);
		expect(events).toEqual([
			{ type: 'logged', entry: { at, kind: 'torchLit', seat: 2 } },
			{ type: 'lightLit', seat: 2, id: 1 }
		]);
	});

	it('works out of turn and doesn’t move the spotlight', () => {
		const { state } = run(crawling(), { type: 'lightTorch', by: 'p2' }, dice(1));

		expect(state.crawl!.spotlight).toEqual({ kind: 'player', seat: 1 });
	});

	it('is for players with a character, one burning light at a time', () => {
		const state = run(crawling(), { type: 'lightTorch', by: 'p1' }, dice(5)).state;

		expect(reject(state, { type: 'lightTorch', by: 'p1' }, dice(5))).toMatch(/already carry/);
		expect(reject(state, { type: 'lightTorch', by: 'gm' }, dice(5))).toMatch(/Only players/);
		const empty = run(state, { type: 'addPlayerSlot', by: 'gm', secret: 'p3' }).state;
		expect(reject(empty, { type: 'lightTorch', by: 'p3' }, dice(5))).toMatch(/Import your character/);
	});
});

describe('torch ticks', () => {
	it('tick once per completed player action', () => {
		let state = torchAt(20);
		state = run(state, action('p1')).state;
		expect(counterOf(state)).toBe(19);
		state = run(state, pass).state;
		state = run(state, action('p2')).state;
		expect(counterOf(state)).toBe(18);
	});

	it('don’t tick for GM responses, GM passes, chat or the GM’s turn running out', () => {
		let state = run(torchAt(20), action('p1')).state;
		state = run(state, { type: 'postAction', by: 'gm', text: 'Dust, nothing else.' }).state;
		state = run(state, { type: 'postChat', by: 'p2', text: 'Careful!' }).state;
		state = run(state, action('p2')).state;
		state = run(state, pass).state;
		state = run(state, action('p1')).state;
		const clock = state.turnClock!.id;
		state = run(state, { type: 'turnTimerFired', clock, kind: 'timeout' }).state;

		expect(state.crawl!.spotlight).toEqual({ kind: 'player', seat: 2 });
		expect(counterOf(state)).toBe(17);
	});

	it('don’t tick for a separate accept turn or the damage roll after it', () => {
		let state = run(torchAt(20), action('p1', 'I shoot the rat.')).state;
		state = run(state, {
			type: 'setChallenge',
			by: 'gm',
			check: { type: 'attack', weapon: 0 },
			dc: 9,
			edge: null,
			stakes: ''
		}).state;
		state = run(state, { type: 'acceptChallenge', by: 'p1' }, dice(20)).state;
		expect(state.crawl!.spotlight.kind).toBe('damage');
		state = run(state, { type: 'rollDamage', by: 'p1' }, dice(1, 1, 1, 1)).state;

		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
		expect(counterOf(state)).toBe(19);
	});

	it('tick for a skipped turn and a turn the GM played, but not for a skipped challenge', () => {
		let state = torchAt(20);
		const timeOut = (s: SessionState) => run(s, { type: 'turnTimerFired', clock: s.turnClock!.id, kind: 'timeout' }).state;

		state = run(timeOut(state), { type: 'resolveTimeout', by: 'gm', resolution: 'skip' }).state;
		expect(counterOf(state)).toBe(19);

		state = run(state, pass).state;
		state = run(timeOut(state), { type: 'resolveTimeout', by: 'gm', resolution: 'playAs', text: 'Keeps watch.' }).state;
		expect(counterOf(state)).toBe(18);

		state = run(state, {
			type: 'setChallenge',
			by: 'gm',
			check: { type: 'test', ability: 'WIS' },
			dc: 12,
			edge: null,
			stakes: ''
		}).state;
		state = run(timeOut(state), { type: 'resolveTimeout', by: 'gm', resolution: 'skip' }).state;
		expect(counterOf(state)).toBe(18);
	});

	it('burn every light source at the table, whoever acts', () => {
		let state = torchAt(20);
		state = run(state, { type: 'lightTorch', by: 'p2' }, dice(5)).state;
		state = run(state, action('p1')).state;

		expect([counterOf(state, 1), counterOf(state, 2)]).toEqual([19, 14]);
	});
});

describe('flame levels', () => {
	it('are bright above 10, flickering down to 4 and guttering below', () => {
		expect([30, 11, 10, 4, 3, 1].map(flameLevel)).toEqual([
			'bright',
			'bright',
			'flickering',
			'flickering',
			'guttering',
			'guttering'
		]);
	});

	it('emit a change when a tick crosses a level', () => {
		const { events } = run(torchAt(11), action('p1'));

		expect(events).toContainEqual({ type: 'torchLevelChanged', seat: 1, id: 1, level: 'flickering' });
	});

	it('change at 1 left, and the torch goes out after the next player action with a log entry', () => {
		let state = torchAt(4);
		let result = run(state, action('p1'));
		expect(result.events).toContainEqual({ type: 'torchLevelChanged', seat: 1, id: 1, level: 'guttering' });
		state = run(result.state, pass).state;
		state = run(state, action('p2')).state;
		expect(counterOf(state)).toBe(2);
		state = run(state, pass).state;
		result = run(state, action('p1'));
		expect(counterOf(result.state)).toBe(1);
		expect(result.events.some((e) => e.type === 'torchExtinguished')).toBe(false);

		state = run(result.state, pass).state;
		result = run(state, action('p2'));

		expect(result.state.players[0].lights).toEqual([]);
		expect(entries(result.events)).toContainEqual({ at, kind: 'torchOut', seat: 1 });
		expect(result.events).toContainEqual({ type: 'torchExtinguished', seat: 1, id: 1 });
	});
});

describe('the GM and the counters', () => {
	it('sees exact counters, while players only see the flame level', () => {
		const state = torchAt(9);

		expect(mapView(state, dungeon, 'gm').lights).toEqual([{ id: 1, seat: 1, kind: 'torch', level: 'flickering', counter: 9 }]);
		expect(mapView(state, dungeon, 'player', 2).lights).toEqual([
			{ id: 1, seat: 1, kind: 'torch', level: 'flickering', counter: null }
		]);
	});

	it('can edit a counter, quietly, and put a light out by setting 0', () => {
		let state = torchAt(15);
		const edit = run(state, { type: 'setLightCounter', by: 'gm', id: 1, counter: 3 });
		expect(counterOf(edit.state)).toBe(3);
		expect(entries(edit.events)).toEqual([]);
		expect(edit.events).toContainEqual({ type: 'torchLevelChanged', seat: 1, id: 1, level: 'guttering' });

		const out = run(edit.state, { type: 'setLightCounter', by: 'gm', id: 1, counter: 0 });
		state = out.state;
		expect(state.players[0].lights).toEqual([]);
		expect(entries(out.events)).toEqual([{ at, kind: 'torchOut', seat: 1 }]);
	});

	it('is the only one who can, within 0 to 99', () => {
		const state = torchAt(15);

		expect(reject(state, { type: 'setLightCounter', by: 'p1', id: 1, counter: 30 })).toMatch(/Only the GM/);
		expect(reject(state, { type: 'setLightCounter', by: 'gm', id: 1, counter: 100 })).toMatch(/0 to 99/);
		expect(reject(state, { type: 'setLightCounter', by: 'gm', id: 1, counter: 2.5 })).toMatch(/0 to 99/);
		expect(reject(state, { type: 'setLightCounter', by: 'gm', id: 7, counter: 5 })).toMatch(/gone out/);
	});
});

describe('light per area', () => {
	it('lights the carrier’s area and leaves every other area dark', () => {
		const state = torchAt(20);

		expect(isLit(state, 'r1')).toBe(true);
		expect(isLit(state, 'c1')).toBe(false);
		expect(inDarkness(state, 2)).toBe(false);
		const view = mapView(state, dungeon, 'player', 1);
		expect(view.areas.find((a) => a.id === 'r1')).toMatchObject({ lit: true, lightOverride: null });
		expect(view.tokens.find((t) => t.seat === 1)).toMatchObject({ carriesLight: true, dark: false });
		expect(view.tokens.find((t) => t.seat === 2)).toMatchObject({ carriesLight: false, dark: false });
	});

	it('leaves everyone in the dark without a light source', () => {
		const state = crawling();

		expect(isLit(state, 'r1')).toBe(false);
		expect(inDarkness(state, 1)).toBe(true);
		expect(mapView(state, dungeon, 'player', 1).areas.find((a) => a.id === 'r1')!.lit).toBe(false);
	});

	it('moves with the character carrying the light', () => {
		let state = run(torchAt(20), reveal('c1')).state;
		state = run(state, { type: 'moveToken', by: 'p1', to: { x: 6, y: 1 }, dungeon }).state;

		expect(isLit(state, 'c1')).toBe(true);
		expect(isLit(state, 'r1')).toBe(false);
		expect(inDarkness(state, 2)).toBe(true);
	});

	it('follows the GM’s override until the GM removes it', () => {
		let state = torchAt(20);
		const dark = run(state, areaLight('r1', 'dark'));
		expect(dark.events).toEqual([{ type: 'areaLightSet', areaId: 'r1', light: 'dark' }]);
		state = dark.state;
		expect(isLit(state, 'r1')).toBe(false);
		state = run(state, areaLight('c1', 'lit')).state;
		expect(isLit(state, 'c1')).toBe(true);
		expect(mapView(state, dungeon, 'gm').areas.find((a) => a.id === 'c1')!.lightOverride).toBe('lit');
		expect(mapView(state, dungeon, 'player', 1).areas.find((a) => a.id === 'r1')!.lightOverride).toBeNull();

		state = run(state, areaLight('r1', null)).state;
		expect(isLit(state, 'r1')).toBe(true);
		expect(state.areaLight).toEqual({ c1: 'lit' });
	});

	it('only lets the GM override, and only for areas of the dungeon', () => {
		const state = crawling();

		expect(reject(state, areaLight('r1', 'lit', 'p1'))).toMatch(/Only the GM/);
		expect(reject(state, areaLight('nowhere', 'lit'))).toBe('No such area.');
	});
});

describe('darkness presets', () => {
	it('preset disadvantage for a character in darkness and advantage for monsters attacking them', () => {
		expect(darknessPresets(true)).toEqual({ challenge: 'disadvantage', monsterAttack: 'advantage' });
		expect(darknessPresets(false)).toEqual({ challenge: null, monsterAttack: null });
	});
});
