/**
 * What each participant sees of the dungeon. Players get revealed areas only and
 * nothing GM-only; the GM gets everything, with each area's revealed flag.
 */
import { formatDice } from './dice.ts';
import { localize, type Dungeon, type ExitType, type LocalizedText, type Rect, type Cell, type Side } from '../dungeon/model.ts';
import { initials } from '../character/model.ts';
import type { SessionState, TokenColour } from './index.ts';

export type MapMonster = { label: string; name: string; count: string };

export type MapArea = {
	id: string;
	kind: 'room' | 'corridor';
	rect: Rect;
	name: string | null;
	revealed: boolean;
	/** GM only; null for players. */
	mood: string | null;
	notes: string | null;
	monsters: MapMonster[];
};

export type MapExit = { from: string; to: string; at: Cell; side: Side; type: ExitType };

export type MapToken = { seat: number; tokenColour: TokenColour; initials: string; area: string; cell: Cell };

export type MapView = { dungeonName: string; areas: MapArea[]; exits: MapExit[]; tokens: MapToken[] };

export function mapView(state: SessionState, dungeon: Dungeon, role: 'gm' | 'player'): MapView {
	const fallback = dungeon.languages[0];
	// Sessions don't choose a language yet, so content shows in the default language.
	const t = (text: LocalizedText | null) => (text ? localize(text, fallback, fallback) : null);
	const revealed = new Set(state.revealed);
	const gm = role === 'gm';

	const areas: MapArea[] = dungeon.areas
		.filter((a) => gm || revealed.has(a.id))
		.map((a) => ({
			id: a.id,
			kind: a.kind,
			rect: a.rect,
			name: t(a.name),
			revealed: revealed.has(a.id),
			mood: gm ? t(a.mood) : null,
			notes: gm ? t(a.notes) : null,
			monsters: gm
				? a.monsters.map((m) => ({ label: m.label, name: t(m.name)!, count: formatDice(m.count) }))
				: []
		}));

	const exits: MapExit[] = dungeon.exits
		.filter((e) => gm || ((revealed.has(e.from) || revealed.has(e.to)) && e.type !== 'secret'))
		.map(({ from, to, at, side, type }) => ({ from, to, at, side, type }));

	const visibleAreas = new Set(areas.map((a) => a.id));
	const tokens: MapToken[] = state.players.flatMap((p) =>
		p.character && p.position && visibleAreas.has(p.position.area)
			? [
					{
						seat: p.seat,
						tokenColour: p.tokenColour,
						initials: initials(p.character.name),
						area: p.position.area,
						cell: p.position.cell
					}
				]
			: []
	);

	return { dungeonName: t(dungeon.name)!, areas, exits, tokens };
}
