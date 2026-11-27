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
import type { CheckChoice, Edge } from '#lib/engine/challenges.ts';
import { db } from './db.ts';
import { loadDungeon } from './dungeons.ts';
import { pushAfterCommand } from './push.ts';
import { applyTimerEvents, type TurnTimerJob } from './jobs.ts';
import { timeoutAt, turnTimeoutHours, type TimeoutResolution } from '#lib/engine/timeouts.ts';
import type { HpChange } from '#lib/engine/monsters.ts';
import type { AreaLight } from '#lib/engine/light.ts';

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
		// A rejected command, or one that changed nothing (a timer for a turn that is over), leaves no trace.
		if (!result.ok || result.events.length === 0) {
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
		await applyTimerEvents(client, sessionId, result.events);
		await client.query('COMMIT');
		pushAfterCommand(result.state, result.events, 'by' in command ? command.by : null);
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

export async function startCombat(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'startCombat', by: bySecret }, false);
}

/** Ends the fight and starts a new crawl at `danger`. */
export async function endCombat(sessionId: string, bySecret: string, danger: Danger): Promise<CommandResult> {
	return run(sessionId, { type: 'endCombat', by: bySecret, danger }, false);
}

export async function postAction(
	sessionId: string,
	bySecret: string,
	text: string,
	preConsent: boolean
): Promise<CommandResult> {
	return run(sessionId, { type: 'postAction', by: bySecret, text, preConsent }, false);
}

export async function setChallenge(
	sessionId: string,
	bySecret: string,
	challenge: { check: CheckChoice; dc: number; edge: Edge; stakes: string }
): Promise<CommandResult> {
	return run(sessionId, { type: 'setChallenge', by: bySecret, ...challenge }, false);
}

export async function answerChallenge(sessionId: string, bySecret: string, accept: boolean): Promise<CommandResult> {
	return run(sessionId, { type: accept ? 'acceptChallenge' : 'declineChallenge', by: bySecret }, false);
}

export async function rollDamage(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'rollDamage', by: bySecret }, false);
}

export async function postChat(sessionId: string, bySecret: string, text: string): Promise<CommandResult> {
	return run(sessionId, { type: 'postChat', by: bySecret, text }, false);
}

export async function passSpotlight(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'passSpotlight', by: bySecret }, false);
}

export async function setTurnTimeout(sessionId: string, bySecret: string, hours: number): Promise<CommandResult> {
	return run(sessionId, { type: 'setTurnTimeout', by: bySecret, hours }, false);
}

export async function resolveTimeout(
	sessionId: string,
	bySecret: string,
	resolution: TimeoutResolution,
	text: string
): Promise<CommandResult> {
	return run(sessionId, { type: 'resolveTimeout', by: bySecret, resolution, text }, false);
}

/** Called by the job worker when a turn timer comes due. */
export async function fireTurnTimer(job: TurnTimerJob): Promise<void> {
	const result = await run(job.sessionId, { type: 'turnTimerFired', clock: job.clock, kind: job.kind }, false);
	if (!result.ok && result.reason !== 'No such session.') console.error('Turn timer failed:', result.reason);
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

export async function setLanguage(sessionId: string, bySecret: string, language: string): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({ type: 'setLanguage', by: bySecret, language, dungeon }));
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

/** With `wandering`, `index` is one of the dungeon's wandering monsters, placed in `areaId`. */
export async function placeMonster(
	sessionId: string,
	bySecret: string,
	areaId: string,
	index: number,
	wandering = false
): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({
		type: 'placeMonster',
		by: bySecret,
		areaId,
		index,
		...(wandering ? { wandering } : {}),
		dungeon
	}));
}

export async function moveMonster(sessionId: string, bySecret: string, id: string, to: Cell): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({ type: 'moveMonster', by: bySecret, id, to, dungeon }));
}

export async function removeMonster(sessionId: string, bySecret: string, id: string): Promise<CommandResult> {
	return run(sessionId, { type: 'removeMonster', by: bySecret, id }, false);
}

