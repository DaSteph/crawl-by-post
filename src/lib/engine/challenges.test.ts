import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import type { Character } from '../character/model.ts';
import { applyCommand, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import type { SetChallenge } from './challenges.ts';
import { spotlightHolder, type LogEntry } from './turns.ts';

const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');

/** A fighter with STR +2, DEX +1 and a longsword (+3, 1d8+1). */
const hero: Character = {
	...imported.character,
	name: 'Hero',
	abilities: {
		...imported.character.abilities,
		STR: { score: 14, modifier: 2 },
		DEX: { score: 12, modifier: 1 }
	},
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

const noDice = dice();
const at = '2026-11-27T12:00:00.000Z';

function run(state: SessionState | null, command: Command, deps: Deps = noDice) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

const entries = (events: EngineEvent[]): LogEntry[] => events.flatMap((e) => (e.type === 'logged' ? [e.entry] : []));

/** One player in the crawl; they have just posted an action, so it's the GM's turn. */
function gmTurn(preConsent: boolean) {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: 'p1' }).state;
	state = run(state, { type: 'importCharacter', by: 'p1', character: hero, dungeon }).state;
	state = run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(10)).state;
	return run(state, { type: 'postAction', by: 'p1', text: 'I leap the pit.', preConsent }).state;
}

const test = (overrides: Partial<SetChallenge> = {}): SetChallenge => ({
	type: 'setChallenge',
	by: 'gm',
	check: { type: 'test', ability: 'DEX' },
	dc: 12,
	edge: null,
	stakes: 'If you fail, you fall in.',
	...overrides
});

const attack = (overrides: Partial<SetChallenge> = {}): SetChallenge =>
	test({ check: { type: 'attack', weapon: 0 }, dc: 13, stakes: '', ...overrides });

describe('a challenge with pre-consent', () => {
	it('rolls the moment the GM sets it, locks the roll into the log and keeps the spotlight with the GM', () => {
		const { state, events } = run(gmTurn(true), test(), dice(11));

		expect(entries(events)).toEqual([
			{ at, kind: 'challenge', seat: 1, check: { type: 'test', ability: 'DEX' }, dc: 12, edge: null, stakes: 'If you fail, you fall in.' },
			{ at, kind: 'roll', seat: 1, check: { type: 'test', ability: 'DEX' }, edge: null, d20s: [11], d20: 11, modifier: 1, total: 12, dc: 12, success: true }
		]);
		expect(spotlightHolder(state)).toBe('gm');
	});

	it('covers one challenge only: the next one goes to the player to accept', () => {
		const first = run(gmTurn(true), test(), dice(2));
		const second = run(first.state, test({ dc: 9 }));

		expect(entries(first.events)[1]).toMatchObject({ total: 3, success: false });
		expect(second.state.crawl?.spotlight).toMatchObject({ kind: 'challenge', seat: 1 });
	});

	it('rolls the weapon damage straight away after a hit', () => {
		const { state, events } = run(gmTurn(true), attack(), dice(10, 6));

		expect(entries(events).slice(1)).toEqual([
			expect.objectContaining({ kind: 'roll', d20: 10, modifier: 3, total: 13, dc: 13, success: true }),
			{ at, kind: 'damage', seat: 1, weapon: 'Longsword', formula: '1d8+1', rolls: [6], modifier: 1, total: 7 }
		]);
		expect(spotlightHolder(state)).toBe('gm');
	});
});

