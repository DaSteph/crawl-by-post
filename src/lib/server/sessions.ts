/**
 * Server adapter: loads session state, runs the engine, and persists the new
 * state plus its events in one transaction.
 */
import { randomBytes, randomInt } from 'node:crypto';
import {
	applyCommand,
	resolveVisitor,
	type Command,
	type CommandResult,
	type Deps,
	type SessionState,
	type Visitor
} from '#lib/engine/index.ts';
import { mapView, type MapView } from '#lib/engine/map.ts';
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

/** The map, or why it can't be shown. File errors are for the GM only. */
export type MapLoad = { ok: true; view: MapView } | { ok: false; errors: string[] | null };

export type SessionView =
	| {
			visitor: Exclude<Visitor, { role: 'unknown' }>;
			players: SessionState['players'] | null;
			map: MapLoad;
	  }
	| { visitor: { role: 'unknown' } };

async function loadMap(state: SessionState, role: 'gm' | 'player'): Promise<MapLoad> {
	// Sessions created before dungeons existed have no dungeon id.
	const loaded = state.dungeonId ? await loadDungeon(state.dungeonId) : null;
	if (loaded?.ok) return { ok: true, view: mapView(state, loaded.dungeon, role) };
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
		map: await loadMap(state, visitor.role)
	};
}
