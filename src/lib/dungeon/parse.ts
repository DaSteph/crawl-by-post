/**
 * Dungeon file parser: JSON or YAML text → validated dungeon model, or a list
 * of errors that each say where the problem is (path, line and column).
 */
import { LineCounter, parseDocument, type Document } from 'yaml';
import { parseDice, type DiceFormula } from '../engine/dice.ts';
import {
	DANGER_LEVELS,
	EXIT_TYPES,
	RANGES,
	STATS,
	cellsOf,
	inRect,
	neighbour,
	type Ability,
	type Alignment,
	type Area,
	type Attack,
	type AttackOption,
	type Cell,
	type DangerLevel,
	type Dungeon,
	type Exit,
	type ExitType,
	type LocalizedText,
	type Monster,
	type Range,
	type Rect,
	type Side,
	type Stat
} from './model.ts';
import { parseStatblock, type StatblockFields } from './statblock.ts';

export type DungeonError = {
	/** Where in the file, e.g. `rooms[1] (r2).exits[0].to`. Empty for the whole file. */
	path: string;
	line: number | null;
	col: number | null;
	message: string;
};

export type ParseResult = { ok: true; dungeon: Dungeon } | { ok: false; errors: DungeonError[] };

type Path = (string | number)[];
type Obj = Record<string, unknown>;

const MAX_COORD = 999;
const ID = /^[a-z0-9-]+$/;
const LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]+)*$/i;
const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

class Context {
	errors: DungeonError[] = [];
	/** Default language first; null while `languages` itself is invalid. */
	languages: string[] | null = null;
	/** Area ids by their list position, so paths can say `rooms[1] (r2)`. */
	labels = new Map<string, string>();

	constructor(
		private doc: Document,
		private lines: LineCounter
	) {}

	error(path: Path, message: string, atKey = false): void {
		const pos = (atKey && this.locateKey(path)) || this.locate(path);
		this.errors.push({ path: this.format(path), line: pos?.line ?? null, col: pos?.col ?? null, message });
	}

	private locate(path: Path): { line: number; col: number } | null {
		for (let n = path.length; n >= 0; n--) {
			const node = this.doc.getIn(path.slice(0, n), true) as { range?: [number, number, number] } | undefined;
			if (node && typeof node === 'object' && node.range) return this.lines.linePos(node.range[0]);
		}
		return null;
	}

	/** Position of the key itself, for "unknown field" errors. */
	private locateKey(path: Path): { line: number; col: number } | null {
		const parent = this.doc.getIn(path.slice(0, -1), true) as { items?: { key?: { value?: unknown; range?: [number, number, number] } }[] } | undefined;
		const pair = parent?.items?.find((item) => item.key?.value === path[path.length - 1]);
		return pair?.key?.range ? this.lines.linePos(pair.key.range[0]) : null;
	}

	private format(path: Path): string {
		let out = '';
		path.forEach((segment, i) => {
			if (typeof segment === 'number') {
				out += `[${segment}]`;
				const label = this.labels.get(`${path[i - 1]}.${segment}`);
				if (i === 1 && label) out += ` (${label})`;
			} else out += out ? `.${segment}` : segment;
		});
		return out;
	}
}

function isObj(value: unknown): value is Obj {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

/** Checks that `value` is a map with only `allowed` keys and all `required` ones. */
function object(ctx: Context, value: unknown, path: Path, allowed: string[], required: string[]): Obj | null {
	if (!isObj(value)) {
		ctx.error(path, 'expected a map of fields');
		return null;
	}
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) ctx.error([...path, key], `unknown field "${key}" (allowed: ${allowed.join(', ')})`, true);
	}
	for (const key of required) {
		if (value[key] === undefined || value[key] === null) ctx.error(path, `"${key}" is missing`);
	}
	return value;
}

function list(ctx: Context, value: unknown, path: Path): unknown[] | null {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		ctx.error(path, 'expected a list');
		return null;
	}
	return value;
}

function nonEmptyString(ctx: Context, value: unknown, path: Path): string | null {
	if (typeof value === 'string' && value.trim()) return value.trim();
	ctx.error(path, 'expected text');
	return null;
}

function int(ctx: Context, value: unknown, path: Path, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
	if (isInt(value) && value >= min && value <= max) return value;
	ctx.error(path, `expected a whole number from ${min}${max < Number.MAX_SAFE_INTEGER ? ` to ${max}` : ''}`);
	return null;
}

