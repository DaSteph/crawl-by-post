import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import { applyCommand, type Command, type EngineEvent, type SessionState } from './index.ts';
import { spotlightHolder, type LogEntry } from './turns.ts';
import { timeoutAt } from './timeouts.ts';

const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');
const hero = imported.character;

/** A fixed clock that the test moves forward, and dice that return the given results in order. */
function table() {
	let now = Date.parse('2026-11-27T12:00:00Z');
	const rolls: number[] = [];
	const deps = {
		dice: (sides: number) => {
			const next = rolls.shift();
			if (next === undefined) throw new Error(`unexpected d${sides} roll`);
			return next;
		},
		now: () => new Date(now)
	};
	type Table = {
		state: SessionState | null;
		roll: (...results: number[]) => void;
		advanceHours: (hours: number) => void;
		run: (command: Command) => EngineEvent[];
		reject: (command: Command) => string;
		jobs: Map<number, { reminderAt: string | null; timeoutAt: string }>;
		track: (events: EngineEvent[]) => EngineEvent[];
		do: (command: Command) => EngineEvent[];
		clock: () => number;
		fire: (kind: 'reminder' | 'timeout', clock?: number) => EngineEvent[];
	};
	const t: Table = {
		state: null,
		roll: (...results) => void rolls.push(...results),
		advanceHours: (hours) => void (now += hours * 3600_000),
		run(command: Command): EngineEvent[] {
			const result = applyCommand(t.state, command, deps);
			if (!result.ok) throw new Error(result.reason);
			t.state = result.state;
			return result.events;
		},
		reject(command: Command): string {
			const result = applyCommand(t.state, command, deps);
			if (result.ok) throw new Error(`expected ${command.type} to be rejected`);
			return result.reason;
		},
		/** The jobs the server would hold, by clock: what `turnTimerStarted` schedules and `turnTimerStopped` cancels. */
		jobs: new Map<number, { reminderAt: string | null; timeoutAt: string }>(),
		track(events: EngineEvent[]) {
			for (const e of events) {
				if (e.type === 'turnTimerStarted') t.jobs.set(e.clock, { reminderAt: e.reminderAt, timeoutAt: e.timeoutAt });
				if (e.type === 'turnTimerStopped') t.jobs.delete(e.clock);
			}
			return events;
		},
		do(command: Command) {
			return t.track(t.run(command));
		},
		clock: () => t.state!.turnClock!.id,
		fire: (kind: 'reminder' | 'timeout', clock = t.clock()) => t.do({ type: 'turnTimerFired', clock, kind })
	};
	return t;
}

/** Two players in a crawl; player 1 won initiative and holds the spotlight. */
function crawling() {
	const t = table();
	t.do({ type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon });
	for (const i of [1, 2]) {
		t.do({ type: 'addPlayerSlot', by: 'gm', secret: `p${i}` });
		t.do({ type: 'importCharacter', by: `p${i}`, character: { ...hero, name: `Hero${i}` }, dungeon });
	}
	t.roll(18, 3);
	t.do({ type: 'startCrawl', by: 'gm', danger: 'risky' });
	return t;
}

const entries = (events: EngineEvent[]): Omit<LogEntry, 'at'>[] =>
	events.flatMap((e) => {
		if (e.type !== 'logged') return [];
		const { at: _, ...rest } = e.entry;
		return [rest];
	});

const types = (events: EngineEvent[]) => events.map((e) => e.type);

describe('the turn clock', () => {
	it('starts with the crawl: reminder at half time, timeout after 24 hours by default', () => {
		const t = crawling();
		expect([...t.jobs.values()]).toEqual([
			{ reminderAt: '2026-11-28T00:00:00.000Z', timeoutAt: '2026-11-28T12:00:00.000Z' }
		]);
		expect(timeoutAt(t.state!)?.toISOString()).toBe('2026-11-28T12:00:00.000Z');
	});

	it('restarts with every spotlight change and cancels the jobs of the turn before', () => {
		const t = crawling();
		const first = t.clock();
		t.advanceHours(2);
		const events = t.do({ type: 'postAction', by: 'p1', text: 'I listen at the door.' });

		expect(events).toContainEqual({ type: 'turnTimerStopped', clock: first });
		expect([...t.jobs.entries()]).toEqual([
			[first + 1, { reminderAt: '2026-11-28T02:00:00.000Z', timeoutAt: '2026-11-28T14:00:00.000Z' }]
		]);
	});

	it('keeps running through posts that don’t move the spotlight', () => {
		const t = crawling();
		const clock = t.clock();
		const events = t.do({ type: 'postChat', by: 'p2', text: 'brb' });
		expect(types(events)).not.toContain('turnTimerStarted');
		expect(t.clock()).toBe(clock);
	});

	it('keeps counting across a new crawl, so jobs of the old crawl can never match', () => {
		const t = crawling();
		const old = t.clock();
		t.roll(5, 19);
		t.do({ type: 'startCrawl', by: 'gm', danger: 'deadly' });
		expect(t.clock()).toBe(old + 1);
		expect(t.fire('timeout', old)).toEqual([]);
	});
});

