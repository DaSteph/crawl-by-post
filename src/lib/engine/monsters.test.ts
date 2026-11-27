import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import type { Character } from '../character/model.ts';
import { applyCommand, sheets, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import { mapView } from './map.ts';
import type { SetChallenge } from './challenges.ts';
import type { LogEntry } from './turns.ts';

// Example dungeon (dungeons/example.yaml): r1 is the start room at x0-4 y0-3.
// r2 (x10-13, y0-3) lists goblins (label G, AC 11, HP 1d6); r3 (x7-10, y5-9) lists
// skeletons (label S, level 2, AC 13, no HP given, so 2d8 + CON).
const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');

/** AC 12, 10 HP, DEX +0 and a longsword (+3, 1d8+1). */
const hero: Character = {
	...imported.character,
	name: 'Hero',
	ac: 12,
	maxHp: 10,
	abilities: { ...imported.character.abilities, DEX: { score: 10, modifier: 0 } },
	weapons: [
		{ name: 'Longsword', attackBonus: 3, range: null, damage: { count: 1, sides: 8, modifier: 1 }, properties: [] }
	]
};

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

/** One player in the crawl, holding the spotlight. */
function crawling() {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: 'p1' }).state;
	state = run(state, { type: 'importCharacter', by: 'p1', character: hero, dungeon }).state;
	return run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(10)).state;
}

const place = (areaId: string, index = 0): Command => ({ type: 'placeMonster', by: 'gm', areaId, index, dungeon });

/** The crawl with goblin G1 (HP `hp`) placed in r2, and the GM's turn after the player's action. */
function goblinFight(hp = 5, preConsent = false) {
	let state = run(crawling(), place('r2'), dice(hp)).state;
	state = run(state, { type: 'setAreaRevealed', by: 'gm', areaId: 'r2', revealed: true, dungeon }).state;
	return run(state, { type: 'postAction', by: 'p1', text: 'I charge the goblin.', preConsent }).state;
}

const attackG1 = (overrides: Partial<SetChallenge> = {}): SetChallenge => ({
	type: 'setChallenge',
	by: 'gm',
	check: { type: 'attack', weapon: 0, target: 'G1' },
	dc: 12,
	edge: null,
	stakes: '',
	...overrides
});

const gmMonster = (state: SessionState, id: string) => mapView(state, dungeon, 'gm').monsters.find((m) => m.id === id);
const playerMonster = (state: SessionState, id: string) =>
	mapView(state, dungeon, 'player', 1).monsters.find((m) => m.id === id);
const hpOf = (state: SessionState) => sheets(state, 'p1')[0].hp;
const pending = (events: EngineEvent[]) => events.flatMap((e) => (e.type === 'hpChangeSuggested' ? [e.change] : []));

describe('placing monsters', () => {
	it('rolls HP once from the file’s formula and labels tokens G1, G2, …', () => {
		let state = crawling();
		state = run(state, place('r2'), dice(4)).state;
		state = run(state, place('r2'), dice(6)).state;

		expect(gmMonster(state, 'G1')).toMatchObject({ name: 'Goblin', area: 'r2', condition: 'unhurt', gm: { hp: 4, maxHp: 4, ac: 11 } });
		expect(gmMonster(state, 'G2')).toMatchObject({ gm: { hp: 6, maxHp: 6 } });
		expect(gmMonster(state, 'G1')!.cell).not.toEqual(gmMonster(state, 'G2')!.cell);
	});

	it('rolls level × d8 + CON when the file gives no HP', () => {
		const state = run(crawling(), place('r3'), dice(3, 5)).state;

		expect(gmMonster(state, 'S1')?.gm).toMatchObject({ hp: 8, maxHp: 8, ac: 13 });
	});

	it('never reuses a label, even after a token is removed', () => {
		let state = run(crawling(), place('r2'), dice(4)).state;
		state = run(state, { type: 'removeMonster', by: 'gm', id: 'G1' }).state;
		state = run(state, place('r2'), dice(4)).state;

		expect(mapView(state, dungeon, 'gm').monsters.map((m) => m.id)).toEqual(['G2']);
	});

	it('is for the GM only, and only from the area’s own list', () => {
		const state = crawling();

		expect(reject(state, { ...place('r2'), by: 'p1' } as Command, dice(4))).toBe('Only the GM can place monsters.');
		expect(reject(state, place('r1'), dice(4))).toBe('That monster isn’t listed for this area.');
		expect(reject(state, place('r2', 5), dice(4))).toBe('That monster isn’t listed for this area.');
	});

	it('lets the GM edit the rolled HP', () => {
		let state = run(crawling(), place('r2'), dice(2)).state;
		state = run(state, { type: 'setMonsterHp', by: 'gm', id: 'G1', hp: 5, maxHp: 7 }).state;

		expect(gmMonster(state, 'G1')?.gm).toMatchObject({ hp: 5, maxHp: 7 });
		expect(reject(state, { type: 'setMonsterHp', by: 'gm', id: 'G1', hp: 8, maxHp: 7 })).toBe(
			'HP must be a whole number from 0 to max HP.'
		);
		expect(reject(state, { type: 'setMonsterHp', by: 'gm', id: 'G1', hp: 0, maxHp: 0 })).toMatch(/^Max HP/);
		expect(reject(state, { type: 'setMonsterHp', by: 'p1', id: 'G1', hp: 1, maxHp: 7 })).toMatch(/^Only the GM/);
	});
});

