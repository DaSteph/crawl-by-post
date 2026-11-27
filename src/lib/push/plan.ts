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

function secretOf(state: SessionState, who: 'gm' | number): string | undefined {
	return who === 'gm' ? state.gmSecret : state.players.find((p) => p.seat === who)?.secret;
}

function message(state: SessionState, secret: string, body: string): PushMessage {
	return { secret, title: state.name, body, url: `/session/${state.id}/${secret}` };
}

const nameOf = (state: SessionState, seat: number) =>
	people(state).find((p) => p.seat === seat)?.name ?? text.session.player(seat);

/**
 * The push a command calls for, if any: the GM when a player's turn timed out,
 * the spotlight holder when their reminder is due, or the new spotlight holder.
 * Nobody is pushed for a turn they just handed to themselves (e.g. a hit that
 * keeps the spotlight for the damage roll): they are looking at the app already.
 */
export function planPush(state: SessionState, events: EngineEvent[], by: string | null): PushMessage | null {
	const timedOut = events.find((e) => e.type === 'playerTimedOut');
	if (timedOut) return message(state, state.gmSecret, text.push.playerTimedOut(nameOf(state, timedOut.seat)));

	const reminder = events.find((e) => e.type === 'turnReminderDue');
	if (reminder) {
		const secret = secretOf(state, reminder.holder);
		const spotlight = state.crawl?.spotlight;
		return secret && spotlight ? message(state, secret, text.push.reminder(body(state, spotlight))) : null;
	}

	const changed = events.findLast((e) => e.type === 'spotlightChanged');
	if (!changed) return null;
	const spotlight = changed.spotlight;
	const secret = secretOf(state, spotlight.kind === 'gm' ? 'gm' : spotlight.seat);
	if (!secret || secret === by) return null;
	return message(state, secret, body(state, spotlight));
}

function body(state: SessionState, spotlight: Spotlight): string {
	switch (spotlight.kind) {
		case 'player':
			return text.push.yourTurn;
		case 'gm':
			return text.push.gmTurn(nameOf(state, spotlight.afterSeat));
		case 'challenge':
			return text.push.challenge;
		case 'damage':
			return text.push.damage;
	}
}
