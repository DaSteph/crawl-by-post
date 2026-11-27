import { describe, expect, it } from 'vitest';
import type { MapArea, MapExit } from '../engine/map.ts';
import { mapGeometry } from './geometry.ts';

function area(id: string, rect: MapArea['rect'], revealed = true): MapArea {
	return { id, kind: 'room', rect, name: id, revealed, lit: true, lightOverride: null, mood: null, notes: null, monsters: [] };
}

describe('map geometry', () => {
	it('draws a lone room as four merged walls inside a one-square margin', () => {
		const { bounds, walls, doors } = mapGeometry([area('r1', { x: 2, y: 3, w: 3, h: 2 })], []);

		expect(bounds).toEqual({ x: 1, y: 2, w: 5, h: 4 });
		expect(walls).toHaveLength(4);
		expect(walls).toContainEqual({ x1: 2, y1: 3, x2: 5, y2: 3, hidden: false });
		expect(walls).toContainEqual({ x1: 5, y1: 3, x2: 5, y2: 5, hidden: false });
		expect(doors).toEqual([]);
	});

	it('puts a door on the wall and leaves a gap for an open exit', () => {
		const rooms = [area('r1', { x: 0, y: 0, w: 2, h: 1 }), area('r2', { x: 2, y: 0, w: 1, h: 1 })];
		const exit = (type: MapExit['type']): MapExit => ({ from: 'r1', to: 'r2', at: { x: 1, y: 0 }, side: 'e', type });

		const withDoor = mapGeometry(rooms, [exit('door')]);
		const withGap = mapGeometry(rooms, [exit('open')]);

		expect(withDoor.doors).toEqual([{ x: 2, y: 0.5, vertical: true, type: 'door', hidden: false }]);
		expect(withDoor.walls.some((w) => w.x1 === 2 && w.x2 === 2)).toBe(true);
		expect(withGap.doors).toEqual([]);
		expect(withGap.walls.some((w) => w.x1 === 2 && w.x2 === 2)).toBe(false);
	});

	it('draws the wall between two areas once, and marks walls of unrevealed areas as hidden', () => {
		const { walls } = mapGeometry(
			[area('r1', { x: 0, y: 0, w: 1, h: 1 }), area('r2', { x: 1, y: 0, w: 1, h: 1 }, false)],
			[]
		);

		expect(walls.filter((w) => w.x1 === 1 && w.x2 === 1)).toEqual([{ x1: 1, y1: 0, x2: 1, y2: 1, hidden: false }]);
		expect(walls).toContainEqual({ x1: 2, y1: 0, x2: 2, y2: 1, hidden: true });
	});
});