describe('monster tokens', () => {
	it('show players a monster only once its area is revealed, with its condition and no HP', () => {
		let state = run(crawling(), place('r2'), dice(4)).state;
		expect(playerMonster(state, 'G1')).toBeUndefined();

		state = run(state, { type: 'setAreaRevealed', by: 'gm', areaId: 'r2', revealed: true, dungeon }).state;
		expect(playerMonster(state, 'G1')).toEqual({
			id: 'G1',
			name: 'Goblin',
			area: 'r2',
			cell: { x: 10, y: 0 },
			condition: 'unhurt',
			gm: null
		});
	});

	it('can be moved by the GM to any free square of the dungeon, and removed', () => {
		let state = run(crawling(), place('r2'), dice(4)).state;
		state = run(state, { type: 'moveMonster', by: 'gm', id: 'G1', to: { x: 7, y: 1 }, dungeon }).state;
		expect(gmMonster(state, 'G1')).toMatchObject({ area: 'c1', cell: { x: 7, y: 1 } });

		expect(reject(state, { type: 'moveMonster', by: 'gm', id: 'G1', to: { x: 0, y: 0 }, dungeon })).toBe(
			'Something is already standing there.'
		);
		expect(reject(state, { type: 'moveMonster', by: 'gm', id: 'G1', to: { x: 40, y: 40 }, dungeon })).toBe(
			'That square isn’t part of the dungeon.'
		);
		expect(reject(state, { type: 'moveMonster', by: 'p1', id: 'G1', to: { x: 6, y: 1 }, dungeon })).toMatch(/^Only the GM/);

		state = run(state, { type: 'removeMonster', by: 'gm', id: 'G1' }).state;
		expect(mapView(state, dungeon, 'gm').monsters).toEqual([]);
	});

	it('block the squares they stand on for player tokens', () => {
		let state = run(crawling(), place('r2'), dice(4)).state;
		state = run(state, { type: 'moveMonster', by: 'gm', id: 'G1', to: { x: 2, y: 2 }, dungeon }).state;

		expect(reject(state, { type: 'moveToken', by: 'p1', to: { x: 2, y: 2 }, dungeon })).toBe('Something is already standing there.');
		expect(mapView(state, dungeon, 'player', 1).moves?.cells).not.toContainEqual({ x: 2, y: 2 });
	});
});

describe('conditions', () => {
	it.each([
		[9, 9, 'unhurt'],
		[8, 9, 'wounded'],
		[4, 9, 'wounded'],
		[3, 9, 'nearDeath'],
		[1, 9, 'nearDeath'],
		[1, 2, 'wounded'],
		[1, 3, 'nearDeath'],
		[0, 9, 'down']
	])('%i of %i HP reads as %s', (hp, maxHp, condition) => {
		let state = run(crawling(), place('r2'), dice(1)).state;
		state = run(state, { type: 'setMonsterHp', by: 'gm', id: 'G1', hp, maxHp }).state;
		state = run(state, { type: 'setAreaRevealed', by: 'gm', areaId: 'r2', revealed: true, dungeon }).state;

		expect(playerMonster(state, 'G1')?.condition).toBe(condition);
	});
});