describe('setting the timeout', () => {
	it('lets the GM set whole hours, logs it, and moves the running turn’s deadline from its start', () => {
		const t = crawling();
		t.advanceHours(3);
		const events = t.do({ type: 'setTurnTimeout', by: 'gm', hours: 48 });

		expect(entries(events)).toEqual([{ kind: 'timeoutChanged', hours: 48 }]);
		expect([...t.jobs.values()]).toEqual([
			{ reminderAt: '2026-11-28T12:00:00.000Z', timeoutAt: '2026-11-29T12:00:00.000Z' }
		]);
	});

	it('applies to every later turn, GM and players alike', () => {
		const t = crawling();
		t.do({ type: 'setTurnTimeout', by: 'gm', hours: 6 });
		t.do({ type: 'postAction', by: 'p1', text: 'I search the altar.' });
		expect([...t.jobs.values()]).toEqual([
			{ reminderAt: '2026-11-27T15:00:00.000Z', timeoutAt: '2026-11-27T18:00:00.000Z' }
		]);
	});

	it('fires right away when the shorter timeout has already passed, and skips a reminder that is due in the past', () => {
		const t = crawling();
		t.advanceHours(5);
		t.do({ type: 'setTurnTimeout', by: 'gm', hours: 4 });
		expect([...t.jobs.values()]).toEqual([{ reminderAt: null, timeoutAt: '2026-11-27T17:00:00.000Z' }]);
	});

	it('works before the crawl starts, and rejects players and odd values', () => {
		const t = table();
		t.do({ type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon });
		t.do({ type: 'addPlayerSlot', by: 'gm', secret: 'p1' });
		expect(types(t.do({ type: 'setTurnTimeout', by: 'gm', hours: 12 }))).toEqual(['logged', 'turnTimeoutChanged']);
		expect(t.reject({ type: 'setTurnTimeout', by: 'p1', hours: 12 })).toMatch(/Only the GM/);
		expect(t.reject({ type: 'setTurnTimeout', by: 'gm', hours: 0 })).toMatch(/from 1 to 168/);
		expect(t.reject({ type: 'setTurnTimeout', by: 'gm', hours: 1.5 })).toMatch(/whole number/);
		expect(t.reject({ type: 'setTurnTimeout', by: 'gm', hours: 169 })).toMatch(/from 1 to 168/);
	});
});

describe('the reminder', () => {
	it('is due for whoever holds the spotlight', () => {
		const t = crawling();
		expect(t.fire('reminder')).toEqual([{ type: 'turnReminderDue', holder: 1 }]);
		t.do({ type: 'postAction', by: 'p1', text: 'I open the door.' });
		expect(t.fire('reminder')).toEqual([{ type: 'turnReminderDue', holder: 'gm' }]);
	});
});

describe('a GM timeout', () => {
	it('passes the spotlight to the next player by itself', () => {
		const t = crawling();
		t.do({ type: 'postAction', by: 'p1', text: 'I open the door.' });
		t.advanceHours(24);
		const events = t.fire('timeout');

		expect(entries(events)).toEqual([{ kind: 'pass', timedOut: true }]);
		expect(events).toContainEqual({ type: 'spotlightChanged', spotlight: { kind: 'player', seat: 2 } });
		expect(spotlightHolder(t.state!)).toBe(2);
		expect(types(events)).toContain('turnTimerStarted');
		expect(types(events)).not.toContain('playerActionCompleted');
	});
});

