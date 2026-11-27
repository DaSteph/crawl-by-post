/**
 * Server adapter: loads session state, runs the engine, and persists the new
 * state plus its events in one transaction.
 */
import { randomBytes, randomInt } from 'node:crypto';
import {
	applyCommand,
	resolveVisitor,
	sheets,
	type Command,
	type CommandResult,
	type Deps,
	type SessionState,
	type Sheet,
	type Visitor
} from '#lib/engine/index.ts';
import { importShadowdarklings } from '#lib/character/import.ts';
import { mapView, type MapView } from '#lib/engine/map.ts';
import { people, type LogRecord, type Person } from '#lib/engine/log.ts';
import type { Crawl, Danger, LogEntry } from '#lib/engine/turns.ts';
import type { Cell, Dungeon } from '#lib/dungeon/model.ts';
import { db } from './db.ts';
import { loadDungeon } from './dungeons.ts';

const deps: Deps = {
	dice: (sides) => randomInt(1, sides + 1),
	now: () => new Date()
};

function newToken(bytes: number): string {
	return randomBytes(bytes).toString('base64url');
}

async function run(sessionId: string, command: Command, isNew: boolean): Promise<CommandResult> {
	const client = await db().connect();
	try {
		await client.query('BEGIN');
		let state: SessionState | null = null;
		if (!isNew) {
			const { rows } = await client.query<{ state: SessionState }>(
				'SELECT state FROM sessions WHERE id = $1 FOR UPDATE',
				[sessionId]
			);
			if (rows.length === 0) {
				await client.query('ROLLBACK');
				return { ok: false, reason: 'No such session.' };
			}
			state = rows[0].state;
		}

		const result = applyCommand(state, command, deps);
		if (!result.ok) {
			await client.query('ROLLBACK');
			return result;
		}

		await client.query(
			`INSERT INTO sessions (id, state) VALUES ($1, $2)
			 ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
			[sessionId, result.state]
		);
		for (const event of result.events) {
			await client.query('INSERT INTO events (session_id, type, payload) VALUES ($1, $2, $3)', [
				sessionId,
				event.type,
				event
			]);
		}
		await client.query('COMMIT');
		return result;
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

export async function createSession(
	name: string,
	dungeonId: string
): Promise<{ ok: true; sessionId: string; gmSecret: string } | { ok: false; reason: string }> {
	const loaded = await loadDungeon(dungeonId);
	if (!loaded.ok) return { ok: false, reason: 'Pick a dungeon from the list.' };
	const sessionId = newToken(12);
	const gmSecret = newToken(24);
	const result = await run(
		sessionId,
		{ type: 'createSession', sessionId, name, gmSecret, dungeon: loaded.dungeon },
		true
	);
	return result.ok ? { ok: true, sessionId, gmSecret } : result;
}

export async function addPlayerSlot(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'addPlayerSlot', by: bySecret, secret: newToken(24) }, false);
}

async function currentDungeonId(sessionId: string): Promise<string | null> {
	const { rows } = await db().query<{ state: SessionState }>('SELECT state FROM sessions WHERE id = $1', [sessionId]);
	return rows[0]?.state.dungeonId ?? null;
}

export type ImportOutcome = { ok: true } | { ok: false; errors: string[] };

/** Parses a Shadowdarklings export and imports it for the player holding `bySecret`. */
export async function importCharacter(sessionId: string, bySecret: string, source: string): Promise<ImportOutcome> {
	const parsed = importShadowdarklings(source);
	if (!parsed.ok) return parsed;
	const dungeonId = await currentDungeonId(sessionId);
	const loaded = dungeonId ? await loadDungeon(dungeonId) : null;
	if (!loaded?.ok) return { ok: false, errors: ['The dungeon is unavailable right now. Ask your GM.'] };
	const result = await run(
		sessionId,
		{ type: 'importCharacter', by: bySecret, character: parsed.character, dungeon: loaded.dungeon },
		false
	);
	return result.ok ? { ok: true } : { ok: false, errors: [result.reason] };
}

export async function editInventory(sessionId: string, bySecret: string, inventory: string): Promise<CommandResult> {
	return run(sessionId, { type: 'editInventory', by: bySecret, inventory }, false);
}

export async function startCrawl(sessionId: string, bySecret: string, danger: Danger): Promise<CommandResult> {
	return run(sessionId, { type: 'startCrawl', by: bySecret, danger }, false);
}

export async function postAction(sessionId: string, bySecret: string, text: string): Promise<CommandResult> {
	return run(sessionId, { type: 'postAction', by: bySecret, text }, false);
}

export async function postChat(sessionId: string, bySecret: string, text: string): Promise<CommandResult> {
	return run(sessionId, { type: 'postChat', by: bySecret, text }, false);
}

export async function passSpotlight(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'passSpotlight', by: bySecret }, false);
}

/** Runs a command that needs the session's dungeon model. */
async function runWithDungeon(
	sessionId: string,
	command: (dungeon: Dungeon) => Command
): Promise<CommandResult> {
	const dungeonId = await currentDungeonId(sessionId);
	const loaded = dungeonId ? await loadDungeon(dungeonId) : null;
	if (!loaded?.ok) return { ok: false, reason: 'The dungeon is unavailable right now.' };
	return run(sessionId, command(loaded.dungeon), false);
}

export async function moveToken(sessionId: string, bySecret: string, to: Cell): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({ type: 'moveToken', by: bySecret, to, dungeon }));
}

export async function setAreaRevealed(
	sessionId: string,
	bySecret: string,
	areaId: string,
	revealed: boolean
): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({ type: 'setAreaRevealed', by: bySecret, areaId, revealed, dungeon }));
}

/** How much of the log a page load brings. Older entries stay in the database. */
const LOG_WINDOW = 300;

async function loadLog(sessionId: string): Promise<LogRecord[]> {
	const { rows } = await db().query<{ id: string; payload: { entry: LogEntry } }>(
		`SELECT id, payload FROM events WHERE session_id = $1 AND type = 'logged' ORDER BY id DESC LIMIT $2`,
		[sessionId, LOG_WINDOW]
	);
	return rows.reverse().map((r) => ({ id: Number(r.id), entry: r.payload.entry }));
}

/** The map, or why it can't be shown. File errors are for the GM only. */
export type MapLoad = { ok: true; view: MapView } | { ok: false; errors: string[] | null };

export type SessionView =
	| {
			visitor: Exclude<Visitor, { role: 'unknown' }>;
			players: SessionState['players'] | null;
			sheets: Sheet[];
			map: MapLoad;
			crawl: Crawl | null;
			people: Person[];
			log: LogRecord[];
	  }
	| { visitor: { role: 'unknown' } };

async function loadMap(state: SessionState, visitor: Exclude<Visitor, { role: 'unknown' }>): Promise<MapLoad> {
	const role = visitor.role;
	// Sessions created before dungeons existed have no dungeon id.
	const loaded = state.dungeonId ? await loadDungeon(state.dungeonId) : null;
	if (loaded?.ok) return { ok: true, view: mapView(state, loaded.dungeon, role, visitor.role === 'player' ? visitor.seat : undefined) };
	if (role !== 'gm') return { ok: false, errors: null };
	if (!loaded) return { ok: false, errors: ['This session has no dungeon.'] };
	if (loaded.reason === 'missing') return { ok: false, errors: [`The dungeon file "${state.dungeonId}" is missing.`] };
	return { ok: false, errors: loaded.errors };
}

/** What the holder of `secret` may see. Player secrets are only shown to the GM. */
export async function loadSessionView(sessionId: string, secret: string): Promise<SessionView> {
	const { rows } = await db().query<{ state: SessionState }>(
		'SELECT state FROM sessions WHERE id = $1',
		[sessionId]
	);
	if (rows.length === 0) return { visitor: { role: 'unknown' } };
	const state = rows[0].state;
	const visitor = resolveVisitor(state, secret);
	if (visitor.role === 'unknown') return { visitor };
	return {
		visitor,
		players: visitor.role === 'gm' ? state.players : null,
		sheets: sheets(state, secret),
		map: await loadMap(state, visitor),
		crawl: state.crawl ?? null,
		people: people(state),
		log: await loadLog(sessionId)
	};
}
