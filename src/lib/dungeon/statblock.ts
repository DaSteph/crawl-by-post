/**
 * Parses the one-line Shadowdark stat block, e.g.
 * `AC 13 (leather + shield), HP 4, ATK 1 club +1 (1d4) or 1 shortbow (far) +0 (1d4),
 *  MV near, S +1, D +1, C +0, I -1, W +0, Ch -1, AL C, LV 1`.
 */
import { parseDice, type DiceFormula } from '../engine/dice.ts';
import { RANGES, type Alignment, type Attack, type AttackOption, type Range, type Stat } from './model.ts';

export type StatblockFields = {
	level: number;
	ac: number;
	armor: string | null;
	hp: DiceFormula;
	attacks: AttackOption[];
	mv: string;
	stats: Partial<Record<Stat, number>>;
	al: Alignment;
};

export type StatblockResult =
	| { ok: true; fields: Partial<StatblockFields> }
	| { ok: false; errors: string[] };

const KEYS: Record<string, keyof StatblockFields | Stat> = {
	AC: 'ac',
	HP: 'hp',
	ATK: 'attacks',
	MV: 'mv',
	AL: 'al',
	LV: 'level',
	S: 's',
	D: 'd',
	C: 'c',
	I: 'i',
	W: 'w',
	CH: 'ch'
};
const REQUIRED = ['AC', 'ATK', 'MV', 'LV'];
const STAT_KEYS = new Set(['S', 'D', 'C', 'I', 'W', 'CH']);

/** Undoes what copying out of a PDF does: line breaks, odd minus signs, `close/ near`. */
function normalize(input: string): string {
	return input
		.replace(/[−–—]/g, '-')
		.replace(/\s+/g, ' ')
		.replace(/\s*\/\s*/g, '/')
		.trim();
}

/** Splits at `separator` where it is not inside brackets. */
function splitTopLevel(input: string, separator: RegExp): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		else if (depth === 0) {
			const m = separator.exec(input.slice(i));
			if (m && m.index === 0) {
				parts.push(input.slice(start, i));
				i += m[0].length - 1;
				start = i + 1;
			}
		}
	}
	parts.push(input.slice(start));
	return parts.map((p) => p.trim());
}

function snippet(part: string): string {
	return part.length > 24 ? `${part.slice(0, 24)}…` : part;
}

/** Reads `(…)` at the start of `rest`, returning its content and what follows. */
function takeBrackets(rest: string): { inner: string; after: string } | 'unclosed' | null {
	if (!rest.startsWith('(')) return null;
	let depth = 0;
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === '(') depth++;
		else if (rest[i] === ')' && --depth === 0) {
			return { inner: rest.slice(1, i).trim(), after: rest.slice(i + 1).trim() };
		}
	}
	return 'unclosed';
}

function parseAttack(input: string): Attack | string {
	const where = `at "${snippet(input)}"`;
	const head = /^(\d+)\s+(.+?)(?=\s*\(|\s*[+-]\d|$)/.exec(input);
	if (!head) return `${where}: expected an attack like "1 sword +1 (1d6)"`;
	const attack: Attack = {
		count: Number(head[1]),
		name: head[2].trim(),
		range: [],
		bonus: null,
		damage: null,
		effect: null
	};
	let rest = input.slice(head[0].length).trim();

	const rangeGroup = takeBrackets(rest);
	if (rangeGroup === 'unclosed') return `${where}: missing ")"`;
	if (rangeGroup) {
		const ranges = rangeGroup.inner.toLowerCase().split('/');
		if (ranges.every((r): r is Range => (RANGES as readonly string[]).includes(r))) {
			attack.range = ranges;
			rest = rangeGroup.after;
		}
	}

	const bonus = /^([+-]\d+)/.exec(rest);
	if (bonus) {
		attack.bonus = Number(bonus[1]);
		rest = rest.slice(bonus[0].length).trim();
	}

	const damageGroup = takeBrackets(rest);
	if (damageGroup === 'unclosed') return `${where}: missing ")"`;
	if (damageGroup) {
		const pieces = damageGroup.inner.split('+').map((p) => p.trim());
		let formula = pieces.shift() ?? '';
		while (pieces.length && /^\d+$/.test(pieces[0])) formula += `+${pieces.shift()}`;
		const damage = parseDice(formula);
		if (!damage) return `${where}: "${formula}" is not a dice formula (expected e.g. 2d6, d8, 1d6+1)`;
		attack.damage = damage;
		attack.effect = pieces.length ? pieces.join(' + ') : null;
		rest = damageGroup.after;
	}

	if (rest) return `${where}: don't know what "${snippet(rest)}" means`;
	return attack;
}

function parseAttacks(input: string): AttackOption[] | string[] {
	const errors: string[] = [];
	const options = splitTopLevel(input, /^\s+or\s+/i).map((option) =>
		splitTopLevel(option, /^\s+and\s+/i).map((a) => {
			const attack = parseAttack(a);
			if (typeof attack === 'string') errors.push(attack);
			return attack;
		})
	);
	return errors.length ? errors : (options as AttackOption[]);
}

export function parseStatblock(input: string): StatblockResult {
	const fields: Partial<StatblockFields> = {};
	const stats: Partial<Record<Stat, number>> = {};
	const errors: string[] = [];
	const seen = new Set<string>();

	for (const part of splitTopLevel(normalize(input), /^,/)) {
		if (!part) continue;
		const m = /^([A-Za-z]+)\s+(.+)$/.exec(part);
		const key = m?.[1].toUpperCase();
		if (!m || !key || !(key in KEYS)) {
			errors.push(`at "${snippet(part)}": expected one of AC, HP, ATK, MV, S, D, C, I, W, Ch, AL, LV`);
			continue;
		}
		if (seen.has(key)) {
			errors.push(`at "${snippet(part)}": ${m[1]} is given twice`);
			continue;
		}
		seen.add(key);
		const value = m[2].trim();
		const where = `at "${snippet(part)}"`;

		if (STAT_KEYS.has(key)) {
			if (/^[+-]?\d+$/.test(value)) stats[KEYS[key] as Stat] = Number(value);
			else errors.push(`${where}: expected a modifier like +1 or -2`);
		} else if (key === 'AC') {
			const ac = /^(\d+)(?:\s*\((.+)\))?$/.exec(value);
			if (ac) {
				fields.ac = Number(ac[1]);
				fields.armor = ac[2]?.trim() ?? null;
			} else errors.push(`${where}: expected e.g. "AC 13" or "AC 15 (chainmail + shield)"`);
		} else if (key === 'HP') {
			const hp = parseDice(value);
			if (hp && (hp.count > 0 || hp.modifier > 0)) fields.hp = hp;
			else errors.push(`${where}: expected a number or a dice formula`);
		} else if (key === 'LV') {
			if (/^\d+$/.test(value)) fields.level = Number(value);
			else errors.push(`${where}: expected a level like 3`);
		} else if (key === 'AL') {
			const al = value.toUpperCase();
			if (al === 'L' || al === 'N' || al === 'C') fields.al = al;
			else errors.push(`${where}: expected L, N or C`);
		} else if (key === 'MV') {
			fields.mv = value;
		} else if (key === 'ATK') {
			const attacks = parseAttacks(value);
			if (typeof attacks[0] === 'string') errors.push(...(attacks as string[]));
			else fields.attacks = attacks as AttackOption[];
		}
	}

	for (const key of REQUIRED) {
		if (!seen.has(key)) errors.push(`${key} is missing`);
	}
	if (Object.keys(stats).length) fields.stats = stats;
	return errors.length ? { ok: false, errors } : { ok: true, fields };
}
