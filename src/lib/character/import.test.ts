import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importShadowdarklings } from './import.ts';
import { abilityModifier, initials } from './model.ts';

const fixture = (name: string) => readFileSync(`src/lib/character/fixtures/${name}`, 'utf8');

function imported(name: string) {
	const result = importShadowdarklings(fixture(name));
	if (!result.ok) throw new Error(result.errors.join('\n'));
	return result.character;
}

function withChanges(name: string, change: (json: Record<string, unknown>) => void): string {
	const json = JSON.parse(fixture(name));
	change(json);
	return JSON.stringify(json);
}

describe('importing a Shadowdarklings export', () => {
	it('maps a ranger: identity, abilities with modifiers, AC and max HP', () => {
		const gelan = imported('gelan-ranger.json');

		expect(gelan).toMatchObject({
			name: 'Gelan (Arden Vul)',
			ancestry: 'Elf',
			className: 'Ranger',
			level: 3,
			title: 'Wayfarer',
			alignment: 'Neutral',
			ac: 15,
			maxHp: 13,
			languages: ['Common', 'Elvish', 'Sylvan']
		});
		expect(gelan.abilities).toEqual({
			STR: { score: 15, modifier: 2 },
			DEX: { score: 18, modifier: 4 },
			CON: { score: 13, modifier: 1 },
			INT: { score: 12, modifier: 1 },
			WIS: { score: 10, modifier: 0 },
			CHA: { score: 10, modifier: 0 }
		});
	});

	it('reads weapons from the attack lines, with attack bonus, range, damage and properties', () => {
		const gelan = imported('gelan-ranger.json');

		expect(gelan.weapons).toEqual([
			{
				name: 'Longbow',
				attackBonus: 5,
				range: 'far',
				damage: { count: 1, sides: 8, modifier: 0 },
				properties: ['2H']
			},
			{
				name: 'Longsword',
				attackBonus: 2,
				range: null,
				damage: { count: 1, sides: 8, modifier: 0 },
				properties: []
			}
		]);
		expect(gelan.otherAttacks).toEqual([]);
	});

	it('has no spells or spellcasting for a non-caster', () => {
		const gelan = imported('gelan-ranger.json');

		expect(gelan.spells).toEqual([]);
		expect(gelan.spellcasting).toBeNull();
	});

	it('lists gear with quantities, and treasures with their descriptions', () => {
		const gelan = imported('gelan-ranger.json');

		expect(gelan.gear).toEqual([
			{ name: 'Longbow', quantity: 1 },
			{ name: 'Arrows', quantity: 20 },
			{ name: 'Longsword', quantity: 1 },
			{ name: 'Leather armor', quantity: 1 },
			{ name: 'Backpack', quantity: 1 },
			{ name: 'Rations', quantity: 3 },
			{ name: 'Torch', quantity: 2 },
			{ name: "Rope, 60'", quantity: 1 }
		]);
		expect(gelan.treasures.map((t) => t.name)).toEqual([
			'3 Pfeile +1',
			'Antiker Archontischer Pfeil',
			'Ring of Controlling Plants'
		]);
		expect(gelan.treasures[1].description).toBe('+2 to hit / + 2 damage');
	});

	it('maps a witch: known spells and the spellcasting bonus, which is not a weapon', () => {
		const magalph = imported('magalph-witch.json');

		expect(magalph).toMatchObject({ className: 'Witch', level: 2, ac: 10, maxHp: 4 });
		expect(magalph.spells).toEqual(['Charm Person', 'Eyebite', 'Hypnotize', 'Shadowdance']);
		expect(magalph.spellcasting).toBe(5);
		expect(magalph.weapons).toEqual([
			{
				name: 'Dagger',
				attackBonus: 1,
				range: 'near',
				damage: { count: 1, sides: 4, modifier: 0 },
				properties: ['FIN']
			}
		]);
		expect(magalph.abilities.CHA).toEqual({ score: 19, modifier: 4 });
		expect(magalph.abilities.CON).toEqual({ score: 8, modifier: -1 });
	});

	it('keeps attack lines it cannot read, as written, instead of failing', () => {
		const source = withChanges('gelan-ranger.json', (json) => {
			json.attacks = ['LONGBOW: +5 (F), 1d8 (2H)', 'BITE: special, see notes'];
		});
		const result = importShadowdarklings(source);

		expect(result.ok && result.character.weapons.map((w) => w.name)).toEqual(['Longbow']);
		expect(result.ok && result.character.otherAttacks).toEqual(['BITE: special, see notes']);
	});

	it('reads damage with a modifier and a negative attack bonus', () => {
		const source = withChanges('gelan-ranger.json', (json) => {
			json.attacks = ['CLUB: -1, 1d4+1'];
		});
		const result = importShadowdarklings(source);

		expect(result.ok && result.character.weapons).toEqual([
			{ name: 'Club', attackBonus: -1, range: null, damage: { count: 1, sides: 4, modifier: 1 }, properties: [] }
		]);
	});
});

describe('malformed exports', () => {
	it('rejects a file that is not JSON', () => {
		expect(importShadowdarklings('<html>nope</html>')).toEqual({
			ok: false,
			errors: ['The file is not valid JSON. Upload the .json file Shadowdarklings exports.']
		});
	});

	it('rejects JSON that is not a character object', () => {
		expect(importShadowdarklings('[1, 2, 3]')).toEqual({
			ok: false,
			errors: ['This doesn’t look like a Shadowdarklings character export.']
		});
	});

	it('names every missing or wrong field', () => {
		const source = withChanges('gelan-ranger.json', (json) => {
			delete json.name;
			json.level = 'three';
			delete (json.stats as Record<string, unknown>).WIS;
			json.maxHitPoints = 0;
		});

		expect(importShadowdarklings(source)).toEqual({
			ok: false,
			errors: [
				'"name" is missing or empty.',
				'"level" must be a whole number, got "three".',
				'"stats.WIS" is missing.',
				'"maxHitPoints" must be at least 1, got 0.'
			]
		});
	});

	it('rejects an empty upload', () => {
		expect(importShadowdarklings('   ')).toEqual({
			ok: false,
			errors: ['The file is empty.']
		});
	});
});

describe('ability modifiers and initials', () => {
	it('follows the Shadowdark modifier table', () => {
		expect([1, 3, 4, 5, 8, 9, 10, 11, 12, 17, 18, 20].map(abilityModifier)).toEqual([
			-4, -4, -3, -3, -1, -1, 0, 0, 1, 3, 4, 4
		]);
	});

	it('makes initials from the name, ignoring a campaign suffix', () => {
		expect(initials('Gelan (Arden Vul)')).toBe('Ge');
		expect(initials('Magalph (Brandonsford)')).toBe('Ma');
		expect(initials('Ralina Stormcrow')).toBe('RS');
		expect(initials('  ')).toBe('?');
	});
});
