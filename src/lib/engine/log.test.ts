import { describe, expect, it } from 'vitest';
import { lastTurnEnd, turnSummary, type LogBlock, type LogRecord } from './log.ts';
import type { LogEntry } from './turns.ts';

const at = '2026-11-27T12:00:00.000Z';

/** A log entry without its timestamp. */
type Bare = LogEntry extends infer E ? (E extends unknown ? Omit<E, 'at'> : never) : never;

/** Numbers the entries 1, 2, 3, … as the session log would. */
function log(...entries: Bare[]): LogRecord[] {
	return entries.map((e, i) => ({ id: i + 1, entry: { at, ...e } }));
}

const shape = (blocks: LogBlock[]) =>
	blocks.map((b) => (b.kind === 'chat' ? `+${b.records.map((r) => r.id).join(',')}` : b.record.id));

const ref = { id: 'G1', name: 'Goblin' };
const roll: Bare = {
	kind: 'roll',
	seat: 1,
	check: { type: 'test', ability: 'DEX' },
	edge: null,
	d20s: [12],
	d20: 12,
	modifier: 1,
	total: 13,
	dc: 12,
	success: true
};

describe('the end of the last turn', () => {
	const records = log(
		{ kind: 'action', seat: 1, text: 'I open the door' }, // 1
		{ kind: 'response', text: 'It creaks' }, // 2
		{ kind: 'action', seat: 2, text: 'I follow' }, // 3
		{ kind: 'challenge', seat: 2, check: { type: 'test', ability: 'DEX' }, dc: 12, edge: null, stakes: '' }, // 4
		{ ...roll, seat: 2 }, // 5
		{ kind: 'pass', timedOut: true }, // 6
		{ kind: 'action', seat: 1, text: 'played', playedByGm: true }, // 7
		{ kind: 'chat', author: 1, text: 'sorry, was away' } // 8
	);

	it('is a player’s own last action post, not one the GM played for them', () => {
		expect(lastTurnEnd(records, 1)).toBe(1);
		expect(lastTurnEnd(records, 2)).toBe(3);
	});

	it('is the GM’s last response, own pass or challenge, not a timed-out pass', () => {
		expect(lastTurnEnd(records, 'gm')).toBe(4);
		expect(lastTurnEnd(log({ kind: 'response', text: 'x' }, { kind: 'pass' }), 'gm')).toBe(2);
	});

	it('is null before the first turn', () => {
		expect(lastTurnEnd(records, 3)).toBeNull();
		expect(lastTurnEnd([], 'gm')).toBeNull();
	});
});

describe('the turn summary', () => {
	const records = log(
		{ kind: 'action', seat: 1, text: 'I open the door' }, // 1: the player's last turn
		{ kind: 'chat', author: 2, text: 'nice' }, // 2
		{ kind: 'revealed', areaId: 'r2' }, // 3
		{ kind: 'response', text: 'A goblin!' }, // 4
		{ kind: 'round', round: 2 }, // 5
		{ kind: 'action', seat: 2, text: 'I light a torch' }, // 6
		{ kind: 'torchLit', seat: 2 }, // 7
		{ kind: 'chat', author: 'gm', text: 'ok' }, // 8
		{ kind: 'pass' }, // 9
		{ kind: 'doorway', seat: 2 }, // 10
		{ kind: 'timeoutChanged', hours: 12 }, // 11
		{ kind: 'combatStarted' }, // 12
		{ kind: 'initiative', rolls: [], rollOffs: [], winner: 1 }, // 13
		{ kind: 'monsterAttack', monster: ref, seat: 1, ac: 13, edge: null, strikes: [] }, // 14
		{ kind: 'characterHurt', seat: 1, amount: 3 }, // 15
		{ kind: 'dying', seat: 1 }, // 16
		{ kind: 'torchOut', seat: 2 }, // 17
		{ kind: 'chat', author: 3, text: 'oof' } // 18
	);

	it('keeps spotlight posts, rolls, HP changes, reveals and torch events after the last turn, in order', () => {
		expect(shape(turnSummary(records, 1))).toEqual([3, 4, 6, 7, 12, 13, 14, 15, 16, 17, '+2,8,18']);
	});

	it('collapses all chat in the range into one block at the end, even a single message', () => {
		const blocks = turnSummary(records, 16);
		expect(shape(blocks)).toEqual([17, '+18']);
	});

	it('keeps challenges, rolls, damage and monster HP', () => {
		const fight = log(
			{ kind: 'response', text: 'x' }, // 1
			{ kind: 'challenge', seat: 1, check: { type: 'test', ability: 'DEX' }, dc: 12, edge: null, stakes: '' }, // 2
			roll, // 3
			{ kind: 'declined', seat: 2 }, // 4
			{ kind: 'damage', seat: 1, weapon: 'Longsword', formula: '1d8', rolls: [5], modifier: 0, total: 5 }, // 5
			{ kind: 'monsterHurt', monster: ref, condition: 'wounded' }, // 6
			{ kind: 'committedRoll', seat: 1, roll: { type: 'committedRoll', purpose: 'wandering', sides: 6, on: 1 }, result: 4, triggered: false }, // 7
			{ kind: 'combatEnded' }, // 8
			{ kind: 'crawlStarted', danger: 'risky' } // 9
		);
		expect(shape(turnSummary(fight, 1))).toEqual([2, 3, 4, 5, 6, 7, 8]);
	});

	it('covers the whole log before the first turn and is empty right after one', () => {
		expect(shape(turnSummary(records, null))[0]).toBe(1);
		expect(turnSummary(records, 18)).toEqual([]);
	});

	it('gives the GM everything since their last turn', () => {
		const table = log(
			{ kind: 'response', text: 'You see a door' }, // 1
			{ kind: 'chat', author: 1, text: 'hm' }, // 2
			{ kind: 'action', seat: 1, text: 'I open it' } // 3
		);
		expect(shape(turnSummary(table, lastTurnEnd(table, 'gm')))).toEqual([3, '+2']);
	});
});
