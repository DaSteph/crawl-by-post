import { describe, expect, it } from 'vitest';
import { formatDice, parseDice } from '../engine/dice.ts';
import { parseStatblock } from './statblock.ts';

describe('dice formulas', () => {
	it.each([
		['2d6', '2d6'],
		['d8', '1d8'],
		['1d6+1', '1d6+1'],
		['1d6 - 1', '1d6-1'],
		['3', '3'],
		[4, '4']
	])('parses %s', (input, expected) => {
		const formula = parseDice(input);
		expect(formula && formatDice(formula)).toBe(expected);
	});

	it.each(['2w6', 'd', '0d6', '1d0', '1d6+', 'two', 1.5])('rejects %s', (input) => {
		expect(parseDice(input)).toBeNull();
	});
});

describe('stat block', () => {
	it('reads a full stat line as printed in the book', () => {
		const result = parseStatblock(
			'AC 15 (chainmail + shield), HP 9, ATK 2 spear (close/near) +2 (1d6) or 1 longbow (far) +1 (1d8), ' +
				'MV near, S +2, D +1, C +1, I -1, W +0, Ch -1, AL C, LV 2'
		);

		expect(result).toEqual({
			ok: true,
			fields: {
				ac: 15,
				armor: 'chainmail + shield',
				hp: { count: 0, sides: 0, modifier: 9 },
				attacks: [
					[{ count: 2, name: 'spear', range: ['close', 'near'], bonus: 2, damage: { count: 1, sides: 6, modifier: 0 }, effect: null }],
					[{ count: 1, name: 'longbow', range: ['far'], bonus: 1, damage: { count: 1, sides: 8, modifier: 0 }, effect: null }]
				],
				mv: 'near',
				stats: { s: 2, d: 1, c: 1, i: -1, w: 0, ch: -1 },
				al: 'C',
				level: 2
			}
		});
	});

	it('copes with line breaks, odd minus signs and "close/ near" from copying out of a PDF', () => {
		const result = parseStatblock('AC 12, HP 4, ATK 1 dagger (close/ near)\n+1 (1d4), MV near, S −1, LV 1');

		expect(result.ok && result.fields.attacks?.[0][0].range).toEqual(['close', 'near']);
		expect(result.ok && result.fields.stats).toEqual({ s: -1 });
	});

	it('reads attacks made together ("and"), extra effects and attacks without damage', () => {
		const result = parseStatblock(
			'AC 14, ATK 1 bite +3 (1d6) and 1 tentacles +3 (1d8 + toxin) or 1 screech, MV near (climb, swim), LV 4'
		);

		expect(result.ok && result.fields.attacks).toEqual([
			[
				{ count: 1, name: 'bite', range: [], bonus: 3, damage: { count: 1, sides: 6, modifier: 0 }, effect: null },
				{ count: 1, name: 'tentacles', range: [], bonus: 3, damage: { count: 1, sides: 8, modifier: 0 }, effect: 'toxin' }
			],
			[{ count: 1, name: 'screech', range: [], bonus: null, damage: null, effect: null }]
		]);
		expect(result.ok && result.fields.mv).toBe('near (climb, swim)');
	});

	it('keeps a damage modifier apart from an effect', () => {
		const result = parseStatblock('AC 11, ATK 1 club +1 (1d6 + 1 + poison), MV near, LV 1');

		expect(result.ok && result.fields.attacks?.[0][0]).toMatchObject({
			damage: { count: 1, sides: 6, modifier: 1 },
			effect: 'poison'
		});
	});

	it('says where the problem is', () => {
		expect(parseStatblock('AC 13, ATK 1 club +1 (1d4, MV near, LV 1')).toEqual({
			ok: false,
			errors: ['at "1 club +1 (1d4, MV near,…": missing ")"', 'MV is missing', 'LV is missing']
		});
		expect(parseStatblock('AC 13, ATK 1 club +1 (2w6), MV near, LV 1')).toEqual({
			ok: false,
			errors: ['at "1 club +1 (2w6)": "2w6" is not a dice formula (expected e.g. 2d6, d8, 1d6+1)']
		});
		expect(parseStatblock('AC 13, XP 5, ATK 1 club, MV near, LV 1, AL X')).toEqual({
			ok: false,
			errors: [
				'at "XP 5": expected one of AC, HP, ATK, MV, S, D, C, I, W, Ch, AL, LV',
				'at "AL X": expected L, N or C'
			]
		});
	});
});