function oneOf<T extends string>(ctx: Context, value: unknown, path: Path, options: readonly T[]): T | null {
	if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T;
	ctx.error(path, `expected one of ${options.join(', ')}`);
	return null;
}

function text(ctx: Context, value: unknown, path: Path): LocalizedText | null {
	const languages = ctx.languages;
	const fallback = languages?.[0];
	if (typeof value === 'string') {
		if (!value.trim()) {
			ctx.error(path, 'expected text');
			return null;
		}
		return { [fallback ?? 'en']: value.trim() };
	}
	if (!isObj(value)) {
		ctx.error(path, 'expected text, or one text per language like { en: ..., de: ... }');
		return null;
	}
	const result: LocalizedText = {};
	let ok = true;
	for (const [language, entry] of Object.entries(value)) {
		if (languages && !languages.includes(language)) {
			ctx.error([...path, language], `language "${language}" is not listed in "languages"`);
			ok = false;
		} else if (typeof entry !== 'string' || !entry.trim()) {
			ctx.error([...path, language], 'expected text');
			ok = false;
		} else result[language] = entry.trim();
	}
	if (fallback && value[fallback] === undefined) {
		ctx.error(path, `missing text for the default language "${fallback}"`);
		ok = false;
	}
	return ok && Object.keys(result).length ? result : null;
}

function optionalText(ctx: Context, value: unknown, path: Path): LocalizedText | null {
	return value === undefined || value === null ? null : text(ctx, value, path);
}

function dice(ctx: Context, value: unknown, path: Path, what: string): DiceFormula | null {
	const formula = typeof value === 'string' || typeof value === 'number' ? parseDice(value) : null;
	if (formula && (formula.count > 0 || formula.modifier >= 1)) return formula;
	const shown = typeof value === 'string' ? `"${value}"` : String(value);
	ctx.error(path, `${shown} is not ${what} (expected e.g. 3, 2d6, d8, 1d6+1)`);
	return null;
}

function cell(ctx: Context, value: unknown, path: Path): Cell | null {
	if (
		Array.isArray(value) &&
		value.length === 2 &&
		value.every((v) => isInt(v) && v >= 0 && v <= MAX_COORD)
	) {
		return { x: value[0], y: value[1] };
	}
	ctx.error(path, `expected a square like [3, 4] (whole numbers from 0 to ${MAX_COORD})`);
	return null;
}

// ---------------------------------------------------------------- monsters

const ATTACK_FIELDS = ['count', 'name', 'range', 'bonus', 'damage', 'effect'];

function attack(ctx: Context, value: unknown, path: Path): Attack | null {
	const o = object(ctx, value, path, ATTACK_FIELDS, ['name']);
	if (!o) return null;
	const name = o.name === undefined ? null : nonEmptyString(ctx, o.name, [...path, 'name']);
	const count = o.count === undefined ? 1 : int(ctx, o.count, [...path, 'count'], 1, 20);
	let range: Range[] | null = [];
	if (o.range !== undefined) {
		const parts = typeof o.range === 'string' ? o.range.split('/').map((r) => r.trim()) : null;
		if (parts?.every((r): r is Range => (RANGES as readonly string[]).includes(r))) range = parts;
		else {
			ctx.error([...path, 'range'], 'expected close, near, far or a combination like close/near');
			range = null;
		}
	}
	const bonus = o.bonus === undefined ? null : int(ctx, o.bonus, [...path, 'bonus'], -20, 30);
	const damage = o.damage === undefined ? null : dice(ctx, o.damage, [...path, 'damage'], 'a dice formula');
	const effect = o.effect === undefined ? null : nonEmptyString(ctx, o.effect, [...path, 'effect']);
	if (!name || count === null || range === null) return null;
	if ((o.bonus !== undefined && bonus === null) || (o.damage !== undefined && !damage)) return null;
	return { count, name, range, bonus, damage, effect };
}

function attacks(ctx: Context, value: unknown, path: Path): AttackOption[] | null {
	const options = list(ctx, value, path);
	if (!options) return null;
	const result: AttackOption[] = [];
	let ok = true;
	options.forEach((option, i) => {
		const together = Array.isArray(option) ? option : [option];
		if (together.length === 0) {
			ctx.error([...path, i], 'expected an attack, or a list of attacks made together');
			ok = false;
			return;
		}
		const parsed = together.map((a, j) => attack(ctx, a, Array.isArray(option) ? [...path, i, j] : [...path, i]));
		if (parsed.every((a): a is Attack => a !== null)) result.push(parsed);
		else ok = false;
	});
	return ok ? result : null;
}