describe('attacking a monster', () => {
	it('uses the target’s AC as the DC, whatever DC the form sent', () => {
		const { state, events } = run(goblinFight(), attackG1({ dc: 18 }));

		expect(entries(events)).toMatchObject([
			{ kind: 'challenge', dc: 11, check: { type: 'attack', target: { id: 'G1', name: 'Goblin' } } }
		]);
		expect(state.crawl?.spotlight).toMatchObject({ kind: 'challenge', challenge: { dc: 11 } });
	});

	it('rejects a target that isn’t on the map', () => {
		expect(reject(goblinFight(), attackG1({ check: { type: 'attack', weapon: 0, target: 'G9' } }))).toBe(
			'That monster isn’t on the map any more.'
		);
	});

	it('turns the damage roll into an HP suggestion that changes nothing until the GM confirms it', () => {
		const challenged = run(goblinFight(9), attackG1()).state;
		const hit = run(challenged, { type: 'acceptChallenge', by: 'p1' }, dice(10));
		const { state, events } = run(hit.state, { type: 'rollDamage', by: 'p1' }, dice(4));

		expect(entries(events)).toMatchObject([{ kind: 'damage', total: 5, target: { id: 'G1', name: 'Goblin' } }]);
		expect(pending(events)).toEqual([{ id: 1, target: { kind: 'monster', id: 'G1' }, amount: 5 }]);
		expect(gmMonster(state, 'G1')?.gm?.hp).toBe(9);
		expect(playerMonster(state, 'G1')?.condition).toBe('unhurt');

		const confirmed = run(state, { type: 'confirmHpChange', by: 'gm', id: 1 });
		expect(gmMonster(confirmed.state, 'G1')?.gm?.hp).toBe(4);
		expect(entries(confirmed.events)).toEqual([
			{ at, kind: 'monsterHurt', monster: { id: 'G1', name: 'Goblin' }, condition: 'wounded' }
		]);
		expect(confirmed.state.hpChanges).toEqual([]);
	});

	it('suggests the HP change straight away with pre-consent', () => {
		const { state, events } = run(goblinFight(5, true), attackG1(), dice(10, 3));

		expect(pending(events)).toEqual([{ id: 1, target: { kind: 'monster', id: 'G1' }, amount: 4 }]);
		expect(gmMonster(state, 'G1')?.gm?.hp).toBe(5);
	});

	it('lets the GM confirm a different amount, or dismiss the suggestion', () => {
		const state = run(goblinFight(5, true), attackG1(), dice(10, 3)).state;

		const adjusted = run(state, { type: 'confirmHpChange', by: 'gm', id: 1, amount: 2 }).state;
		expect(gmMonster(adjusted, 'G1')?.gm?.hp).toBe(3);

		const dismissed = run(state, { type: 'dismissHpChange', by: 'gm', id: 1 }).state;
		expect(gmMonster(dismissed, 'G1')?.gm?.hp).toBe(5);
		expect(reject(dismissed, { type: 'confirmHpChange', by: 'gm', id: 1 })).toBe('That HP change has already been handled.');
	});

	it('only lets the GM rule on a suggestion, and drops it when the monster is removed', () => {
		const state = run(goblinFight(5, true), attackG1(), dice(10, 3)).state;

		expect(reject(state, { type: 'confirmHpChange', by: 'p1', id: 1 })).toBe('Only the GM can rule on HP changes.');
		const removed = run(state, { type: 'removeMonster', by: 'gm', id: 'G1' }).state;
		expect(removed.hpChanges).toEqual([]);
	});

	it('takes a monster down to 0 HP at most', () => {
		const state = run(goblinFight(2, true), attackG1(), dice(10, 8)).state;
		const { state: after, events } = run(state, { type: 'confirmHpChange', by: 'gm', id: 1 });

		expect(gmMonster(after, 'G1')?.gm?.hp).toBe(0);
		expect(entries(events)).toMatchObject([{ kind: 'monsterHurt', condition: 'down' }]);
	});

	it('keeps an attack without a target on the GM’s DC, and suggests no HP change', () => {
		const { events } = run(goblinFight(5, true), attackG1({ check: { type: 'attack', weapon: 0 }, dc: 13 }), dice(10, 3));

		expect(entries(events)[0]).toMatchObject({ kind: 'challenge', dc: 13 });
		expect(pending(events)).toEqual([]);
	});
});

