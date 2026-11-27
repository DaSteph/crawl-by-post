/**
 * Decides who gets a push after a command, and what it says. Pure, so the
 * server adapter only has to deliver what this returns.
 */
import type { EngineEvent, SessionState } from '../engine/index.ts';
import type { Spotlight } from '../engine/turns.ts';
import { people } from '../engine/log.ts';
import { text } from '../text.ts';

export type PushMessage = {
	/** Current secret of the recipient. Pushes go only to subscriptions stored for this secret. */
	secret: string;
	title: string;
	body: string;
	/** Path of the recipient's own link, opened when the notification is tapped. */
	url: string;
};

/**
 * The push for the new spotlight holder, if the command moved the spotlight.
 * Nobody is pushed for a turn they just handed to themselves (e.g. a hit that
 * keeps the spotlight for the damage roll): they are looking at the app already.
 */
export function spotlightPush(state: SessionState, events: EngineEvent[], by: string | null): PushMessage | null {
	const changed = events.findLast((e) => e.type === 'spotlightChanged');
	if (!changed) return null;
	const spotlight = changed.spotlight;
	const secret = spotlight.kind === 'gm' ? state.gmSecret : state.players.find((p) => p.seat === spotlight.seat)?.secret;
	if (!secret || secret === by) return null;
	return {
		secret,
		title: state.name,
		body: body(state, spotlight),
		url: `/session/${state.id}/${secret}`
	};
}

function body(state: SessionState, spotlight: Spotlight): string {
	switch (spotlight.kind) {
		case 'player':
			return text.push.yourTurn;
		case 'gm': {
			const name = people(state).find((p) => p.seat === spotlight.afterSeat)?.name ?? text.session.player(spotlight.afterSeat);
			return text.push.gmTurn(name);
		}
		case 'challenge':
			return text.push.challenge;
		case 'damage':
			return text.push.damage;
	}
}
