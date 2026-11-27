import { describe, expect, it } from 'vitest';
import { parseDice, rollDice, type Roller } from './dice.ts';

/** A roller that returns the given results in order and records the dice asked for. */
function scripted(...results: number[]) {
	const asked: number[] = [];
	const roller: Roller = (sides) => {
		asked.push(sides);
		const next = results.shift();
		if (next === undefined) throw new Error(`unexpected d${sides} roll`);
		return next;
	};
	return { roller, asked };
}

const roll = (input: string | number, ...results: number[]) => {
	const { roller, asked } = scripted(...results);
	return { ...rollDice(parseDice(input)!, roller), asked };
};

describe('rolling dice formulas', () => {
	it.each([
		['1d6', [4], { rolls: [4], modifier: 0, total: 4, asked: [6] }],
		['2d6', [3, 5], { rolls: [3, 5], modifier: 0, total: 8, asked: [6, 6] }],
		['d8+1', [7], { rolls: [7], modifier: 1, total: 8, asked: [8] }],
		['1d4-1', [1], { rolls: [1], modifier: -1, total: 0, asked: [4] }],
		['3d10+2', [10, 1, 6], { rolls: [10, 1, 6], modifier: 2, total: 19, asked: [10, 10, 10] }],
		[5, [], { rolls: [], modifier: 5, total: 5, asked: [] }]
	] as const)('rolls %s', (input, results, expected) => {
		expect(roll(input, ...results)).toEqual(expected);
	});
});