describe('monster attacks', () => {
	const goblinAttacks = (edge: 'advantage' | 'disadvantage' | null = null): Command => ({
		type: 'monsterAttack',
		by: 'gm',
		id: 'G1',
		option: 0,
		seat: 1,
		edge
	});

	it('roll in the open against the character’s AC and suggest the damage for the GM to confirm', () => {
		const { state, events } = run(goblinFight(), goblinAttacks(), dice(11, 4));

		expect(entries(events)).toEqual([
			{
				at,
				kind: 'monsterAttack',
				monster: { id: 'G1', name: 'Goblin' },
				seat: 1,
				ac: 12,
				edge: null,
				strikes: [
					{
						attack: 'spear',
						d20s: [11],
						d20: 11,
						bonus: 1,
						total: 12,
						hit: true,
						damage: { formula: '1d6', rolls: [4], modifier: 0, total: 4 },
						effect: null
					}
				]
			}
		]);
		expect(pending(events)).toEqual([{ id: 1, target: { kind: 'player', seat: 1 }, amount: 4 }]);
		expect(hpOf(state)).toBe(10);

		const confirmed = run(state, { type: 'confirmHpChange', by: 'gm', id: 1 });
		expect(hpOf(confirmed.state)).toBe(6);
		expect(entries(confirmed.events)).toEqual([{ at, kind: 'characterHurt', seat: 1, amount: 4 }]);
	});

	it('roll no damage and suggest nothing on a miss', () => {
		const { events } = run(goblinFight(), goblinAttacks(), dice(10));

		expect(entries(events)[0]).toMatchObject({ kind: 'monsterAttack', strikes: [{ total: 11, hit: false, damage: null }] });
		expect(pending(events)).toEqual([]);
	});

	it('roll two d20s with advantage', () => {
		const { events } = run(goblinFight(), goblinAttacks('advantage'), dice(3, 15, 2));

		expect(entries(events)[0]).toMatchObject({ strikes: [{ d20s: [3, 15], d20: 15, hit: true, damage: { total: 2 } }] });
	});

	it('happen in the GM’s turn only, and only with the monster’s own attacks', () => {
		const state = goblinFight();
		const playerTurn = run(state, { type: 'passSpotlight', by: 'gm' }).state;

		expect(reject(playerTurn, goblinAttacks(), dice(11, 4))).toBe('Monsters act in your turn.');
		expect(reject(state, { ...goblinAttacks(), option: 2 } as Command, dice(11, 4))).toBe('Pick one of the monster’s attacks.');
		expect(reject(state, { ...goblinAttacks(), seat: 3 } as Command, dice(11, 4))).toBe('Pick a character to attack.');
		expect(reject(state, { ...goblinAttacks(), by: 'p1' } as Command, dice(11, 4))).toBe('Only the GM rolls for monsters.');
	});

	it('keep the spotlight with the GM', () => {
		const { state } = run(goblinFight(), goblinAttacks(), dice(11, 4));

		expect(state.crawl?.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});
});

describe('dying', () => {
	/** The goblin has hit for `damage`, waiting for the GM to confirm. */
	function hitFor(damage: number) {
		return run(
			goblinFight(),
			{ type: 'monsterAttack', by: 'gm', id: 'G1', option: 0, seat: 1, edge: null },
			dice(11, Math.min(damage, 6))
		).state;
	}

	it('marks a character at 0 HP as dying, on the sheet and the map', () => {
		let state = run(hitFor(6), { type: 'confirmHpChange', by: 'gm', id: 1, amount: 10 }).state;

		expect(sheets(state, 'p1')[0]).toMatchObject({ hp: 0, dying: true });
		expect(mapView(state, dungeon, 'player', 1).tokens[0].dying).toBe(true);

		state = run(state, { type: 'setCharacterHp', by: 'gm', seat: 1, hp: 1 }).state;
		expect(sheets(state, 'p1')[0]).toMatchObject({ hp: 1, dying: false });
	});

	it('logs "dying" and tells the server when HP drops to 0, never below', () => {
		const { state, events } = run(hitFor(6), { type: 'confirmHpChange', by: 'gm', id: 1, amount: 15 });

		expect(entries(events)).toEqual([
			{ at, kind: 'characterHurt', seat: 1, amount: 15 },
			{ at, kind: 'dying', seat: 1 }
		]);
		expect(events).toContainEqual({ type: 'characterDying', seat: 1 });
		expect(hpOf(state)).toBe(0);
	});

	it('isn’t logged again for more damage to a character already dying', () => {
		let state = run(hitFor(6), { type: 'confirmHpChange', by: 'gm', id: 1, amount: 10 }).state;
		state = run(state, { type: 'monsterAttack', by: 'gm', id: 'G1', option: 0, seat: 1, edge: null }, dice(11, 3)).state;
		const { events } = run(state, { type: 'confirmHpChange', by: 'gm', id: 2 });

		expect(entries(events)).toEqual([{ at, kind: 'characterHurt', seat: 1, amount: 3 }]);
	});

	it('lets only the GM set a character’s HP, between 0 and max HP', () => {
		const state = hitFor(3);

		const dropped = run(state, { type: 'setCharacterHp', by: 'gm', seat: 1, hp: 0 });
		expect(entries(dropped.events)).toEqual([{ at, kind: 'dying', seat: 1 }]);
		expect(reject(state, { type: 'setCharacterHp', by: 'gm', seat: 1, hp: 11 })).toBe('HP must be a whole number from 0 to 10.');
		expect(reject(state, { type: 'setCharacterHp', by: 'p1', seat: 1, hp: 5 })).toMatch(/^Only the GM/);
	});
});
