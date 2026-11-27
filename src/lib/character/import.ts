/**
 * Shadowdarklings importer: maps a character export (JSON) onto the character model.
 *
 * Shadowdarklings precomputes the totals, so the importer trusts them: `stats` already
 * includes talent bonuses, and the `attacks` lines already include every attack bonus.
 * The gear entries carry no weapon stats, which is why weapons come from `attacks`.
 */
import { parseDice } from '../engine/dice.ts';
import {
	ABILITIES,
	abilityModifier,
	type Ability,
	type AbilityScore,
	type Character,
	type GearItem,
	type Treasure,
	type Weapon,
	type WeaponRange
} from './model.ts';

export type ImportResult = { ok: true; character: Character } | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown) => JSON.stringify(v) ?? String(v);

const RANGES: Record<string, WeaponRange> = { C: 'close', N: 'near', F: 'far' };

/** `LONGBOW: +5 (F), 1d8 (2H)` or `LONGSWORD: +2, 1d8`. */
const ATTACK = /^(.+?):\s*([+-]\d+)\s*(?:\(([^)]*)\))?\s*,\s*([^\s(]+)\s*(?:\(([^)]*)\))?\s*$/;
/** `SPELLS: To cast a Witch spell, roll 1d20+5 vs a DC ...` */
const SPELLCASTING = /^SPELLS:.*?\b1?d20\s*([+-]\s*\d+)/i;

function titleCase(upper: string): string {
	return upper.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function commaList(v: unknown): string[] {
	if (typeof v !== 'string') return [];
	const items = v
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length === 1 && items[0].toLowerCase() === 'none' ? [] : items;
}

function parseAttack(line: string): Weapon | null {
	const m = ATTACK.exec(line.trim());
	if (!m) return null;
	const [, name, bonus, rangeCode, damageText, props] = m;
	const range = rangeCode === undefined ? null : RANGES[rangeCode.trim()];
	const damage = parseDice(damageText);
	if (range === undefined || !damage || damage.count === 0) return null;
	return {
		name: titleCase(name.trim()),
		attackBonus: Number(bonus),
		range,
		damage,
		properties: props ? props.split(/[,\s]+/).filter(Boolean) : []
	};
}

export function importShadowdarklings(source: string): ImportResult {
	if (!source.trim()) return { ok: false, errors: ['The file is empty.'] };
	let json: unknown;
	try {
		json = JSON.parse(source);
	} catch {
		return { ok: false, errors: ['The file is not valid JSON. Upload the .json file Shadowdarklings exports.'] };
	}
	if (!isObject(json)) return { ok: false, errors: ['This doesn’t look like a Shadowdarklings character export.'] };

	const errors: string[] = [];

	const text = (key: string, required: boolean): string => {
		const v = json[key];
		if (typeof v === 'string' && v.trim()) return v.trim();
		if (required) errors.push(`"${key}" is missing or empty.`);
		return '';
	};
	const whole = (path: string, v: unknown, min: number): number => {
		if (v === undefined || v === null) {
			errors.push(`"${path}" is missing.`);
			return 0;
		}
		if (typeof v !== 'number' || !Number.isInteger(v)) {
			errors.push(`"${path}" must be a whole number, got ${show(v)}.`);
			return 0;
		}
		if (v < min) {
			errors.push(`"${path}" must be at least ${min}, got ${v}.`);
			return 0;
		}
		return v;
	};

	const name = text('name', true);
	const className = text('class', true);
	const level = whole('level', json.level, 0);

	const abilities = {} as Record<Ability, AbilityScore>;
	if (!isObject(json.stats)) {
		errors.push('"stats" is missing.');
	} else {
		for (const ability of ABILITIES) {
			const score = whole(`stats.${ability}`, json.stats[ability], 1);
			abilities[ability] = { score, modifier: abilityModifier(score) };
		}
	}

	const ac = whole('armorClass', json.armorClass, 0);
	const maxHp = whole('maxHitPoints', json.maxHitPoints, 1);

	const weapons: Weapon[] = [];
	const otherAttacks: string[] = [];
	let spellcasting: number | null = null;
	for (const line of Array.isArray(json.attacks) ? json.attacks : []) {
		if (typeof line !== 'string' || !line.trim()) continue;
		const spells = SPELLCASTING.exec(line);
		if (spells) {
			spellcasting = Number(spells[1].replace(/\s/g, ''));
			continue;
		}
		const weapon = parseAttack(line);
		if (weapon) weapons.push(weapon);
		else otherAttacks.push(line.trim());
	}

	const gear: GearItem[] = (Array.isArray(json.gear) ? json.gear : [])
		.filter(isObject)
		.filter((g) => typeof g.name === 'string' && g.name.trim())
		.map((g) => {
			const units = [g.totalUnits, g.quantity].find((n) => typeof n === 'number' && Number.isInteger(n) && n > 0);
			return { name: (g.name as string).trim(), quantity: (units as number | undefined) ?? 1 };
		});

	const treasures: Treasure[] = [
		...(Array.isArray(json.treasures) ? json.treasures : []),
		...(Array.isArray(json.magicItems) ? json.magicItems : [])
	]
		.filter(isObject)
		.filter((t) => typeof t.name === 'string' && t.name.trim())
		.map((t) => ({
			name: (t.name as string).trim(),
			description: typeof t.desc === 'string' ? t.desc.trim() : ''
		}));

	if (errors.length) return { ok: false, errors };

	return {
		ok: true,
		character: {
			name,
			ancestry: text('ancestry', false),
			className,
			level,
			title: text('title', false),
			alignment: text('alignment', false),
			abilities,
			ac,
			maxHp,
			weapons,
			otherAttacks,
			spellcasting,
			spells: commaList(json.spellsKnown),
			gear,
			treasures,
			languages: commaList(json.languages)
		}
	};
}
