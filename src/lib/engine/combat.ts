/**
 * Combat mode: the GM starts a fight in their turn, initiative is rolled for
 * every character and once for the monsters, and the GM → player rhythm goes
 * on. The GM has the monsters act in whichever GM turn they choose.
 *
 * In combat, light ticks once per round instead of per player action (see
 * `light.ts`) and wandering monster checks pause (see `wandering.ts`). Ending
 * the fight starts a new crawl right away.
 */
import type { CommandResult, Deps, SessionState } from './index.ts';
import { logged, newCrawl, rollInitiative, type Danger, type Spotlight } from './turns.ts';

export type StartCombat = { type: 'startCombat'; by: string };
/** `danger` is for the crawl that starts when the fight ends. */
export type EndCombat = { type: 'endCombat'; by: string; danger: Danger };

/** The monsters' single initiative roll: d20 + the best DEX modifier among the monsters on the map. */
export type MonsterInitiative = { d20: number; modifier: number; total: number };

export type CombatEntry = { kind: 'combatStarted' } | { kind: 'combatEnded' };

/** Combat starts and ends in the GM's turn, so no challenge or damage roll is cut short. */
function gmTurn(state: SessionState, by: string) {
	if (by !== state.gmSecret) return { ok: false as const, reason: 'Only the GM can start or end combat.' };
	const crawl = state.crawl;
	if (!crawl) return { ok: false as const, reason: 'Start a crawl first.' };
	if (crawl.spotlight.kind !== 'gm') return { ok: false as const, reason: 'You can do that in your turn.' };
	return { ok: true as const, crawl, spotlight: crawl.spotlight };
}

export function startCombat(state: SessionState, command: StartCombat, deps: Deps): CommandResult {
	const found = gmTurn(state, command.by);
	if (!found.ok) return found;
	const { crawl } = found;
	if (crawl.combat) return { ok: false, reason: 'The fight is on already.' };

	const at = deps.now().toISOString();
	const { rolls, rollOffs, winner, best, order } = rollInitiative(state, deps);
	const d20 = deps.dice(20);
	const modifier = Math.max(0, ...(state.monsters ?? []).map((m) => m.dex ?? 0));
	const monsters: MonsterInitiative = { d20, modifier, total: d20 + modifier };
	// Characters win ties.
	const gmFirst = monsters.total > best;
	const spotlight: Spotlight = gmFirst
		? { kind: 'gm', afterSeat: order[order.length - 1], opening: true }
		: { kind: 'player', seat: winner };

	return {
		ok: true,
		state: {
			...state,
			// A wandering monster check waiting for the GM is dropped: the fight's new crawl starts clean anyway.
			crawl: { danger: crawl.danger, order, round: 1, spotlight, combat: true }
		},
		events: [
			logged({ at, kind: 'combatStarted' }),
			logged({ at, kind: 'initiative', rolls, rollOffs, winner, monsters, ...(gmFirst ? { gmFirst } : {}) }),
			{ type: 'spotlightChanged', spotlight }
		]
	};
}

export function endCombat(state: SessionState, command: EndCombat, deps: Deps): CommandResult {
	const found = gmTurn(state, command.by);
	if (!found.ok) return found;
	if (!found.crawl.combat) return { ok: false, reason: 'There is no fight to end.' };
	const at = deps.now().toISOString();
	const result = newCrawl(state, command.danger, deps);
	if (!result.ok) return result;
	return { ...result, events: [logged({ at, kind: 'combatEnded' }), ...result.events] };
}