const MONSTER_FIELDS = [
	'name',
	'label',
	'count',
	'statblock',
	'level',
	'ac',
	'armor',
	'hp',
	'attacks',
	'mv',
	'stats',
	'al',
	'abilities',
	'notes'
];

function monster(ctx: Context, value: unknown, path: Path): Monster | null {
	const o = object(ctx, value, path, MONSTER_FIELDS, ['name', 'label']);
	if (!o) return null;
	const errorsBefore = ctx.errors.length;
	const at = (key: string): Path => [...path, key];

	let base: Partial<StatblockFields> = {};
	if (o.statblock !== undefined) {
		if (typeof o.statblock !== 'string') ctx.error(at('statblock'), 'expected the stat line as text');
		else {
			const parsed = parseStatblock(o.statblock);
			if (parsed.ok) base = parsed.fields;
			else for (const message of parsed.errors) ctx.error(at('statblock'), message);
		}
	}

	const name = o.name === undefined ? null : text(ctx, o.name, at('name'));
	let label: string | null = null;
	if (o.label !== undefined) {
		if (typeof o.label === 'string' && /^[A-Za-z0-9]{1,3}$/.test(o.label)) label = o.label;
		else ctx.error(at('label'), 'expected 1 to 3 letters or digits, e.g. G');
	}
	const count = o.count === undefined ? parseDice(1) : dice(ctx, o.count, at('count'), 'a number or dice formula');

	const level = o.level !== undefined ? int(ctx, o.level, at('level'), 0, 30) : (base.level ?? null);
	const ac = o.ac !== undefined ? int(ctx, o.ac, at('ac'), 0, 30) : (base.ac ?? null);
	const armor =
		o.armor !== undefined ? nonEmptyString(ctx, o.armor, at('armor')) : (base.armor ?? null);
	const hp = o.hp !== undefined ? dice(ctx, o.hp, at('hp'), 'a number or dice formula') : (base.hp ?? null);
	const atk = o.attacks !== undefined ? attacks(ctx, o.attacks, at('attacks')) : (base.attacks ?? null);
	const mv = o.mv !== undefined ? nonEmptyString(ctx, o.mv, at('mv')) : (base.mv ?? null);
	const al =
		o.al !== undefined ? oneOf<Alignment>(ctx, o.al, at('al'), ['L', 'N', 'C']) : (base.al ?? null);

	const stats: Partial<Record<Stat, number>> = { ...base.stats };
	if (o.stats !== undefined) {
		const s = object(ctx, o.stats, at('stats'), [...STATS], []);
		if (s) {
			for (const key of STATS) {
				if (s[key] === undefined) continue;
				const v = int(ctx, s[key], [...path, 'stats', key], -10, 10);
				if (v !== null) stats[key] = v;
			}
		}
	}

	const abilities: Ability[] = [];
	list(ctx, o.abilities, at('abilities'))?.forEach((a, i) => {
		const p = [...path, 'abilities', i];
		const ab = object(ctx, a, p, ['name', 'text'], ['name', 'text']);
		if (!ab || ab.name === undefined || ab.text === undefined) return;
		const abName = text(ctx, ab.name, [...p, 'name']);
		const abText = text(ctx, ab.text, [...p, 'text']);
		if (abName && abText) abilities.push({ name: abName, text: abText });
	});
	const notes = optionalText(ctx, o.notes, at('notes'));

	// Only complain about missing stats when nothing else went wrong with them.
	if (ctx.errors.length === errorsBefore) {
		const missing = [
			level === null && 'level',
			ac === null && 'ac',
			mv === null && 'mv',
			(!atk || atk.length === 0) && 'attacks'
		].filter(Boolean);
		if (missing.length) {
			ctx.error(path, `${missing.map((m) => `"${m}"`).join(', ')} missing (give the fields or a "statblock")`);
		}
	}
	if (ctx.errors.length > errorsBefore) return null;
	return {
		name: name!,
		label: label!,
		count: count!,
		level: level!,
		ac: ac!,
		armor,
		hp,
		attacks: atk!,
		mv: mv!,
		stats,
		al,
		abilities,
		notes
	};
}

