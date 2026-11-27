import { describe, expect, it } from 'vitest';
import { applyCommand, resolveVisitor, type Command, type Deps, type SessionState } from './index.ts';

const deps: Deps = {
	dice: () => {
		throw new Error('no dice expected');
	},
	now: () => new Date('2026-11-27T12:00:00Z')
};

function createSession() {
	const result = applyCommand(
		null,
		{ type: 'createSession', sessionId: 's1', name: 'The Lost Citadel', gmSecret: 'gm-secret' },
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
			{ type: 'createSession', sessionId: 's1', name: '   ', gmSecret: 'gm-secret' },
			deps
		);
		const padded = applyCommand(
			null,
			{ type: 'createSession', sessionId: 's1', name: '  Tomb  ', gmSecret: 'gm-secret' },
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
