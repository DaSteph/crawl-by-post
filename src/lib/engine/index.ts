/**
 * The game engine: the single place where game rules live.
 *
 * Pure and deterministic. Dice and clock are injected, and secrets are generated
 * by the caller and passed in with the command. The dungeon model is parsed from
 * its file by the caller too; the state only keeps the dungeon's id.
 */
import { initials, type Character } from '../character/model.ts';
import { cellsOf, type Cell, type Dungeon } from '../dungeon/model.ts';
import {
	passSpotlight,
	postAction,
	postChat,
	startCrawl,
	type Crawl,
	type LogEntry,
	type PassSpotlight,
	type PostAction,
	type PostChat,
	type Spotlight,
	type StartCrawl
} from './turns.ts';

export type Deps = {
	/** Rolls one die with the given number of sides, returning 1..sides. */
	dice: (sides: number) => number;
	now: () => Date;
};

/** Fixed token colour per seat. The actual colour values are design tokens in the UI. */
export const TOKEN_COLOURS = ['blue', 'purple', 'green', 'magenta'] as const;
export type TokenColour = (typeof TOKEN_COLOURS)[number];

export const MAX_PLAYERS = TOKEN_COLOURS.length;

export const MAX_INVENTORY_LENGTH = 2000;

/** Where a token stands: a square inside an area. */
export type Position = { area: string; cell: Cell };

export type PlayerSlot = {
	seat: number;
	secret: string;
	tokenColour: TokenColour;
	/** Rules values from the Shadowdarklings import. Absent until the player imports. */
	character?: Character;
	/** Live state, set when the character is imported. */
	hp?: number;
	inventory?: string;
	position?: Position;
};

/** A character card as a participant sees it. */
export type Sheet = {
	seat: number;
	tokenColour: TokenColour;
	initials: string;
	character: Character;
	hp: number;
	inventory: string;
};

export type SessionState = {
	id: string;
	name: string;
	createdAt: string;
	gmSecret: string;
	players: PlayerSlot[];
	/** File name of the dungeon without its extension. */
	dungeonId: string;
	/** Ids of the rooms and corridor segments everyone can see. */
	revealed: string[];
	/** Absent until the GM starts the first crawl. */
	crawl?: Crawl;
};

export type Command =
	| { type: 'createSession'; sessionId: string; name: string; gmSecret: string; dungeon: Dungeon }
	/** `by` is the secret of the participant issuing the command. */
	| { type: 'addPlayerSlot'; by: string; secret: string }
	/** The character is already parsed by the importer; the dungeon gives the start room. */
	| { type: 'importCharacter'; by: string; character: Character; dungeon: Dungeon }
	| { type: 'editInventory'; by: string; inventory: string }
	| StartCrawl
	| PostAction
	| PostChat
	| PassSpotlight;

export type EngineEvent =
	| { type: 'sessionCreated'; sessionId: string; dungeonId: string }
	| { type: 'areaRevealed'; areaId: string }
	| { type: 'playerSlotAdded'; seat: number; tokenColour: TokenColour }
	| { type: 'characterImported'; seat: number; name: string }
	| { type: 'inventoryEdited'; seat: number }
	/** A log entry. The server stores these as the session log. */
	| { type: 'logged'; entry: LogEntry }
	| { type: 'spotlightChanged'; spotlight: Spotlight }
	| { type: 'roundCompleted'; round: number };

export type CommandResult =
	| { ok: true; state: SessionState; events: EngineEvent[] }
	| { ok: false; reason: string };

export type Visitor =
	| { role: 'gm'; sessionName: string }
	| { role: 'player'; sessionName: string; seat: number; tokenColour: TokenColour }
	| { role: 'unknown' };

export function applyCommand(
	state: SessionState | null,
	command: Command,
	deps: Deps
): CommandResult {
	if (command.type === 'createSession') {
		const name = command.name.trim();
		if (!name) return { ok: false, reason: 'The session needs a name.' };
		const next: SessionState = {
			id: command.sessionId,
			name,
			createdAt: deps.now().toISOString(),
			gmSecret: command.gmSecret,
			players: [],
			dungeonId: command.dungeon.id,
			revealed: [command.dungeon.start]
		};
		return {
			ok: true,
			state: next,
			events: [
				{ type: 'sessionCreated', sessionId: next.id, dungeonId: next.dungeonId },
				{ type: 'areaRevealed', areaId: command.dungeon.start }
			]
		};
	}

	if (!state) return { ok: false, reason: 'No such session.' };
	switch (command.type) {
		case 'addPlayerSlot':
			return addPlayerSlot(state, command);
		case 'importCharacter':
			return importCharacter(state, command);
		case 'editInventory':
			return editInventory(state, command);
		case 'startCrawl':
			return startCrawl(state, command, deps);
		case 'postAction':
			return postAction(state, command, deps);
		case 'postChat':
			return postChat(state, command, deps);
		case 'passSpotlight':
			return passSpotlight(state, command, deps);
	}
}