function monsters(ctx: Context, value: unknown, path: Path): Monster[] {
	const result: Monster[] = [];
	list(ctx, value, path)?.forEach((m, i) => {
		const parsed = monster(ctx, m, [...path, i]);
		if (parsed) result.push(parsed);
	});
	return result;
}

// ---------------------------------------------------------------- areas and exits

type RawExit = { exit: Omit<Exit, 'implicit'>; path: Path };
type PlacedArea = { area: Area; path: Path; geometryKey: string };

const ROOM_FIELDS = ['id', 'name', 'rect', 'mood', 'notes', 'exits', 'monsters'];
const CORRIDOR_FIELDS = ['id', 'name', 'from', 'to', 'mood', 'notes', 'exits'];
const EXIT_FIELDS = ['at', 'side', 'to', 'type'];

function rect(ctx: Context, value: unknown, path: Path): Rect | null {
	const o = object(ctx, value, path, ['x', 'y', 'w', 'h'], ['x', 'y', 'w', 'h']);
	if (!o) return null;
	const x = o.x === undefined ? null : int(ctx, o.x, [...path, 'x'], 0, MAX_COORD);
	const y = o.y === undefined ? null : int(ctx, o.y, [...path, 'y'], 0, MAX_COORD);
	const w = o.w === undefined ? null : int(ctx, o.w, [...path, 'w'], 1, MAX_COORD);
	const h = o.h === undefined ? null : int(ctx, o.h, [...path, 'h'], 1, MAX_COORD);
	if (x === null || y === null || w === null || h === null) return null;
	return { x, y, w, h };
}

function exits(ctx: Context, value: unknown, path: Path, from: string): RawExit[] {
	const result: RawExit[] = [];
	list(ctx, value, path)?.forEach((e, i) => {
		const p = [...path, i];
		const o = object(ctx, e, p, EXIT_FIELDS, EXIT_FIELDS);
		if (!o || EXIT_FIELDS.some((k) => o[k] === undefined)) return;
		const at = cell(ctx, o.at, [...p, 'at']);
		const side = oneOf<Side>(ctx, o.side, [...p, 'side'], SIDES);
		const to = typeof o.to === 'string' && o.to ? o.to : null;
		if (!to) ctx.error([...p, 'to'], 'expected the id of a room or corridor segment');
		const type = oneOf<ExitType>(ctx, o.type, [...p, 'type'], EXIT_TYPES);
		if (at && side && to && type) result.push({ exit: { from, to, at, side, type }, path: p });
	});
	return result;
}

function areaId(ctx: Context, value: unknown, path: Path): string | null {
	if (typeof value === 'string' && ID.test(value)) return value;
	ctx.error(path, 'expected an id made of lowercase letters, digits and dashes, e.g. r1');
	return null;
}

/** One key per wall edge, the same from both sides. */
function edgeKey(at: Cell, side: Side): string {
	if (side === 'w') return `${at.x - 1},${at.y},e`;
	if (side === 'n') return `${at.x},${at.y - 1},s`;
	return `${at.x},${at.y},${side}`;
}

function describe(area: Area): string {
	return `${area.kind === 'room' ? 'room' : 'corridor'} ${area.id}`;
}

// ---------------------------------------------------------------- entry point

const TOP_FIELDS = ['name', 'languages', 'start', 'danger', 'rooms', 'corridors', 'wandering'];

export function parseDungeon(source: string, id: string): ParseResult {
	const result = parse(source, id);
	if (result.ok) return result;
	// In file order; errors on the same line keep the order they were found in.
	const line = (e: DungeonError) => e.line ?? Number.MAX_SAFE_INTEGER;
	return { ok: false, errors: [...result.errors].sort((a, b) => line(a) - line(b)) };
}

