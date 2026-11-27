import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import { mapView } from './map.ts';
import type { Danger, LogEntry } from './turns.ts';
import { WANDERING_ROLL } from './wandering.ts';

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
const dueEvents = (events: EngineEvent[]) => events.filter((e) => e.type === 'wanderingCheckDue');

const action = (by: string, preConsent = false): Command => ({ type: 'postAction', by, text: 'I search.', preConsent });
const pass: Command = { type: 'passSpotlight', by: 'gm' };
const setCheck = (seat?: number, by = 'gm'): Command => ({ type: 'setWanderingCheck', by, ...(seat ? { seat } : {}) });
const postpone: Command = { type: 'postponeWanderingCheck', by: 'gm' };
const skip: Command = { type: 'skipWanderingCheck', by: 'gm' };

/** Players 1–3 in r1; player 1 wins initiative, so the order is 1, 2, 3. */
function crawling(danger: Danger = 'risky', players = 3) {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	for (let seat = 1; seat <= players; seat++) {
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: `p${seat}` }).state;
		state = run(state, { type: 'importCharacter', by: `p${seat}`, character, dungeon }).state;
	}
	const initiative = [15, ...Array.from({ length: players - 1 }, () => 5)];
	return run(state, { type: 'startCrawl', by: 'gm', danger }, dice(...initiative)).state;
}

/** Every player acts and the GM passes after each: the spotlight returns to the first player. */
function round(state: SessionState): { state: SessionState; events: EngineEvent[] } {
	const events: EngineEvent[] = [];
	for (const seat of state.crawl!.order) {
		state = run(state, action(`p${seat}`)).state;
		const passed = run(state, pass);
		state = passed.state;
		events.push(...passed.events);
	}
	return { state, events };
}

/** The crawl with a check due after the first round (deadly), the GM's turn after player 1. */
function checkDue(players = 3) {
	let state = round(crawling('deadly', players)).state;
	state = run(state, action('p1')).state;
	return state;
}

/** The GM's prompt, as the GM's page reads it from the crawl. */
const prompt = (state: SessionState) => state.crawl!.wanderingCheck ?? null;

describe('when a check comes due', () => {
	const cases: [Danger, number[]][] = [
		['unsafe', [3, 6]],
		['risky', [2, 4, 6]],
		['deadly', [1, 2, 3, 4, 5, 6]]
	];
	for (const [danger, expected] of cases) {
		it(`fires after every ${expected[0]} completed rounds when the crawl is ${danger}`, () => {
			let state = crawling(danger);
			const dueAfter: number[] = [];
			for (let i = 0; i < 6; i++) {
				const done = round(state);
				state = done.state;
				for (const e of dueEvents(done.events)) {
					if (e.type === 'wanderingCheckDue') dueAfter.push(e.round);
					state = run(state, skip).state;
				}
			}
			expect(dueAfter).toEqual(expected);
		});
	}

	it('comes with the round that completed it, and the round counter goes on', () => {
		let state = round(crawling('risky')).state;
		for (const seat of [1, 2]) state = run(run(state, action(`p${seat}`)).state, pass).state;
		state = run(state, action('p3')).state;
		const { state: next, events } = run(state, pass);

		expect(events).toContainEqual({ type: 'roundCompleted', round: 2 });
		expect(dueEvents(events)).toEqual([{ type: 'wanderingCheckDue', round: 2 }]);
		expect(next.crawl!.round).toBe(3);
		expect(prompt(next)).toBe('due');
	});

	it('logs nothing: the due check is the GM’s knowledge', () => {
		const { events } = round(crawling('deadly'));

		expect(entries(events).map((e) => e.kind)).not.toContain('challenge');
		expect(events.filter((e) => e.type === 'wanderingCheckDue')).toHaveLength(1);
	});

	it('doesn’t fire a second time while one is still waiting', () => {
		let state = round(crawling('deadly')).state;
		const { state: next, events } = round(state);
		state = next;

		expect(dueEvents(events)).toEqual([]);
		expect(prompt(state)).toBe('due');
	});

	it('is cleared by a new crawl', () => {
		const state = round(crawling('deadly')).state;
		const restarted = run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(15, 5, 5)).state;

		expect(prompt(restarted)).toBeNull();
	});
});

