import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { inRect } from '../dungeon/model.ts';
import { applyCommand, resolveVisitor, sheets, type Command, type Deps, type SessionState } from './index.ts';
import { mapView } from './map.ts';

const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const deps: Deps = {
	dice: () => {
		throw new Error('no dice expected');
	},
	now: () => new Date('2026-11-27T12:00:00Z')
};

function createSession() {
	const result = applyCommand(
		null,
		{ type: 'createSession', sessionId: 's1', name: 'The Lost Citadel', gmSecret: 'gm-secret', dungeon },
		deps
	);
	if (!result.ok) throw new Error(result.reason);
	return result.state;
}

function run(state: SessionState, command: Command) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

describe('creating a session', () => {
	it('makes the creator the GM of a named session', () => {
		const state = createSession();

		expect(resolveVisitor(state, 'gm-secret')).toEqual({ role: 'gm', sessionName: 'The Lost Citadel' });
	});

	it('trims the name and rejects a blank one', () => {
		const blank = applyCommand(
			null,
			{ type: 'createSession', sessionId: 's1', name: '   ', gmSecret: 'gm-secret', dungeon },
			deps
		);
		const padded = applyCommand(
			null,
			{ type: 'createSession', sessionId: 's1', name: '  Tomb  ', gmSecret: 'gm-secret', dungeon },
			deps
		);

		expect(blank).toEqual({ ok: false, reason: 'The session needs a name.' });
		expect(padded.ok && resolveVisitor(padded.state, 'gm-secret')).toEqual({ role: 'gm', sessionName: 'Tomb' });
	});

	it('reveals nothing to an unknown secret', () => {
		expect(resolveVisitor(createSession(), 'guess')).toEqual({ role: 'unknown' });
	});
});

describe('player slots', () => {
	it('lets the GM add a player slot whose secret identifies that player and their token colour', () => {
		const { state, events } = run(createSession(), {
			type: 'addPlayerSlot',
			by: 'gm-secret',
			secret: 'p1-secret'
		});

		expect(resolveVisitor(state, 'p1-secret')).toEqual({
			role: 'player',
			sessionName: 'The Lost Citadel',
			seat: 1,
			tokenColour: 'blue'
		});
		expect(events).toEqual([{ type: 'playerSlotAdded', seat: 1, tokenColour: 'blue' }]);
	});

	it('rejects a player slot added by anyone but the GM', () => {
		const { state } = run(createSession(), { type: 'addPlayerSlot', by: 'gm-secret', secret: 'p1-secret' });

		const byPlayer = applyCommand(state, { type: 'addPlayerSlot', by: 'p1-secret', secret: 'x' }, deps);
		const byStranger = applyCommand(state, { type: 'addPlayerSlot', by: 'nope', secret: 'y' }, deps);

		expect(byPlayer.ok).toBe(false);
		expect(byStranger.ok).toBe(false);
	});

	it('seats up to four players, each with a different token colour, and rejects a fifth', () => {
		let state = createSession();
		for (const secret of ['p1', 'p2', 'p3', 'p4']) {
			state = run(state, { type: 'addPlayerSlot', by: 'gm-secret', secret }).state;
		}

		const colours = ['p1', 'p2', 'p3', 'p4'].map((secret) => {
			const visitor = resolveVisitor(state, secret);
			return visitor.role === 'player' ? visitor.tokenColour : null;
		});
		expect(colours).toEqual(['blue', 'purple', 'green', 'magenta']);

		const fifth = applyCommand(state, { type: 'addPlayerSlot', by: 'gm-secret', secret: 'p5' }, deps);
		expect(fifth).toEqual({ ok: false, reason: 'A session has at most 4 players.' });
		expect(resolveVisitor(state, 'p5')).toEqual({ role: 'unknown' });
	});
});