function parse(source: string, id: string): ParseResult {
	const lines = new LineCounter();
	const doc = parseDocument(source, { lineCounter: lines });
	if (doc.errors.length) {
		return {
			ok: false,
			errors: doc.errors.map((e) => ({
				path: '',
				line: e.linePos?.[0].line ?? null,
				col: e.linePos?.[0].col ?? null,
				message: `the file is not valid YAML or JSON: ${e.message.split('\n')[0]}`
			}))
		};
	}
	const ctx = new Context(doc, lines);
	const root = doc.toJS();
	if (root === null || root === undefined) {
		return { ok: false, errors: [{ path: '', line: null, col: null, message: 'the file is empty' }] };
	}
	const top = object(ctx, root, [], TOP_FIELDS, ['name', 'languages', 'start', 'rooms']);
	if (!top) return { ok: false, errors: ctx.errors };

	// Languages first: every text field is checked against them.
	if (top.languages !== undefined) {
		const langs = top.languages;
		if (
			Array.isArray(langs) &&
			langs.length > 0 &&
			langs.every((l) => typeof l === 'string' && LANGUAGE.test(l)) &&
			new Set(langs).size === langs.length
		) {
			ctx.languages = langs as string[];
		} else {
			ctx.error(['languages'], 'expected a list of different language codes, e.g. [en, de]');
		}
	}

	const name = top.name === undefined ? null : text(ctx, top.name, ['name']);
	const danger =
		top.danger === undefined || top.danger === null
			? null
			: oneOf<DangerLevel>(ctx, top.danger, ['danger'], DANGER_LEVELS);

	const wandering = monsters(ctx, top.wandering, ['wandering']);

	// Areas
	const placed: PlacedArea[] = [];
	const rawExits: RawExit[] = [];
	const roomList = list(ctx, top.rooms, ['rooms']);
	if (roomList && roomList.length === 0) ctx.error(['rooms'], 'a dungeon needs at least one room');
	const corridorList = list(ctx, top.corridors, ['corridors']);
	for (const [key, entries] of [
		['rooms', roomList],
		['corridors', corridorList]
	] as const) {
		entries?.forEach((entry, i) => {
			if (isObj(entry) && typeof entry.id === 'string') ctx.labels.set(`${key}.${i}`, entry.id);
		});
	}

	roomList?.forEach((entry, i) => {
		const p: Path = ['rooms', i];
		const o = object(ctx, entry, p, ROOM_FIELDS, ['id', 'name', 'rect']);
		if (!o) return;
		const id = o.id === undefined ? null : areaId(ctx, o.id, [...p, 'id']);
		const roomName = o.name === undefined ? null : text(ctx, o.name, [...p, 'name']);
		const r = o.rect === undefined ? null : rect(ctx, o.rect, [...p, 'rect']);
		const mood = optionalText(ctx, o.mood, [...p, 'mood']);
		const notes = optionalText(ctx, o.notes, [...p, 'notes']);
		const ms = monsters(ctx, o.monsters, [...p, 'monsters']);
		if (id) rawExits.push(...exits(ctx, o.exits, [...p, 'exits'], id));
		if (id && roomName && r) {
			placed.push({
				area: { id, kind: 'room', name: roomName, rect: r, mood, notes, monsters: ms },
				path: p,
				geometryKey: 'rect'
			});
		}
	});

	corridorList?.forEach((entry, i) => {
		const p: Path = ['corridors', i];
		const o = object(ctx, entry, p, CORRIDOR_FIELDS, ['id', 'from', 'to']);
		if (!o) return;
		const id = o.id === undefined ? null : areaId(ctx, o.id, [...p, 'id']);
		const segName = optionalText(ctx, o.name, [...p, 'name']);
		const from = o.from === undefined ? null : cell(ctx, o.from, [...p, 'from']);
		const to = o.to === undefined ? null : cell(ctx, o.to, [...p, 'to']);
		const mood = optionalText(ctx, o.mood, [...p, 'mood']);
		const notes = optionalText(ctx, o.notes, [...p, 'notes']);
		if (id) rawExits.push(...exits(ctx, o.exits, [...p, 'exits'], id));
		if (!id || !from || !to) return;
		if (from.x !== to.x && from.y !== to.y) {
			ctx.error([...p, 'to'], `a segment must be straight: [${from.x}, ${from.y}] and [${to.x}, ${to.y}] share neither x nor y`);
			return;
		}
		const r: Rect = {
			x: Math.min(from.x, to.x),
			y: Math.min(from.y, to.y),
			w: Math.abs(from.x - to.x) + 1,
			h: Math.abs(from.y - to.y) + 1
		};
		placed.push({
			area: { id, kind: 'corridor', name: segName, rect: r, mood, notes, monsters: [] },
			path: p,
			geometryKey: 'from'
		});
	});

	// Unique ids
	const byId = new Map<string, Area>();
	const usable: PlacedArea[] = [];
	for (const p of placed) {
		const existing = byId.get(p.area.id);
		if (existing) ctx.error([...p.path, 'id'], `the id "${p.area.id}" is already used by ${describe(existing)}`);
		else {
			byId.set(p.area.id, p.area);
			usable.push(p);
		}
	}

	// Overlaps
	const owner = new Map<string, Area>();
	const key = (c: Cell) => `${c.x},${c.y}`;
	for (const p of usable) {
		const clash = cellsOf(p.area.rect).find((c) => owner.has(key(c)));
		if (clash) {
			const other = owner.get(key(clash))!;
			ctx.error([...p.path, p.geometryKey], `overlaps ${describe(other)} at [${clash.x}, ${clash.y}]`);
			continue;
		}
		for (const c of cellsOf(p.area.rect)) owner.set(key(c), p.area);
	}

	const declaredIds = new Set(ctx.labels.values());

	// Start
	if (top.start !== undefined) {
		const start = byId.get(String(top.start));
		const declared = declaredIds.has(String(top.start));
		// A declared area that failed to parse already has its own error.
		if (!start && declared) {
			/* nothing to add */
		} else if (typeof top.start !== 'string' || !start) ctx.error(['start'], `room "${String(top.start)}" doesn't exist`);
		else if (start && start.kind !== 'room') ctx.error(['start'], `"${top.start}" is a corridor segment, the start must be a room`);
	}

	// Exits
	const exitsByEdge = new Map<string, Exit>();
	for (const { exit, path } of rawExits) {
		const from = byId.get(exit.from);
		const to = byId.get(exit.to);
		if (!from) continue; // its own area failed to parse; that error is already reported
		if (!inRect(exit.at, from.rect)) {
			ctx.error([...path, 'at'], `[${exit.at.x}, ${exit.at.y}] is not a square of ${describe(from)}`);
			continue;
		}
		if (!to) {
			// A declared area that failed to parse already has its own error.
			if (!declaredIds.has(exit.to)) ctx.error([...path, 'to'], `leads to "${exit.to}", which doesn't exist`);
			continue;
		}
		if (to === from) {
			ctx.error([...path, 'to'], `leads back into ${describe(from)} itself`);
			continue;
		}
		const beyond = neighbour(exit.at, exit.side);
		if (!inRect(beyond, to.rect)) {
			const actual = owner.get(key(beyond));
			ctx.error(
				[...path, 'side'],
				`the square on the ${exit.side} side of [${exit.at.x}, ${exit.at.y}] is [${beyond.x}, ${beyond.y}], ` +
					(actual ? `which belongs to ${describe(actual)}, not ${exit.to}` : `which is not part of ${exit.to}`)
			);
			continue;
		}
		const edge = edgeKey(exit.at, exit.side);
		const existing = exitsByEdge.get(edge);
		if (existing) {
			ctx.error(path, `this connection is already declared on ${existing.from}; declare it on one side only`);
			continue;
		}
		exitsByEdge.set(edge, { ...exit, implicit: false });
	}

	// Corridor segments that touch end to end connect openly.
	for (const area of byId.values()) {
		if (area.kind !== 'corridor') continue;
		const r = area.rect;
		const ends = [
			{ x: r.x, y: r.y },
			{ x: r.x + r.w - 1, y: r.y + r.h - 1 }
		];
		for (const end of ends) {
			for (const side of SIDES) {
				const other = owner.get(key(neighbour(end, side)));
				if (!other || other === area || other.kind !== 'corridor') continue;
				const edge = edgeKey(end, side);
				if (!exitsByEdge.has(edge)) {
					exitsByEdge.set(edge, { from: area.id, to: other.id, at: end, side, type: 'open', implicit: true });
				}
			}
		}
	}

	if (ctx.errors.length || !name || !ctx.languages || typeof top.start !== 'string') {
		return { ok: false, errors: ctx.errors };
	}

	return {
		ok: true,
		dungeon: {
			id,
			name,
			languages: ctx.languages,
			start: top.start,
			danger,
			areas: [...byId.values()],
			exits: [...exitsByEdge.values()],
			wandering
		}
	};
}

export function formatError(e: DungeonError): string {
	const where = e.line !== null ? `line ${e.line}, col ${e.col}` : '';
	return [where, e.path ? `${e.path}: ${e.message}` : e.message].filter(Boolean).join(' · ');
}
