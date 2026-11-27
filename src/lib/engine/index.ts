/**
 * The game engine: the single place where game rules live.
 *
 * Pure and deterministic. Dice and clock are injected, and secrets are generated
 * by the caller and passed in with the command.
 */

export type Deps = {
	/** Rolls one die with the given number of sides, returning 1..sides. */
	dice: (sides: number) => number;
	now: () => Date;
};

/** Fixed token colour per seat. The actual colour values are design tokens in the UI. */
export const TOKEN_COLOURS = ['blue', 'purple', 'green', 'magenta'] as const;
export type TokenColour = (typeof TOKEN_COLOURS)[number];

export const MAX_PLAYERS = TOKEN_COLOURS.length;

export type PlayerSlot = {
	seat: number;
	secret: string;
	tokenColour: TokenColour;
};

export type SessionState = {
	id: string;
	name: string;
	createdAt: string;
	gmSecret: string;
	players: PlayerSlot[];
};

export type Command =
	| { type: 'createSession'; sessionId: string; name: string; gmSecret: string }
	/** `by` is the secret of the participant issuing the command. */
	| { type: 'addPlayerSlot'; by: string; secret: string };

export type EngineEvent =
	| { type: 'sessionCreated'; sessionId: string }
	| { type: 'playerSlotAdded'; seat: number; tokenColour: TokenColour };

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
			players: []
		};
		return { ok: true, state: next, events: [{ type: 'sessionCreated', sessionId: next.id }] };
	}

	if (!state) return { ok: false, reason: 'No such session.' };
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