describe('a player timeout', () => {
	function timedOut() {
		const t = crawling();
		t.advanceHours(24);
		const events = t.fire('timeout');
		return { t, events };
	}

	it('keeps the spotlight with the player, logs it, and asks the GM to decide', () => {
		const { t, events } = timedOut();
		expect(entries(events)).toEqual([{ kind: 'timedOut', seat: 1 }]);
		expect(events).toContainEqual({ type: 'playerTimedOut', seat: 1 });
		expect(spotlightHolder(t.state!)).toBe(1);
		expect(t.state!.turnClock?.timedOut).toBe(true);
		expect(timeoutAt(t.state!)).toBeNull();
	});

	it('skip: completes the player’s action and gives the GM their turn', () => {
		const { t } = timedOut();
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'skip' });

		expect(entries(events)).toEqual([{ kind: 'timeoutResolved', seat: 1, resolution: 'skip' }]);
		expect(events).toContainEqual({ type: 'playerActionCompleted', seat: 1 });
		expect(t.state!.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
		expect(t.state!.turnClock?.timedOut).toBeUndefined();
	});

	it('wait: gives the player a fresh full timeout', () => {
		const { t } = timedOut();
		t.advanceHours(3);
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'wait' });

		expect(entries(events)).toEqual([{ kind: 'timeoutResolved', seat: 1, resolution: 'wait' }]);
		expect(types(events)).not.toContain('playerActionCompleted');
		expect(spotlightHolder(t.state!)).toBe(1);
		expect([...t.jobs.values()]).toEqual([
			{ reminderAt: '2026-11-29T03:00:00.000Z', timeoutAt: '2026-11-29T15:00:00.000Z' }
		]);
	});

	it('play-as: posts the GM’s text as the player’s action, marked, and completes it', () => {
		const { t } = timedOut();
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'playAs', text: 'Hero1 keeps watch.' });

		expect(entries(events)).toEqual([
			{ kind: 'timeoutResolved', seat: 1, resolution: 'playAs' },
			{ kind: 'action', seat: 1, text: 'Hero1 keeps watch.', playedByGm: true }
		]);
		expect(events).toContainEqual({ type: 'playerActionCompleted', seat: 1 });
		expect(t.state!.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('play-as needs a post; only the GM decides, and only while a turn is waiting', () => {
		const { t } = timedOut();
		expect(t.reject({ type: 'resolveTimeout', by: 'gm', resolution: 'playAs', text: '  ' })).toMatch(/Write something/);
		expect(t.reject({ type: 'resolveTimeout', by: 'p1', resolution: 'skip' })).toMatch(/Only the GM/);
		t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'skip' });
		expect(t.reject({ type: 'resolveTimeout', by: 'gm', resolution: 'skip' })).toMatch(/No turn is waiting/);
	});

	it('ends the prompt when the player comes back and acts after all', () => {
		const { t } = timedOut();
		const events = t.do({ type: 'postAction', by: 'p1', text: 'Sorry! I light a torch.' });
		expect(events).toContainEqual({ type: 'playerActionCompleted', seat: 1 });
		expect(t.state!.turnClock?.timedOut).toBeUndefined();
		expect(t.reject({ type: 'resolveTimeout', by: 'gm', resolution: 'skip' })).toMatch(/No turn is waiting/);
	});

	it('fires only once: later jobs for the timed-out clock are ignored', () => {
		const { t } = timedOut();
		expect(t.fire('timeout')).toEqual([]);
		expect(t.fire('reminder')).toEqual([]);
	});
});

describe('a timeout on a challenge or damage turn', () => {
	/** The GM has set a STR test for player 1, who hasn't answered. */
	function challenged() {
		const t = crawling();
		t.do({ type: 'postAction', by: 'p1', text: 'I force the gate.' });
		t.do({ type: 'setChallenge', by: 'gm', check: { type: 'test', ability: 'STR' }, dc: 12, edge: null, stakes: '' });
		t.fire('timeout');
		return t;
	}

	it('play-as rolls for the player; an accept turn is not a player action', () => {
		const t = challenged();
		t.roll(15);
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'playAs' });
		expect(entries(events).map((e) => e.kind)).toEqual(['timeoutResolved', 'roll']);
		expect(types(events)).not.toContain('playerActionCompleted');
		expect(t.state!.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('skip hands the turn back to the GM without a roll', () => {
		const t = challenged();
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'skip' });
		expect(entries(events).map((e) => e.kind)).toEqual(['timeoutResolved']);
		expect(types(events)).not.toContain('playerActionCompleted');
		expect(t.state!.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});

	it('play-as on a damage turn rolls the damage', () => {
		const t = crawling();
		t.do({ type: 'postAction', by: 'p1', text: 'I attack.' });
		t.do({ type: 'setChallenge', by: 'gm', check: { type: 'attack', weapon: 0 }, dc: 10, edge: null, stakes: '' });
		t.roll(18);
		t.do({ type: 'acceptChallenge', by: 'p1' });
		t.fire('timeout');
		t.roll(...Array(10).fill(3));
		const events = t.do({ type: 'resolveTimeout', by: 'gm', resolution: 'playAs' });
		expect(entries(events).map((e) => e.kind)).toEqual(['timeoutResolved', 'damage']);
		expect(t.state!.crawl!.spotlight).toEqual({ kind: 'gm', afterSeat: 1 });
	});
});
