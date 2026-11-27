/**
 * Turns the visible areas and exits into drawable geometry, in grid units:
 * ink walls around every area, and door symbols where exits sit on a wall.
 */
import { cellsOf, neighbour, type Cell, type ExitType, type Rect, type Side } from '../dungeon/model.ts';
import type { MapArea, MapExit } from '../engine/map.ts';

/** `hidden` walls and doors border unrevealed areas only (GM view). */
export type Wall = { x1: number; y1: number; x2: number; y2: number; hidden: boolean };
export type Door = { x: number; y: number; vertical: boolean; type: Exclude<ExitType, 'open'>; hidden: boolean };
export type MapGeometry = { bounds: Rect; walls: Wall[]; doors: Door[] };

const SIDES: Side[] = ['n', 'e', 's', 'w'];

/** The wall edge on `side` of `cell`, as a line in grid units. */
function edge(cell: Cell, side: Side) {
	const { x, y } = cell;
	if (side === 'n') return { x1: x, y1: y, x2: x + 1, y2: y };
	if (side === 's') return { x1: x, y1: y + 1, x2: x + 1, y2: y + 1 };
	if (side === 'w') return { x1: x, y1: y, x2: x, y2: y + 1 };
	return { x1: x + 1, y1: y, x2: x + 1, y2: y + 1 };
}

const edgeKey = (e: { x1: number; y1: number; x2: number; y2: number }) => `${e.x1},${e.y1},${e.x2},${e.y2}`;

/** Joins neighbouring wall pieces on the same line into one. */
function merge(walls: Wall[]): Wall[] {
	const groups = new Map<string, Wall[]>();
	for (const w of walls) {
		const horizontal = w.y1 === w.y2;
		const k = `${horizontal ? 'h' : 'v'}${horizontal ? w.y1 : w.x1}${w.hidden ? 'x' : ''}`;
		groups.set(k, [...(groups.get(k) ?? []), w]);
	}
	const merged: Wall[] = [];
	for (const group of groups.values()) {
		const horizontal = group[0].y1 === group[0].y2;
		const start = (w: Wall) => (horizontal ? w.x1 : w.y1);
		group.sort((a, b) => start(a) - start(b));
		let current = { ...group[0] };
		for (const w of group.slice(1)) {
			const touches = horizontal ? w.x1 === current.x2 : w.y1 === current.y2;
			if (touches) {
				current.x2 = w.x2;
				current.y2 = w.y2;
			} else {
				merged.push(current);
				current = { ...w };
			}
		}
		merged.push(current);
	}
	return merged;
}

export function mapGeometry(areas: MapArea[], exits: MapExit[]): MapGeometry {
	const owner = new Map<string, MapArea>();
	const cellKey = (c: Cell) => `${c.x},${c.y}`;
	for (const area of areas) for (const c of cellsOf(area.rect)) owner.set(cellKey(c), area);

	const exitsByEdge = new Map<string, MapExit>();
	for (const exit of exits) exitsByEdge.set(edgeKey(edge(exit.at, exit.side)), exit);

	const walls: Wall[] = [];
	const doors: Door[] = [];
	const done = new Set<string>();

	for (const area of areas) {
		for (const cell of cellsOf(area.rect)) {
			for (const side of SIDES) {
				const other = owner.get(cellKey(neighbour(cell, side)));
				if (other === area) continue;
				const line = edge(cell, side);
				const key = edgeKey(line);
				if (done.has(key)) continue;
				done.add(key);

				// The exits passed in are already filtered to what the viewer may see.
				const exit = exitsByEdge.get(key);
				const hidden = !area.revealed && !(other?.revealed ?? false);
				if (!exit) {
					walls.push({ ...line, hidden });
					continue;
				}
				if (exit.type === 'open') continue;
				doors.push({
					x: (line.x1 + line.x2) / 2,
					y: (line.y1 + line.y2) / 2,
					vertical: line.x1 === line.x2,
					type: exit.type,
					hidden
				});
				// Doors sit on the wall line; a raised portcullis leaves a gap with bars.
				if (exit.type !== 'portcullis') walls.push({ ...line, hidden });
			}
		}
	}

	const xs = areas.flatMap((a) => [a.rect.x, a.rect.x + a.rect.w]);
	const ys = areas.flatMap((a) => [a.rect.y, a.rect.y + a.rect.h]);
	const bounds = areas.length
		? {
				x: Math.min(...xs) - 1,
				y: Math.min(...ys) - 1,
				w: Math.max(...xs) - Math.min(...xs) + 2,
				h: Math.max(...ys) - Math.min(...ys) + 2
			}
		: { x: 0, y: 0, w: 1, h: 1 };

	return { bounds, walls: merge(walls), doors };
}
