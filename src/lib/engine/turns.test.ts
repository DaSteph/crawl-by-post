import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { importShadowdarklings } from '../character/import.ts';
import type { Character } from '../character/model.ts';
import { applyCommand, type Command, type Deps, type EngineEvent, type SessionState } from './index.ts';
import { groupLog, type LogRecord } from './log.ts';
import { mapView } from './map.ts';
import { spotlightHolder, type LogEntry } from './turns.ts';

const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const imported = importShadowdarklings(readFileSync('src/lib/character/fixtures/gelan-ranger.json', 'utf8'));
if (!imported.ok) throw new Error('the fixture must import');
const base = imported.character;

function withDex(name: string, modifier: number): Character {
	return { ...base, name, abilities: { ...base.abilities, DEX: { score: 10 + 2 * modifier, modifier } } };
}

/** Dice that return the given results in order, failing loudly when they run out. */
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

function run(state: SessionState | null, command: Command, deps: Deps = noDice) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

/** A session with `dexMods.length` players, each imported with that DEX modifier. */
function table(...dexMods: number[]) {
	let state = run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
	dexMods.forEach((mod, i) => {
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: `p${i + 1}` }).state;
		state = run(state, {
			type: 'importCharacter',
			by: `p${i + 1}`,
			character: withDex(`Hero${i + 1}`, mod),
			dungeon
		}).state;
	});
	return state;
}

const entries = (events: EngineEvent[]): LogEntry[] =>
	events.flatMap((e) => (e.type === 'logged' ? [e.entry] : []));

describe('starting a crawl', () => {
	it('rolls d20 + DEX for every character, locks the results into the log and gives the winner the spotlight', () => {
		const { state, events } = run(table(1, 0, 2), { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(10, 15, 9));

		expect(entries(events)).toEqual([
			{ at: '2026-11-27T12:00:00.000Z', kind: 'crawlStarted', danger: 'risky' },
			{
				at: '2026-11-27T12:00:00.000Z',
				kind: 'initiative',
				rolls: [
					{ seat: 1, d20: 10, modifier: 1, total: 11 },
					{ seat: 2, d20: 15, modifier: 0, total: 15 },
					{ seat: 3, d20: 9, modifier: 2, total: 11 }
				],
				rollOffs: [],
				winner: 2
			}
		]);
		expect(state.crawl).toEqual({
			danger: 'risky',
			order: [2, 3, 1],
			round: 1,
			spotlight: { kind: 'player', seat: 2 }
		});
		expect(events).toContainEqual({ type: 'spotlightChanged', spotlight: { kind: 'player', seat: 2 } });
	});

	it('breaks a tie for the top with plain d20 roll-offs until one character wins', () => {
		const { state, events } = run(table(0, 0, 0), { type: 'startCrawl', by: 'gm', danger: 'unsafe' }, dice(12, 12, 3, 7, 7, 4, 18));

		expect(entries(events)[1]).toMatchObject({
			rollOffs: [
				[
					{ seat: 1, d20: 7 },
					{ seat: 2, d20: 7 }
				],
				[
					{ seat: 1, d20: 4 },
					{ seat: 2, d20: 18 }
				]
			],
			winner: 2
		});
		expect(state.crawl?.order).toEqual([2, 3, 1]);
	});

	it('leaves seats without a character out of the turn order', () => {
		let state = table(0, 0);
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: 'p3' }).state;

		const crawl = run(state, { type: 'startCrawl', by: 'gm', danger: 'deadly' }, dice(5, 6)).state.crawl;

		expect(crawl?.order).toEqual([2, 1]);
	});

	it('only lets the GM start a crawl, and only once someone has a character', () => {
		let empty = run(null, { type: 'createSession', sessionId: 's1', name: 'C', gmSecret: 'gm', dungeon }).state;
		empty = run(empty, { type: 'addPlayerSlot', by: 'gm', secret: 'p1' }).state;

		expect(applyCommand(table(0), { type: 'startCrawl', by: 'p1', danger: 'risky' }, dice(5)).ok).toBe(false);
		expect(applyCommand(empty, { type: 'startCrawl', by: 'gm', danger: 'risky' }, noDice)).toEqual({
			ok: false,
			reason: 'At least one player needs to import a character first.'
		});
	});
});