describe('the dungeon map', () => {
	it('reveals the start room when the session is created', () => {
		const result = applyCommand(
			null,
			{ type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm-secret', dungeon },
			deps
		);

		expect(result.ok && result.events).toEqual([
			{ type: 'sessionCreated', sessionId: 's1', dungeonId: 'example' },
			{ type: 'areaRevealed', areaId: 'r1' }
		]);
		expect(mapView(createSession(), dungeon, 'player').areas.map((a) => a.id)).toEqual(['r1']);
	});

	it('shows players the doors of revealed areas, but no secret doors and nothing GM-only', () => {
		const view = mapView(createSession(), dungeon, 'player');

		expect(view.areas).toEqual([
			{
				id: 'r1',
				kind: 'room',
				rect: { x: 0, y: 0, w: 5, h: 4 },
				name: 'Entrance hall',
				revealed: true,
				mood: null,
				notes: null,
				monsters: []
			}
		]);
		expect(view.exits.map((e) => `${e.from}-${e.type}-${e.to}`)).toEqual(['r1-open-c1', 'r1-door-c2']);
	});

	it('shows the GM every area with its notes, mood text and monsters, and every exit', () => {
		const view = mapView(createSession(), dungeon, 'gm');
		const guardRoom = view.areas.find((a) => a.id === 'r2')!;

		expect(view.areas).toHaveLength(7);
		expect(guardRoom).toMatchObject({
			revealed: false,
			notes: 'The goblins are bored and bribable (10 gp or food).',
			monsters: [{ label: 'G', name: 'Goblin', count: '2' }]
		});
		expect(guardRoom.mood).toMatch(/^A brazier smoulders/);
		expect(view.exits.some((e) => e.type === 'secret')).toBe(true);
	});
});

describe('characters', () => {
	const gelanResult = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
	const witchResult = importShadowdarklings(readFileSync('src/lib/character/fixtures/magalph-witch.json', 'utf8'));
	if (!gelanResult.ok || !witchResult.ok) throw new Error('the fixtures must import');
	const gelan = gelanResult.character;
	const magalph = witchResult.character;

	function table() {
		let state = createSession();
		for (const secret of ['p1', 'p2']) state = run(state, { type: 'addPlayerSlot', by: 'gm-secret', secret }).state;
		return state;
	}

	it('lets a player import their character, starting at full HP', () => {
		const { state, events } = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon });

		expect(events).toEqual([{ type: 'characterImported', seat: 1, name: 'Gelan (Arden Vul)' }]);
		expect(sheets(state, 'p1')).toEqual([
			{ seat: 1, tokenColour: 'blue', initials: 'Ge', character: gelan, hp: 13, dying: false, inventory: '' }
		]);
	});

	it('shows a player only their own sheet, and the GM every imported sheet', () => {
		let state = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon }).state;
		state = run(state, { type: 'importCharacter', by: 'p2', character: magalph, dungeon }).state;

		expect(sheets(state, 'p2').map((s) => s.character.name)).toEqual(['Magalph (Brandonsford)']);
		expect(sheets(state, 'gm-secret').map((s) => [s.seat, s.hp])).toEqual([
			[1, 13],
			[2, 4]
		]);
		expect(sheets(state, 'nope')).toEqual([]);
	});

	it('shows nothing for a player who has not imported yet', () => {
		expect(sheets(table(), 'p1')).toEqual([]);
	});

	it('only accepts an import from a player seat, and only once (re-import comes later)', () => {
		const state = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon }).state;

		expect(applyCommand(state, { type: 'importCharacter', by: 'gm-secret', character: gelan, dungeon }, deps)).toEqual({
			ok: false,
			reason: 'Only players can import a character.'
		});
		expect(applyCommand(state, { type: 'importCharacter', by: 'p1', character: magalph, dungeon }, deps)).toEqual({
			ok: false,
			reason: 'You have already imported a character.'
		});
	});

	it('puts each imported token in the start room, on its own square, in the slot colour with initials', () => {
		let state = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon }).state;
		state = run(state, { type: 'importCharacter', by: 'p2', character: magalph, dungeon }).state;

		const tokens = mapView(state, dungeon, 'player').tokens;
		expect(tokens.map(({ seat, tokenColour, initials, area }) => ({ seat, tokenColour, initials, area }))).toEqual([
			{ seat: 1, tokenColour: 'blue', initials: 'Ge', area: 'r1' },
			{ seat: 2, tokenColour: 'purple', initials: 'Ma', area: 'r1' }
		]);
		const startRoom = { x: 0, y: 0, w: 5, h: 4 };
		for (const { cell } of tokens) expect(inRect(cell, startRoom)).toBe(true);
		expect(tokens[0].cell).not.toEqual(tokens[1].cell);
		expect(mapView(state, dungeon, 'gm').tokens).toEqual(tokens);
	});

	it('shows no token for a seat without a character', () => {
		expect(mapView(table(), dungeon, 'player').tokens).toEqual([]);
	});

	it('lets a player edit their own free-text inventory', () => {
		let state = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon }).state;
		const edited = run(state, { type: 'editInventory', by: 'p1', inventory: '3 gold teeth\nWet map' });
		state = edited.state;

		expect(edited.events).toEqual([{ type: 'inventoryEdited', seat: 1 }]);
		expect(sheets(state, 'p1')[0].inventory).toBe('3 gold teeth\nWet map');
	});

	it('rejects inventory edits by the GM, before an import, and beyond the length limit', () => {
		const state = run(table(), { type: 'importCharacter', by: 'p1', character: gelan, dungeon }).state;

		expect(applyCommand(state, { type: 'editInventory', by: 'gm-secret', inventory: 'x' }, deps).ok).toBe(false);
		expect(applyCommand(state, { type: 'editInventory', by: 'p2', inventory: 'x' }, deps)).toEqual({
			ok: false,
			reason: 'Import your character first.'
		});
		expect(applyCommand(state, { type: 'editInventory', by: 'p1', inventory: 'x'.repeat(2001) }, deps)).toEqual({
			ok: false,
			reason: 'The inventory can be at most 2000 characters long.'
		});
	});
});
