import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type Deps, type SessionState } from '../engine/index.ts';
import { planPush } from './plan.ts';

const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');
const base = imported.character;

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

/** Runs a command and returns the push it would send. */
function step(state: SessionState | null, command: Command, deps: Deps = dice()) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return { state: result.state, push: planPush(result.state, result.events, 'by' in command ? command.by : null) };
}

/** Two players; player 1 wins initiative. */
function crawling() {
	let { state } = step(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon });
	for (const [i, name] of ['Ayla', 'Bram'].entries()) {
		const secret = `p${i + 1}`;
		state = step(state, { type: 'addPlayerSlot', by: 'gm', secret }).state;
		state = step(state, { type: 'importCharacter', by: secret, character: { ...base, name }, dungeon }).state;
	}
	return step(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(18, 3));
}

describe('who gets a push', () => {
	it('pushes the initiative winner when the GM starts the crawl', () => {
		expect(crawling().push).toEqual({
			secret: 'p1',
			title: 'Chapel',
			body: 'Your turn. What do you do?',
			url: '/session/s1/p1'
		});
	});

	it('pushes the GM when a player posts their action, naming the player', () => {
		const { push } = step(crawling().state, { type: 'postAction', by: 'p1', text: 'I open the door', preConsent: false });
		expect(push).toMatchObject({ secret: 'gm', body: 'Ayla acted. Respond or pass.', url: '/session/s1/gm' });
	});

	it('pushes the next player when the GM passes', () => {
		let { state } = step(crawling().state, { type: 'postAction', by: 'p1', text: 'I wait', preConsent: false });
		const { push } = step(state, { type: 'passSpotlight', by: 'gm' });
		expect(push).toMatchObject({ secret: 'p2', body: 'Your turn. What do you do?' });
	});

	it('pushes the player a challenge goes back to', () => {
		const { state } = step(crawling().state, { type: 'postAction', by: 'p1', text: 'I climb', preConsent: false });
		const { push } = step(state, {
			type: 'setChallenge',
			by: 'gm',
			check: { type: 'test', ability: 'STR' },
			dc: 12,
			edge: null,
			stakes: 'You might fall'
		});
		expect(push).toMatchObject({ secret: 'p1', body: 'The GM sets a challenge for you. Roll or back out.' });
	});

	it('does not push a player who keeps the spotlight for their own damage roll', () => {
		let { state } = step(crawling().state, { type: 'postAction', by: 'p1', text: 'I attack', preConsent: false });
		state = step(state, {
			type: 'setChallenge',
			by: 'gm',
			check: { type: 'attack', weapon: 0 },
			dc: 2,
			edge: null,
			stakes: ''
		}).state;
		const { state: after, push } = step(state, { type: 'acceptChallenge', by: 'p1' }, dice(20));
		expect(after.crawl?.spotlight.kind).toBe('damage');
		expect(push).toBeNull();
	});

	it('pushes nobody when the spotlight does not move', () => {
		const { push } = step(crawling().state, { type: 'postChat', by: 'p2', text: 'Careful!' });
		expect(push).toBeNull();
	});

	it('always addresses the current secret, so an old link gets nothing', () => {
		const { state } = crawling();
		const regenerated: SessionState = {
			...state,
			players: state.players.map((p) => (p.seat === 1 ? { ...p, secret: 'p1-new' } : p))
		};
		const events = [{ type: 'spotlightChanged', spotlight: { kind: 'player', seat: 1 } } as const];
		expect(planPush(regenerated, events, 'gm')).toMatchObject({ secret: 'p1-new', url: '/session/s1/p1-new' });
	});

	it('reminds the spotlight holder at half time', () => {
		const { state } = crawling();
		const { push } = step(state, { type: 'turnTimerFired', clock: state.turnClock!.id, kind: 'reminder' });
		expect(push).toMatchObject({ secret: 'p1', body: 'Reminder: Your turn. What do you do?' });
	});

	it('pushes the GM when a player’s turn times out, and the next player when a GM turn does', () => {
		const { state } = crawling();
		const timedOut = step(state, { type: 'turnTimerFired', clock: state.turnClock!.id, kind: 'timeout' });
		expect(timedOut.push).toMatchObject({
			secret: 'gm',
			body: 'Ayla’s turn timed out. Skip, wait or play for them.'
		});

		const gmTurn = step(state, { type: 'postAction', by: 'p1', text: 'I wait' }).state;
		const passed = step(gmTurn, { type: 'turnTimerFired', clock: gmTurn.turnClock!.id, kind: 'timeout' });
		expect(passed.push).toMatchObject({ secret: 'p2', body: 'Your turn. What do you do?' });
	});

	it('pushes nobody for a job that fired after its turn was over', () => {
		const { state } = crawling();
		const after = step(state, { type: 'postAction', by: 'p1', text: 'I wait' }).state;
		const { push } = step(after, { type: 'turnTimerFired', clock: state.turnClock!.id, kind: 'reminder' });
		expect(push).toBeNull();
	});
});
