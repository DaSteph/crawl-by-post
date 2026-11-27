/**
 * How the log reads: spotlight posts, rolls and events stand on their own,
 * while runs of out-of-turn chat collapse into one "+N chat messages" block.
 */
import { initials } from '../character/model.ts';
import type { SessionState, TokenColour } from './index.ts';
import type { LogEntry } from './turns.ts';

/** A stored log entry with its position in the session log. */
export type LogRecord = { id: number; entry: LogEntry };

export type LogBlock = { kind: 'entry'; record: LogRecord } | { kind: 'chat'; records: LogRecord[] };

/** Chat runs shorter than this stay inline (quiet, but readable without a tap). */
export const CHAT_COLLAPSE_FROM = 2;

/** Posts longer than this are cut off with "read more". */
export const LONG_POST = 300;

export function groupLog(records: LogRecord[]): LogBlock[] {
	const blocks: LogBlock[] = [];
	let run: LogRecord[] = [];
	const flush = () => {
		if (run.length >= CHAT_COLLAPSE_FROM) blocks.push({ kind: 'chat', records: run });
		else for (const record of run) blocks.push({ kind: 'entry', record });
		run = [];
	};
	for (const record of records) {
		if (record.entry.kind === 'chat') {
			run.push(record);
			continue;
		}
		flush();
		blocks.push({ kind: 'entry', record });
	}
	flush();
	return blocks;
}

/**
 * The log entry that ended `who`'s last spotlight turn, or null if they've had none
 * in `records`. A player's turn ends with their own action post (not one the GM
 * played for them); the GM's with a response, a pass of their own, or a challenge
 * handed to a player. Challenge and damage turns don't count: they are short
 * interruptions, and the next summary still shows what came of them.
 */
export function lastTurnEnd(records: LogRecord[], who: 'gm' | number): number | null {
	const ended = (e: LogEntry) =>
		who === 'gm'
			? e.kind === 'response' || (e.kind === 'pass' && !e.timedOut) || e.kind === 'challenge'
			: e.kind === 'action' && e.seat === who && !e.playedByGm;
	return records.findLast((r) => ended(r.entry))?.id ?? null;
}

/** What a turn summary keeps: spotlight posts, challenges and rolls, HP changes, reveals, light and fights. */
const SUMMARY_KINDS = new Set<LogEntry['kind']>([
	'action',
	'response',
	'initiative',
	'challenge',
	'roll',
	'committedRoll',
	'declined',
	'damage',
	'monsterAttack',
	'monsterHurt',
	'characterHurt',
	'dying',
	'revealed',
	'torchLit',
	'torchOut',
	'combatStarted',
	'combatEnded'
]);

/**
 * Everything since `lastTurn` (the id from `lastTurnEnd`; null means the whole of
 * `records`), filtered to what matters for the next move. All chat in the range
 * becomes one collapsed block at the end, however short.
 */
export function turnSummary(records: LogRecord[], lastTurn: number | null): LogBlock[] {
	const since = lastTurn === null ? records : records.filter((r) => r.id > lastTurn);
	const blocks: LogBlock[] = since
		.filter((r) => SUMMARY_KINDS.has(r.entry.kind))
		.map((record) => ({ kind: 'entry', record }));
	const chat = since.filter((r) => r.entry.kind === 'chat');
	if (chat.length) blocks.push({ kind: 'chat', records: chat });
	return blocks;
}

/** What the log needs to show a seat: its token look and character name. */
export type Person = { seat: number; tokenColour: TokenColour; initials: string; name: string };

export function people(state: SessionState): Person[] {
	return state.players.map((p) => ({
		seat: p.seat,
		tokenColour: p.tokenColour,
		initials: p.character ? initials(p.character.name) : `P${p.seat}`,
		name: p.character?.name ?? `Player ${p.seat}`
	}));
}
