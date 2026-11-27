/**
 * What each participant sees of the dungeon. Players get revealed areas only and
 * nothing GM-only; the GM gets everything, with each area's revealed flag.
 */
import { formatDice } from './dice.ts';
import { localize, type Dungeon, type ExitType, type LocalizedText, type Rect, type Cell, type Side } from '../dungeon/model.ts';
import { initials } from '../character/model.ts';
import type { SessionState, TokenColour } from './index.ts';
import { spotlightHolder } from './turns.ts';
import { doorways, movesFor, type Moves } from './movement.ts';
import { conditionOf, isDying, type Condition } from './monsters.ts';
import type { AttackOption } from '../dungeon/model.ts';
import { burningLights, flameLevel, inDarkness, isLit, type AreaLight, type FlameLevel } from './light.ts';

/** A monster listed for an area in the dungeon file. `index` is what the GM places it by. */
export type MapMonster = { index: number; label: string; name: string; count: string };

/** A monster token on the map. Players get its condition only; HP, AC and attacks are for the GM. */
export type MapMonsterToken = {
	id: string;
	name: string;
	area: string;
	cell: Cell;
	condition: Condition;
	gm: { hp: number; maxHp: number; ac: number; attacks: AttackOption[] } | null;
};

export type MapArea = {
	id: string;
	kind: 'room' | 'corridor';
	rect: Rect;
	name: string | null;
	revealed: boolean;
	/** False when no light burns here. Drawn hatched. */
	lit: boolean;
	/** The GM's light ruling for the area; always null for players. */
	lightOverride: AreaLight | null;
	/** GM only; null for players. */
	mood: string | null;
	notes: string | null;
	monsters: MapMonster[];
};

export type MapExit = { from: string; to: string; at: Cell; side: Side; type: ExitType };

export type MapToken = {
	seat: number;
	tokenColour: TokenColour;
	initials: string;
	area: string;
	cell: Cell;
	/** True for the player holding the spotlight. */
	spotlight: boolean;
	/** True at 0 HP. */
	dying: boolean;
	/** True when the character carries a burning light source. */
	carriesLight: boolean;
	/** True when the character stands in an area without light. */
	dark: boolean;
};

/**
 * A burning light source in the torch tracker. Everyone sees its flame level;
 * the exact counter is the GM's, and null for players.
 */
export type MapLight = { id: number; seat: number; kind: 'torch'; level: FlameLevel; counter: number | null };

/**
 * An unknown area behind a doorway, drawn as a dashed "?" on its first square.
 * `doorway` is the known square in front of it; `area` is for the GM only.
 */
export type MapUnknown = { at: Cell; doorway: Cell; area: string | null };

export type MapView = {
	dungeonName: string;
	areas: MapArea[];
	exits: MapExit[];
	tokens: MapToken[];
	monsters: MapMonsterToken[];
	unknown: MapUnknown[];
	lights: MapLight[];
	/** Where the viewer can move their token now; null unless they hold the spotlight. */
	moves: Moves | null;
};

/** `seat` is the viewing player's seat, for their moves. */
export function mapView(state: SessionState, dungeon: Dungeon, role: 'gm' | 'player', seat?: number): MapView {
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
			lit: isLit(state, a.id),
			lightOverride: gm ? (state.areaLight?.[a.id] ?? null) : null,
			mood: gm ? t(a.mood) : null,
			notes: gm ? t(a.notes) : null,
			monsters: gm
				? a.monsters.map((m, index) => ({ index, label: m.label, name: t(m.name)!, count: formatDice(m.count) }))
				: []
		}));

	const exits: MapExit[] = dungeon.exits
		.filter((e) => gm || visibleToPlayers(e.from, e.to, e.type, revealed))
		.map(({ from, to, at, side, type }) => ({ from, to, at, side, type }));

	const visibleAreas = new Set(areas.map((a) => a.id));
	const holder = spotlightHolder(state);
	const tokens: MapToken[] = state.players.flatMap((p) =>
		p.character && p.position && visibleAreas.has(p.position.area)
			? [
					{
						seat: p.seat,
						tokenColour: p.tokenColour,
						initials: initials(p.character.name),
						area: p.position.area,
						cell: p.position.cell,
						spotlight: holder === p.seat,
						dying: isDying(p),
						carriesLight: (p.lights?.length ?? 0) > 0,
						dark: inDarkness(state, p.seat)
					}
				]
			: []
	);

	// Players see monsters in revealed areas only; the GM sees every one.
	const monsters: MapMonsterToken[] = (state.monsters ?? [])
		.filter((m) => gm || revealed.has(m.position.area))
		.map((m) => ({
			id: m.id,
			name: m.name,
			area: m.position.area,
			cell: m.position.cell,
			condition: conditionOf(m.hp, m.maxHp),
			gm: gm ? { hp: m.hp, maxHp: m.maxHp, ac: m.ac, attacks: m.attacks } : null
		}));

	const unknown: MapUnknown[] = doorways(state, dungeon).map((d) => ({
		at: d.beyond,
		doorway: d.doorway.cell,
		area: gm ? d.area : null
	}));
	const moves = !gm && seat !== undefined ? movesFor(state, dungeon, seat) : null;

	// Light is table knowledge, wherever its carrier is; only the counter is secret.
	const lights: MapLight[] = burningLights(state).map(({ seat, light }) => ({
		id: light.id,
		seat,
		kind: light.kind,
		level: flameLevel(light.counter),
		counter: gm ? light.counter : null
	}));

	return { dungeonName: t(dungeon.name)!, areas, exits, tokens, monsters, unknown, lights, moves };
}

/** Players see exits of revealed areas; a secret one only once both its sides are revealed (found). */
function visibleToPlayers(from: string, to: string, type: ExitType, revealed: Set<string>): boolean {
	if (type === 'secret') return revealed.has(from) && revealed.has(to);
	return revealed.has(from) || revealed.has(to);
}