type CommandOf<T extends Command['type']> = Extract<Command, { type: T }>;

function addPlayerSlot(state: SessionState, command: CommandOf<'addPlayerSlot'>): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can add players.' };
	if (state.players.length >= MAX_PLAYERS) {
		return { ok: false, reason: `A session has at most ${MAX_PLAYERS} players.` };
	}

	const seat = state.players.length + 1;
	const slot: PlayerSlot = {
		seat,
		secret: command.secret,
		tokenColour: TOKEN_COLOURS[seat - 1]
	};
	return {
		ok: true,
		state: { ...state, players: [...state.players, slot] },
		events: [{ type: 'playerSlotAdded', seat, tokenColour: slot.tokenColour }]
	};
}

function withPlayer(state: SessionState, seat: number, change: Partial<PlayerSlot>): SessionState {
	return { ...state, players: state.players.map((p) => (p.seat === seat ? { ...p, ...change } : p)) };
}

/** A free square in the start area, so tokens don't stack. Falls back to the first square. */
function startPosition(state: SessionState, dungeon: Dungeon): Position {
	const area = dungeon.areas.find((a) => a.id === dungeon.start)!;
	const taken = new Set(
		state.players.filter((p) => p.position?.area === area.id).map((p) => `${p.position!.cell.x},${p.position!.cell.y}`)
	);
	const cells = cellsOf(area.rect);
	const cell = cells.find((c) => !taken.has(`${c.x},${c.y}`)) ?? cells[0];
	return { area: area.id, cell };
}

function importCharacter(state: SessionState, command: CommandOf<'importCharacter'>): CommandResult {
	const player = state.players.find((p) => p.secret === command.by);
	if (!player) return { ok: false, reason: 'Only players can import a character.' };
	if (player.character) return { ok: false, reason: 'You have already imported a character.' };

	const { character } = command;
	return {
		ok: true,
		state: withPlayer(state, player.seat, {
			character,
			hp: character.maxHp,
			inventory: '',
			position: startPosition(state, command.dungeon)
		}),
		events: [{ type: 'characterImported', seat: player.seat, name: character.name }]
	};
}

function editInventory(state: SessionState, command: CommandOf<'editInventory'>): CommandResult {
	const player = state.players.find((p) => p.secret === command.by);
	if (!player) return { ok: false, reason: 'Only players have an inventory.' };
	if (!player.character) return { ok: false, reason: 'Import your character first.' };
	if (command.inventory.length > MAX_INVENTORY_LENGTH) {
		return { ok: false, reason: `The inventory can be at most ${MAX_INVENTORY_LENGTH} characters long.` };
	}
	return {
		ok: true,
		state: withPlayer(state, player.seat, { inventory: command.inventory }),
		events: [{ type: 'inventoryEdited', seat: player.seat }]
	};
}

export function resolveVisitor(state: SessionState, secret: string): Visitor {
	if (secret === state.gmSecret) return { role: 'gm', sessionName: state.name };
	const player = state.players.find((p) => p.secret === secret);
	if (player) {
		return {
			role: 'player',
			sessionName: state.name,
			seat: player.seat,
			tokenColour: player.tokenColour
		};
	}
	return { role: 'unknown' };
}

function sheetOf(p: PlayerSlot): Sheet | null {
	if (!p.character) return null;
	return {
		seat: p.seat,
		tokenColour: p.tokenColour,
		initials: initials(p.character.name),
		character: p.character,
		hp: p.hp ?? p.character.maxHp,
		inventory: p.inventory ?? ''
	};
}

/** The character cards the holder of `secret` may see: a player their own, the GM all of them. */
export function sheets(state: SessionState, secret: string): Sheet[] {
	const visible =
		secret === state.gmSecret ? state.players : state.players.filter((p) => p.secret === secret);
	return visible.map(sheetOf).filter((s): s is Sheet => s !== null);
}
