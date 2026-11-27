import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatError, parseDungeon } from './parse.ts';

const example = readFileSync('dungeons/example.yaml', 'utf8');

/** A small valid dungeon to break in one place per test. */
const base = `
name: Test
languages: [en, de]
start: r1
rooms:
  - id: r1
    name: Hall
    rect: { x: 0, y: 0, w: 3, h: 3 }
    exits:
      - { at: [2, 1], side: e, to: c1, type: door }
  - id: r2
    name: Cellar
    rect: { x: 6, y: 0, w: 2, h: 2 }
corridors:
  - id: c1
    from: [3, 1]
    to: [5, 1]
    exits:
      - { at: [5, 1], side: e, to: r2, type: open }
`;

function errorsOf(source: string): string[] {
	const result = parseDungeon(source, 'test');
	if (result.ok) throw new Error('expected errors');
	return result.errors.map(formatError);
}

describe('valid dungeon files', () => {
	it('turns the example dungeon into a model', () => {
		const result = parseDungeon(example, 'example');
		if (!result.ok) throw new Error(result.errors.map(formatError).join('\n'));
		const { dungeon } = result;

		expect(dungeon.id).toBe('example');
		expect(dungeon.name).toEqual({ en: 'The Drowned Chapel', de: 'Die versunkene Kapelle' });
		expect(dungeon.languages).toEqual(['en', 'de']);
		expect(dungeon.start).toBe('r1');
		expect(dungeon.danger).toBe('risky');
		expect(dungeon.areas.map((a) => `${a.kind}:${a.id}`)).toEqual([
			'room:r1',
			'room:r2',
			'room:r3',
			'room:r4',
			'corridor:c1',
			'corridor:c2',
			'corridor:c3'
		]);
		expect(dungeon.areas.find((a) => a.id === 'c3')?.rect).toEqual({ x: 3, y: 7, w: 4, h: 1 });
	});

	it('connects corridor segments that touch end to end without a declared exit', () => {
		const result = parseDungeon(example, 'example');
		if (!result.ok) throw new Error();

		expect(result.dungeon.exits.filter((e) => e.implicit)).toEqual([
			{ from: 'c2', to: 'c3', at: { x: 2, y: 7 }, side: 'e', type: 'open', implicit: true }
		]);
		expect(result.dungeon.exits.filter((e) => !e.implicit).map((e) => `${e.from}-${e.type}-${e.to}`)).toEqual([
			'r1-open-c1',
			'r1-door-c2',
			'r2-door-c1',
			'r3-secret-r4',
			'c3-locked-r3'
		]);
	});

	it('reads monsters from separate fields and from a stat block into the same shape', () => {
		const result = parseDungeon(example, 'example');
		if (!result.ok) throw new Error();
		const [rat, robber] = result.dungeon.wandering;
		const skeleton = result.dungeon.areas.find((a) => a.id === 'r3')!.monsters[0];

		expect(rat).toMatchObject({ label: 'R', level: 1, ac: 11, hp: { count: 0, modifier: 3 }, mv: 'near' });
		expect(robber).toMatchObject({
			label: 'B',
			count: { count: 1, sides: 4, modifier: 0 },
			level: 1,
			ac: 12,
			armor: 'leather',
			hp: { count: 0, modifier: 5 },
			mv: 'near',
			al: 'C',
			stats: { s: 1, d: 1, c: 0, i: 0, w: -1, ch: -1 }
		});
		expect(robber.attacks.map((option) => option.map((a) => a.name))).toEqual([['shovel'], ['sling']]);
		expect(skeleton.hp).toBeNull(); // rolled the book's way: level × d8 + CON
		expect(skeleton.abilities[0].name).toEqual({ en: 'Brittle', de: 'Spröde' });
	});

	it('lets separate fields override the stat block', () => {
		const source = base.replace(
			'    rect: { x: 6, y: 0, w: 2, h: 2 }\n',
			`    rect: { x: 6, y: 0, w: 2, h: 2 }
    monsters:
      - name: Bandit
        label: B
        statblock: AC 13, HP 4, ATK 1 club +1 (1d4), MV near, LV 1
        hp: 2d8
`
		);
		const result = parseDungeon(source, 'test');
		if (!result.ok) throw new Error(result.errors.map(formatError).join('\n'));

		expect(result.dungeon.areas[1].monsters[0]).toMatchObject({ ac: 13, hp: { count: 2, sides: 8 } });
	});

	it('reads JSON as well', () => {
		const json = JSON.stringify({
			name: 'Tiny',
			languages: ['en'],
			start: 'r1',
			rooms: [{ id: 'r1', name: 'Only room', rect: { x: 0, y: 0, w: 1, h: 1 } }]
		});

		expect(parseDungeon(json, 'tiny').ok).toBe(true);
	});

	it('treats a plain string as the default language', () => {
		const result = parseDungeon(base, 'test');

		expect(result.ok && result.dungeon.areas[0].name).toEqual({ en: 'Hall' });
	});
});

