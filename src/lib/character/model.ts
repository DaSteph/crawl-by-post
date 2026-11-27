/**
 * The character model: what a Shadowdarklings export turns into.
 * Rules values only; live state (current HP, inventory, position) lives on the player slot.
 */
import type { DiceFormula } from '../engine/dice.ts';

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
export type Ability = (typeof ABILITIES)[number];

export type AbilityScore = { score: number; modifier: number };

export type WeaponRange = 'close' | 'near' | 'far';

export type Weapon = {
	name: string;
	/** Total attack bonus as computed by Shadowdarklings (ability, talents, ancestry). */
	attackBonus: number;
	/** Null means a plain melee weapon without a listed range. */
	range: WeaponRange | null;
	damage: DiceFormula;
	/** Shadowdarklings property codes such as `2H`, `FIN`, `V`, `Th`. */
	properties: string[];
};

export type GearItem = { name: string; quantity: number };

export type Treasure = { name: string; description: string };

export type Character = {
	name: string;
	ancestry: string;
	className: string;
	level: number;
	title: string;
	alignment: string;
	abilities: Record<Ability, AbilityScore>;
	ac: number;
	maxHp: number;
	weapons: Weapon[];
	/** Attack lines the importer couldn't read as weapons, shown as written. */
	otherAttacks: string[];
	/** Bonus for spellcasting checks (d20 + bonus), or null for non-casters. */
	spellcasting: number | null;
	spells: string[];
	gear: GearItem[];
	treasures: Treasure[];
	languages: string[];
};

/** Shadowdark ability modifier: (score − 10) / 2 rounded down, between −4 and +4. */
export function abilityModifier(score: number): number {
	return Math.max(-4, Math.min(4, Math.floor((score - 10) / 2)));
}

/**
 * Up to two letters that identify a player's token without relying on colour.
 * A campaign suffix in parentheses ("Gelan (Arden Vul)") is ignored.
 */
export function initials(name: string): string {
	const words = name
		.replace(/\([^)]*\)/g, ' ')
		.split(/\s+/)
		.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
		.filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) {
		const [first, second = ''] = [...words[0]];
		return first.toUpperCase() + second.toLowerCase();
	}
	return (([...words[0]][0] ?? '') + ([...words[1]][0] ?? '')).toUpperCase();
}