export async function setMonsterHp(
	sessionId: string,
	bySecret: string,
	id: string,
	hp: number,
	maxHp: number
): Promise<CommandResult> {
	return run(sessionId, { type: 'setMonsterHp', by: bySecret, id, hp, maxHp }, false);
}

/** Confirms the HP change `id` (with `amount` when the GM changed it), or dismisses it. */
export async function ruleOnHpChange(
	sessionId: string,
	bySecret: string,
	id: number,
	confirm: boolean,
	amount?: number
): Promise<CommandResult> {
	return run(
		sessionId,
		confirm ? { type: 'confirmHpChange', by: bySecret, id, amount } : { type: 'dismissHpChange', by: bySecret, id },
		false
	);
}

export async function monsterAttack(
	sessionId: string,
	bySecret: string,
	attack: { id: string; option: number; seat: number; edge: Edge }
): Promise<CommandResult> {
	return run(sessionId, { type: 'monsterAttack', by: bySecret, ...attack }, false);
}

export async function setCharacterHp(sessionId: string, bySecret: string, seat: number, hp: number): Promise<CommandResult> {
	return run(sessionId, { type: 'setCharacterHp', by: bySecret, seat, hp }, false);
}

export async function lightTorch(sessionId: string, bySecret: string): Promise<CommandResult> {
	return run(sessionId, { type: 'lightTorch', by: bySecret }, false);
}

export async function setLightCounter(sessionId: string, bySecret: string, id: number, counter: number): Promise<CommandResult> {
	return run(sessionId, { type: 'setLightCounter', by: bySecret, id, counter }, false);
}

export async function setAreaLight(
	sessionId: string,
	bySecret: string,
	areaId: string,
	light: AreaLight | null
): Promise<CommandResult> {
	return runWithDungeon(sessionId, (dungeon) => ({ type: 'setAreaLight', by: bySecret, areaId, light, dungeon }));
}

export type WanderingDecision = { decision: 'set'; seat?: number } | { decision: 'postpone' } | { decision: 'skip' };

export async function decideWanderingCheck(sessionId: string, bySecret: string, d: WanderingDecision): Promise<CommandResult> {
	const command: Command =
		d.decision === 'set'
			? { type: 'setWanderingCheck', by: bySecret, ...(d.seat ? { seat: d.seat } : {}) }
			: { type: d.decision === 'postpone' ? 'postponeWanderingCheck' : 'skipWanderingCheck', by: bySecret };
	return run(sessionId, command, false);
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

/**
 * The turn clock as the page shows it: the session's timeout, when the current
 * turn runs out, and whether a timed-out player turn waits for the GM.
 */
export type TurnTimer = { hours: number; timeoutAt: string | null; timedOut: boolean };

/** The map, or why it can't be shown. File errors are for the GM only. */
export type MapLoad = { ok: true; view: MapView } | { ok: false; errors: string[] | null };

export type SessionView =
	| {
			visitor: Exclude<Visitor, { role: 'unknown' }>;
			players: SessionState['players'] | null;
			sheets: Sheet[];
			map: MapLoad;
			crawl: Crawl | null;
			timer: TurnTimer;
			/** Damage waiting for the GM's confirmation; empty for players. */
			hpChanges: HpChange[];
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

/** True when `secret` is a current GM or player link of the session. */
export async function isParticipant(sessionId: string, secret: string): Promise<boolean> {
	const { rows } = await db().query<{ state: SessionState }>('SELECT state FROM sessions WHERE id = $1', [sessionId]);
	return rows.length > 0 && resolveVisitor(rows[0].state, secret).role !== 'unknown';
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
		timer: {
			hours: turnTimeoutHours(state),
			timeoutAt: timeoutAt(state)?.toISOString() ?? null,
			timedOut: Boolean(state.crawl && state.turnClock?.timedOut)
		},
		hpChanges: visitor.role === 'gm' ? (state.hpChanges ?? []) : [],
		people: people(state),
		log: await loadLog(sessionId)
	};
}
