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