describe('the spotlight', () => {
	/** Three players; seat 2 wins initiative, so the order is 2, 3, 1. */
	const crawling = () => run(table(0, 0, 0), { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(5, 15, 10)).state;

	it('goes winner → GM → next player in seat order → GM → …, completing a round back at the winner', () => {
		let state = crawling();
		const seen: (string | number | null)[] = [spotlightHolder(state)];
		const rounds: number[] = [];
		const steps: Command[] = [
			{ type: 'postAction', by: 'p2', text: 'I check the altar.' },
			{ type: 'passSpotlight', by: 'gm' },
			{ type: 'postAction', by: 'p3', text: 'I guard the door.' },
			{ type: 'postAction', by: 'gm', text: 'Nothing stirs.' },
			{ type: 'postAction', by: 'p1', text: 'I light a torch.' },
			{ type: 'passSpotlight', by: 'gm' }
		];
		for (const command of steps) {
			const result = run(state, command);
			state = result.state;
			seen.push(spotlightHolder(state));
			for (const e of result.events) if (e.type === 'roundCompleted') rounds.push(e.round);
		}

		expect(seen).toEqual([2, 'gm', 3, 'gm', 1, 'gm', 2]);
		expect(rounds).toEqual([1]);
		expect(state.crawl?.round).toBe(2);
	});

	it('logs spotlight posts, GM responses, passes and the start of a new round', () => {
		let state = table(0);
		state = run(state, { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(8)).state;
		const action = run(state, { type: 'postAction', by: 'p1', text: '  I listen at the door.  ' });
		const response = run(action.state, { type: 'postAction', by: 'gm', text: 'Scraping, then silence.' });
		const second = run(response.state, { type: 'postAction', by: 'p1', text: 'I open it.' });
		const pass = run(second.state, { type: 'passSpotlight', by: 'gm' });

		expect(entries(action.events)).toMatchObject([{ kind: 'action', seat: 1, text: 'I listen at the door.' }]);
		expect(entries(response.events)).toMatchObject([
			{ kind: 'response', text: 'Scraping, then silence.' },
			{ kind: 'round', round: 2 }
		]);
		expect(entries(pass.events)).toMatchObject([{ kind: 'pass' }, { kind: 'round', round: 3 }]);
	});

	it('only lets the spotlight holder post an action', () => {
		const state = crawling();

		expect(applyCommand(state, { type: 'postAction', by: 'p1', text: 'Me!' }, noDice).ok).toBe(false);
		expect(applyCommand(state, { type: 'postAction', by: 'gm', text: 'Wait.' }, noDice).ok).toBe(false);
		expect(applyCommand(state, { type: 'passSpotlight', by: 'gm' }, noDice)).toEqual({
			ok: false,
			reason: 'It’s not your turn.'
		});
	});

	it('only lets the GM pass', () => {
		const state = run(crawling(), { type: 'postAction', by: 'p2', text: 'Done.' }).state;

		expect(applyCommand(state, { type: 'passSpotlight', by: 'p2' }, noDice).ok).toBe(false);
	});

	it('rejects actions before the crawl starts and empty posts', () => {
		expect(applyCommand(table(0), { type: 'postAction', by: 'p1', text: 'Go' }, noDice).ok).toBe(false);
		expect(applyCommand(crawling(), { type: 'postAction', by: 'p2', text: '   ' }, noDice)).toEqual({
			ok: false,
			reason: 'Write something first.'
		});
	});

	it('never blocks a long post below the hard cap', () => {
		const state = crawling();

		expect(applyCommand(state, { type: 'postAction', by: 'p2', text: 'x'.repeat(1200) }, noDice).ok).toBe(true);
		expect(applyCommand(state, { type: 'postAction', by: 'p2', text: 'x'.repeat(4001) }, noDice).ok).toBe(false);
	});

	it('rings the spotlight token on the map', () => {
		const tokens = mapView(crawling(), dungeon, 'player').tokens;

		expect(tokens.map((t) => [t.seat, t.spotlight])).toEqual([
			[1, false],
			[2, true],
			[3, false]
		]);
	});
});

describe('chat', () => {
	it('is accepted from anyone at any time, marked as quiet chat, and leaves the spotlight alone', () => {
		const state = run(table(0, 0), { type: 'startCrawl', by: 'gm', danger: 'risky' }, dice(3, 9)).state;

		const fromPlayer = run(state, { type: 'postChat', by: 'p1', text: 'Careful, Hero2!' });
		const fromGm = run(state, { type: 'postChat', by: 'gm', text: 'Take your time.' });
		const beforeCrawl = run(table(0), { type: 'postChat', by: 'p1', text: 'Ready when you are.' });

		expect(entries(fromPlayer.events)).toMatchObject([{ kind: 'chat', author: 1, text: 'Careful, Hero2!' }]);
		expect(entries(fromGm.events)).toMatchObject([{ kind: 'chat', author: 'gm' }]);
		expect(beforeCrawl.events).toHaveLength(1);
		expect(fromPlayer.state).toBe(state);
		expect(applyCommand(state, { type: 'postChat', by: 'stranger', text: 'hi' }, noDice).ok).toBe(false);
	});
});

describe('the log', () => {
	const at = '2026-11-27T12:00:00.000Z';
	const chat = (id: number): LogRecord => ({ id, entry: { at, kind: 'chat', author: 1, text: `c${id}` } });
	const action = (id: number): LogRecord => ({ id, entry: { at, kind: 'action', seat: 1, text: `a${id}` } });

	it('collapses runs of chat and keeps a single chat message inline', () => {
		const blocks = groupLog([action(1), chat(2), chat(3), chat(4), action(5), chat(6)]);

		expect(blocks.map((b) => (b.kind === 'chat' ? `+${b.records.length}` : b.record.id))).toEqual([1, '+3', 5, 6]);
	});
});
