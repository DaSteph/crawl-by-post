/**
 * The dungeon model: what a parsed dungeon file turns into.
 * See .scratch/crawl-by-post-mvp/dungeon-format.md for the file format.
 */
import type { DiceFormula } from '../engine/dice.ts';

/** Text per language code. Always contains the dungeon's default language. */
export type LocalizedText = Record<string, string>;

export type Side = 'n' | 'e' | 's' | 'w';
export type Cell = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const EXIT_TYPES = ['open', 'door', 'locked', 'secret', 'portcullis'] as const;
export type ExitType = (typeof EXIT_TYPES)[number];

export const DANGER_LEVELS = ['unsafe', 'risky', 'deadly'] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];

export const RANGES = ['close', 'near', 'far'] as const;
export type Range = (typeof RANGES)[number];

export const STATS = ['s', 'd', 'c', 'i', 'w', 'ch'] as const;
export type Stat = (typeof STATS)[number];

export type Alignment = 'L' | 'N' | 'C';

export type Attack = {
	count: number;
	name: string;
	/** Empty means melee. */
	range: Range[];
	bonus: number | null;
	damage: DiceFormula | null;
	effect: string | null;
};

/** Attacks made together ("and"). A monster picks one option per turn ("or"). */
export type AttackOption = Attack[];

export type Ability = { name: LocalizedText; text: LocalizedText };

export type Monster = {
	name: LocalizedText;
	label: string;
	count: DiceFormula;
	level: number;
	ac: number;
	armor: string | null;
	/** Null means "roll level × d8 + CON modifier, at least 1", the book's rule. */
	hp: DiceFormula | null;
	attacks: AttackOption[];
	mv: string;
	stats: Partial<Record<Stat, number>>;
	al: Alignment | null;
	abilities: Ability[];
	notes: LocalizedText | null;
};

/** A room or a corridor segment: the unit that is revealed, hidden, lit or dark. */
export type Area = {
	id: string;
	kind: 'room' | 'corridor';
	name: LocalizedText | null;
	/** Corridor segments are one square wide, so they are rects too. */
	rect: Rect;
	mood: LocalizedText | null;
	notes: LocalizedText | null;
	monsters: Monster[];
};

/** A connection on the wall between square `at` of area `from` and its neighbour on `side`. */
export type Exit = {
	from: string;
	to: string;
	at: Cell;
	side: Side;
	type: ExitType;
	/** True for the open joint where corridor segments touch, which the file doesn't declare. */
	implicit: boolean;
};

export type Dungeon = {
	id: string;
	name: LocalizedText;
	/** The first one is the default language. */
	languages: string[];
	start: string;
	danger: DangerLevel | null;
	areas: Area[];
	exits: Exit[];
	wandering: Monster[];
};

export const SIDE_OFFSETS: Record<Side, Cell> = {
	n: { x: 0, y: -1 },
	e: { x: 1, y: 0 },
	s: { x: 0, y: 1 },
	w: { x: -1, y: 0 }
};

export function neighbour(cell: Cell, side: Side): Cell {
	const d = SIDE_OFFSETS[side];
	return { x: cell.x + d.x, y: cell.y + d.y };
}

export function cellsOf(rect: Rect): Cell[] {
	const cells: Cell[] = [];
	for (let y = rect.y; y < rect.y + rect.h; y++) {
		for (let x = rect.x; x < rect.x + rect.w; x++) cells.push({ x, y });
	}
	return cells;
}

export function inRect(cell: Cell, rect: Rect): boolean {
	return (
		cell.x >= rect.x && cell.x < rect.x + rect.w && cell.y >= rect.y && cell.y < rect.y + rect.h
	);
}

/** Picks the text for `language`, falling back to the dungeon's default language. */
export function localize(text: LocalizedText, language: string, defaultLanguage: string): string {
	return text[language] ?? text[defaultLanguage];
}