describe('a challenge without pre-consent', () => {
	it('hands the spotlight back to the player with the DC and stakes, without rolling', () => {
		const { state, events } = run(gmTurn(false), test());

		expect(entries(events)).toMatchObject([{ kind: 'challenge', dc: 12, stakes: 'If you fail, you fall in.' }]);
		expect(spotlightHolder(state)).toBe(1);
		expect(state.crawl?.spotlight).toMatchObject({ kind: 'challenge', challenge: { dc: 12, stakes: 'If you fail, you fall in.' } });
	});

	it('rolls when the player accepts, and passes the spotlight to the GM', () => {
		const challenged = run(gmTurn(false), test()).state;
		const { state, events } = run(challenged, { type: 'acceptChallenge', by: 'p1' }, dice(8));

		expect(entries(events)).toMatchObject([{ kind: 'roll', d20: 8, modifier: 1, total: 9, dc: 12, success: false }]);
		expect(state.crawl?.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('lets the player back out without a roll, passing the spotlight to the GM', () => {
		const challenged = run(gmTurn(false), test()).state;
		const { state, events } = run(challenged, { type: 'declineChallenge', by: 'p1' });

		expect(entries(events)).toEqual([{ at, kind: 'declined', seat: 1 }]);
		expect(spotlightHolder(state)).toBe('gm');
	});

	it('neither moves the token nor takes a new action while the challenge waits', () => {
		const challenged = run(gmTurn(false), test()).state;

		expect(applyCommand(challenged, { type: 'postAction', by: 'p1', text: 'Actually…' }, noDice)).toEqual({
			ok: false,
			reason: 'Accept or back out of the challenge first.'
		});
		expect(applyCommand(challenged, { type: 'moveToken', by: 'p1', to: { x: 0, y: 0 }, dungeon }, noDice)).toEqual({
			ok: false,
			reason: 'You can only move on your turn.'
		});
		expect(applyCommand(challenged, { type: 'passSpotlight', by: 'gm' }, noDice).ok).toBe(false);
	});

	it('keeps the spotlight with the player after a hit, until they roll damage', () => {
		const challenged = run(gmTurn(false), attack()).state;
		const hit = run(challenged, { type: 'acceptChallenge', by: 'p1' }, dice(15));
		const dmg = run(hit.state, { type: 'rollDamage', by: 'p1' }, dice(3));

		expect(entries(hit.events)).toMatchObject([{ kind: 'roll', total: 18, success: true }]);
		expect(hit.state.crawl?.spotlight).toMatchObject({ kind: 'damage', seat: 1 });
		expect(entries(dmg.events)).toMatchObject([{ kind: 'damage', weapon: 'Longsword', rolls: [3], total: 4 }]);
		expect(dmg.state.crawl?.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
		expect(applyCommand(dmg.state, { type: 'rollDamage', by: 'p1' }, dice(3)).ok).toBe(false);
	});

	it('offers no damage roll after a miss', () => {
		const challenged = run(gmTurn(false), attack()).state;
		const miss = run(challenged, { type: 'acceptChallenge', by: 'p1' }, dice(4));

		expect(spotlightHolder(miss.state)).toBe('gm');
		expect(applyCommand(miss.state, { type: 'rollDamage', by: 'p1' }, dice(3)).ok).toBe(false);
	});
});

describe('advantage and disadvantage', () => {
	it('rolls two d20s and keeps the higher one with advantage', () => {
		const { events } = run(gmTurn(true), test({ edge: 'advantage' }), dice(4, 17));

		expect(entries(events)[1]).toMatchObject({ edge: 'advantage', d20s: [4, 17], d20: 17, total: 18 });
	});

	it('rolls two d20s and keeps the lower one with disadvantage', () => {
		const { events } = run(gmTurn(true), test({ edge: 'disadvantage' }), dice(4, 17));

		expect(entries(events)[1]).toMatchObject({ edge: 'disadvantage', d20s: [4, 17], d20: 4, total: 5, success: false });
	});
});

describe('setting a challenge', () => {
	it('is only for the GM, in the GM’s turn', () => {
		const state = gmTurn(false);
		const playerTurn = run(state, { type: 'passSpotlight', by: 'gm' }).state;

		expect(applyCommand(state, { ...test(), by: 'p1' }, noDice).ok).toBe(false);
		expect(applyCommand(playerTurn, test(), noDice).ok).toBe(false);
	});

	it('rejects a DC outside 1–30, an unknown weapon and overlong stakes', () => {
		const state = gmTurn(false);

		expect(applyCommand(state, test({ dc: 0 }), noDice).ok).toBe(false);
		expect(applyCommand(state, test({ dc: 31 }), noDice).ok).toBe(false);
		expect(applyCommand(state, test({ dc: 12.5 }), noDice).ok).toBe(false);
		expect(applyCommand(state, attack({ check: { type: 'attack', weapon: 3 } }), noDice).ok).toBe(false);
		expect(applyCommand(state, test({ stakes: 'x'.repeat(201) }), noDice).ok).toBe(false);
	});

	it('accepts an empty stakes line', () => {
		expect(entries(run(gmTurn(false), test({ stakes: '  ' })).events)).toMatchObject([{ kind: 'challenge', stakes: '' }]);
	});

	it('only lets the challenged player answer', () => {
		const challenged = run(gmTurn(false), test()).state;

		expect(applyCommand(challenged, { type: 'acceptChallenge', by: 'gm' }, dice(10)).ok).toBe(false);
		expect(applyCommand(gmTurn(false), { type: 'acceptChallenge', by: 'p1' }, dice(10)).ok).toBe(false);
	});
});
