/**
 * Dice formulas such as `2d6`, `d8`, `1d6+1` or a plain number: parsing,
 * formatting and rolling with an injected roller.
 */

/** `count` dice with `sides` sides plus `modifier`. A plain number has count 0. */
export type DiceFormula = { count: number; sides: number; modifier: number };

const FORMULA = /^(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i;
const NUMBER = /^[+-]?\d+$/;

export function parseDice(input: string | number): DiceFormula | null {
	if (typeof input === 'number') {
		return Number.isInteger(input) ? { count: 0, sides: 0, modifier: input } : null;
	}
	const text = input.trim().replace(/[−–]/g, '-');
	if (NUMBER.test(text)) return { count: 0, sides: 0, modifier: Number(text) };
	const m = FORMULA.exec(text);
	if (!m) return null;
	const count = m[1] === '' ? 1 : Number(m[1]);
	const sides = Number(m[2]);
	if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
	const modifier = m[3] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
	return { count, sides, modifier };
}

export function formatDice(f: DiceFormula): string {
	if (f.count === 0) return String(f.modifier);
	const mod = f.modifier === 0 ? '' : f.modifier > 0 ? `+${f.modifier}` : String(f.modifier);
	return `${f.count}d${f.sides}${mod}`;
}

/** One die roller: returns 1..sides. The engine's `Deps.dice`. */
export type Roller = (sides: number) => number;

/** Every die rolled, in order, plus the formula's modifier and the sum of both. */
export type DiceRoll = { rolls: number[]; modifier: number; total: number };

export function rollDice(formula: DiceFormula, roller: Roller): DiceRoll {
	const rolls = Array.from({ length: formula.count }, () => roller(formula.sides));
	const total = rolls.reduce((sum, r) => sum + r, formula.modifier);
	return { rolls, modifier: formula.modifier, total };
}