describe('setting the check as a committed roll', () => {
	it('goes by default to the next player in the spotlight order', () => {
		const { state, events } = run(checkDue(), setCheck());

		const challenge = { seat: 2, check: WANDERING_ROLL, dc: 0, edge: null, stakes: '', returnTo: 1 };
		expect(entries(events)).toEqual([{ at, kind: 'challenge', ...challenge }]);
		expect(state.crawl!.spotlight).toEqual({ kind: 'challenge', seat: 2, challenge });
		expect(prompt(state)).toBeNull();
	});

	it('wraps to the first player after the last one', () => {
		let state = round(crawling('deadly')).state;
		state = run(state, action('p1')).state;
		state = run(state, pass).state;
		state = run(state, action('p2')).state;
		state = run(state, pass).state;
		state = run(state, action('p3')).state;

		const { state: next } = run(state, setCheck());

		expect(next.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 1 });
	});

	it('is a 1d6 the player rolls in the open: a 1 brings a wandering monster', () => {
		let state = run(checkDue(), setCheck()).state;
		const { state: next, events } = run(state, { type: 'acceptChallenge', by: 'p2' }, dice(1));
		state = next;

		expect(entries(events)).toEqual([
			{ at, kind: 'committedRoll', seat: 2, roll: WANDERING_ROLL, result: 1, triggered: true }
		]);
	});

	it('anything above 1 brings nothing', () => {
		const state = run(checkDue(), setCheck()).state;
		const { events } = run(state, { type: 'acceptChallenge', by: 'p2' }, dice(2));

		expect(entries(events)).toMatchObject([{ kind: 'committedRoll', result: 2, triggered: false }]);
	});

	it('hands back to the GM turn it came from, so the next player still gets their turn', () => {
		let state = run(checkDue(), setCheck()).state;
		state = run(state, { type: 'acceptChallenge', by: 'p2' }, dice(4)).state;

		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
		state = run(state, pass).state;
		expect(state.crawl!.spotlight).toEqual({ kind: 'player', seat: 2 });
	});

	it('ticks no torch: rolling it isn’t a player action', () => {
		let state = checkDue();
		state = run(state, { type: 'lightTorch', by: 'p2' }, dice(5)).state;
		state = run(state, setCheck()).state;
		const { events } = run(state, { type: 'acceptChallenge', by: 'p2' }, dice(4));

		expect(events.map((e) => e.type)).not.toContain('playerActionCompleted');
	});

	it('can go to another player the GM picks', () => {
		const { state } = run(checkDue(), setCheck(3));

		expect(state.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 3, challenge: { returnTo: 1 } });
	});

	it('can go to the player who just acted, and then needs no detour', () => {
		let state = run(checkDue(), setCheck(1)).state;

		expect(state.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 1 });
		expect('returnTo' in (state.crawl!.spotlight as { challenge: object }).challenge).toBe(false);
		state = run(state, { type: 'acceptChallenge', by: 'p1' }, dice(6)).state;
		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('rolls right away for the player who just acted with pre-consent, and the GM’s turn goes on', () => {
		let state = round(crawling('deadly')).state;
		state = run(state, action('p1', true)).state;
		const { state: next, events } = run(state, setCheck(1), dice(1));

		expect(entries(events).map((e) => e.kind)).toEqual(['challenge', 'committedRoll']);
		expect(entries(events)[1]).toMatchObject({ seat: 1, result: 1, triggered: true });
		expect(next.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('asks the next player first: someone else’s pre-consent doesn’t cover them', () => {
		let state = round(crawling('deadly')).state;
		state = run(state, action('p1', true)).state;
		const { state: next } = run(state, setCheck());

		expect(next.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 2 });
	});

	it('a player who backs out also hands back to the GM turn it came from', () => {
		let state = run(checkDue(), setCheck()).state;
		const { state: next, events } = run(state, { type: 'declineChallenge', by: 'p2' });
		state = next;

		expect(entries(events)).toEqual([{ at, kind: 'declined', seat: 2 }]);
		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('a timed-out roll the GM skips hands back to the GM turn it came from', () => {
		let state = run(checkDue(), setCheck()).state;
		state = run(state, { type: 'turnTimerFired', clock: state.turnClock!.id, kind: 'timeout' }).state;
		state = run(state, { type: 'resolveTimeout', by: 'gm', resolution: 'skip' }).state;

		expect(state.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('a timed-out roll the GM plays rolls for the player', () => {
		let state = run(checkDue(), setCheck()).state;
		state = run(state, { type: 'turnTimerFired', clock: state.turnClock!.id, kind: 'timeout' }).state;
		const { state: next, events } = run(state, { type: 'resolveTimeout', by: 'gm', resolution: 'playAs' }, dice(3));

		expect(entries(events)).toMatchObject([{ kind: 'timeoutResolved' }, { kind: 'committedRoll', seat: 2, result: 3 }]);
		expect(next.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('works with a single player', () => {
		let state = checkDue(1);
		state = run(state, setCheck()).state;

		expect(state.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 1 });
		expect('returnTo' in (state.crawl!.spotlight as { challenge: object }).challenge).toBe(false);
	});

	it('is rejected outside the GM’s turn, from players, without a due check, or for a seat not in the crawl', () => {
		const due = checkDue();

		expect(reject(due, setCheck(undefined, 'p1'))).toBe('Only the GM decides on wandering monster checks.');
		expect(reject(due, setCheck(4))).toBe('Pick a player who is in the crawl.');
		const playersTurn = run(due, pass).state;
		expect(reject(playersTurn, setCheck())).toBe('You can set the check in your turn.');
		const notDue = run(crawling('deadly'), action('p1')).state;
		expect(reject(notDue, setCheck())).toBe('No wandering monster check is due.');
		const set = run(due, setCheck()).state;
		expect(reject(set, setCheck())).toBe('No wandering monster check is due.');
	});
});

describe('postponing and skipping', () => {
	it('postponing hides the prompt until the next round completes, then it is due again', () => {
		// Risky: due after round 2. Postponed, it comes back after round 3, off the regular rhythm.
		let state = crawling('risky');
		state = round(state).state;
		state = round(state).state;
		expect(prompt(state)).toBe('due');

		const postponed = run(state, postpone);
		state = postponed.state;
		expect(postponed.events).toEqual([{ type: 'wanderingCheckPostponed' }]);
		expect(prompt(state)).toBe('postponed');

		const third = round(state);
		state = third.state;
		expect(dueEvents(third.events)).toEqual([{ type: 'wanderingCheckDue', round: 3 }]);
		expect(prompt(state)).toBe('due');
		expect(state.crawl!.round).toBe(4);
	});

	it('a postponed check can still be set early', () => {
		const state = run(checkDue(), postpone).state;
		const { state: next } = run(state, setCheck());

		expect(next.crawl!.spotlight).toMatchObject({ kind: 'challenge', seat: 2 });
		expect(prompt(next)).toBeNull();
	});

	it('skipping drops the check; the next one comes at the regular rhythm', () => {
		let state = crawling('unsafe');
		for (let i = 0; i < 3; i++) state = round(state).state;
		const skipped = run(state, skip);
		state = skipped.state;
		expect(skipped.events).toEqual([{ type: 'wanderingCheckSkipped' }]);
		expect(prompt(state)).toBeNull();

		const rounds: number[] = [];
		for (let i = 0; i < 3; i++) {
			const done = round(state);
			state = done.state;
			rounds.push(...dueEvents(done.events).map((e) => (e.type === 'wanderingCheckDue' ? e.round : 0)));
		}
		expect(rounds).toEqual([6]);
		expect(state.crawl!.round).toBe(7);
	});

	it('works any time, also outside the GM’s turn, and moves no spotlight', () => {
		const state = run(checkDue(), pass).state;
		const { state: next, events } = run(state, skip);

		expect(next.crawl!.spotlight).toEqual(state.crawl!.spotlight);
		expect(events.map((e) => e.type)).not.toContain('spotlightChanged');
	});

	it('is rejected for players, without a due check, and postponing twice', () => {
		const due = checkDue();

		expect(reject(due, { type: 'skipWanderingCheck', by: 'p1' })).toBe('Only the GM decides on wandering monster checks.');
		expect(reject(crawling(), skip)).toBe('No wandering monster check is due.');
		expect(reject(crawling(), postpone)).toBe('No wandering monster check is due.');
		expect(reject(run(due, postpone).state, postpone)).toBe('The check is postponed already.');
	});
});

describe('wandering monsters', () => {
	it('the GM sees the dungeon’s wandering monsters, players don’t', () => {
		const state = crawling();

		expect(mapView(state, dungeon, 'gm').wandering).toEqual([
			{ index: 0, label: 'R', name: 'Giant rat', count: '1d4' },
			{ index: 1, label: 'B', name: 'Grave robber', count: '1d4' }
		]);
		expect(mapView(state, dungeon, 'player', 1).wandering).toEqual([]);
	});

	it('the GM can place one in any area', () => {
		const { state, events } = run(
			crawling(),
			{ type: 'placeMonster', by: 'gm', areaId: 'c1', index: 0, wandering: true, dungeon },
			dice()
		);

		expect(events).toEqual([{ type: 'monsterPlaced', id: 'R1', position: { area: 'c1', cell: { x: 5, y: 1 } } }]);
		expect(state.monsters![0]).toMatchObject({ id: 'R1', name: 'Giant rat', hp: 3, maxHp: 3, ac: 11 });
	});

	it('rejects a wandering monster the dungeon doesn’t have', () => {
		expect(reject(crawling(), { type: 'placeMonster', by: 'gm', areaId: 'c1', index: 2, wandering: true, dungeon })).toBe(
			'That wandering monster isn’t in the dungeon.'
		);
	});
});