describe('invalid dungeon files', () => {
	it('reports broken YAML with its position', () => {
		expect(errorsOf('name: [unclosed\nlanguages: [en]')[0]).toMatch(/^line \d+, col \d+ · the file is not valid YAML or JSON/);
	});

	it('reports missing and unknown fields', () => {
		expect(errorsOf(base.replace('start: r1\n', 'strat: r1\n'))).toEqual([
			'line 2, col 1 · "start" is missing',
			'line 4, col 1 · strat: unknown field "strat" (allowed: name, languages, start, danger, rooms, corridors, wandering)'
		]);
	});

	it('reports overlapping areas', () => {
		expect(errorsOf(base.replace('rect: { x: 6, y: 0, w: 2, h: 2 }', 'rect: { x: 2, y: 2, w: 2, h: 2 }'))).toContain(
			'line 13, col 11 · rooms[1] (r2).rect: overlaps room r1 at [2, 2]'
		);
	});

	it('reports exits that lead nowhere or to the wrong place', () => {
		expect(errorsOf(base.replace('to: c1, type: door', 'to: c9, type: door'))).toEqual([
			'line 10, col 36 · rooms[0] (r1).exits[0].to: leads to "c9", which doesn\'t exist'
		]);
		expect(errorsOf(base.replace('side: e, to: c1', 'side: s, to: c1'))).toEqual([
			'line 10, col 29 · rooms[0] (r1).exits[0].side: the square on the s side of [2, 1] is [2, 2], which belongs to room r1, not c1'
		]);
		expect(errorsOf(base.replace('at: [2, 1]', 'at: [7, 7]'))).toEqual([
			'line 10, col 15 · rooms[0] (r1).exits[0].at: [7, 7] is not a square of room r1'
		]);
	});

	it('reports a connection declared on both sides', () => {
		const source = base.replace('to: r2, type: open }', 'to: r2, type: open }\n      - { at: [3, 1], side: w, to: r1, type: door }');

		expect(errorsOf(source)).toEqual([
			'line 20, col 9 · corridors[0] (c1).exits[1]: this connection is already declared on r1; declare it on one side only'
		]);
	});

	it('reports a crooked corridor segment and duplicate ids', () => {
		expect(errorsOf(base.replace('to: [5, 1]', 'to: [5, 2]'))[0]).toBe(
			'line 17, col 9 · corridors[0] (c1).to: a segment must be straight: [3, 1] and [5, 2] share neither x nor y'
		);
		expect(errorsOf(base.replace('- id: r2', '- id: r1'))).toContain(
			'line 11, col 9 · rooms[1] (r1).id: the id "r1" is already used by room r1'
		);
	});

	it('reports a start that is missing or a corridor', () => {
		expect(errorsOf(base.replace('start: r1', 'start: r9'))).toEqual(['line 4, col 8 · start: room "r9" doesn\'t exist']);
		expect(errorsOf(base.replace('start: r1', 'start: c1'))).toEqual([
			'line 4, col 8 · start: "c1" is a corridor segment, the start must be a room'
		]);
	});

	it('reports malformed dice formulas and stat blocks inside monsters', () => {
		const source = base.replace(
			'    rect: { x: 6, y: 0, w: 2, h: 2 }\n',
			`    rect: { x: 6, y: 0, w: 2, h: 2 }
    monsters:
      - { name: Rat, label: R, level: 1, ac: 11, hp: 2w6, mv: near, attacks: [{ name: bite, damage: 1d4 }] }
      - name: Bandit
        label: B
        statblock: AC 13, ATK 1 club +1 (1d4), LV 1
`
		);

		expect(errorsOf(source)).toEqual([
			'line 15, col 54 · rooms[1] (r2).monsters[0].hp: "2w6" is not a number or dice formula (expected e.g. 3, 2d6, d8, 1d6+1)',
			'line 18, col 20 · rooms[1] (r2).monsters[1].statblock: MV is missing'
		]);
	});

	it('reports monsters without enough stats', () => {
		const source = base.replace(
			'    rect: { x: 6, y: 0, w: 2, h: 2 }\n',
			'    rect: { x: 6, y: 0, w: 2, h: 2 }\n    monsters:\n      - { name: Rat, label: R, ac: 11 }\n'
		);

		expect(errorsOf(source)).toEqual([
			'line 15, col 9 · rooms[1] (r2).monsters[0]: "level", "mv", "attacks" missing (give the fields or a "statblock")'
		]);
	});

	it('checks localized text against the listed languages', () => {
		expect(errorsOf(base.replace('name: Hall', 'name: { de: Halle, fr: Salle }'))).toEqual([
			'line 7, col 28 · rooms[0] (r1).name.fr: language "fr" is not listed in "languages"',
			'line 7, col 11 · rooms[0] (r1).name: missing text for the default language "en"'
		]);
	});

	it('reports an empty file', () => {
		expect(errorsOf('')).toEqual(['the file is empty']);
	});
});
