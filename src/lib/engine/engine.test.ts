import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { applyCommand, resolveVisitor, type Command, type Deps, type SessionState } from './index.ts';
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
