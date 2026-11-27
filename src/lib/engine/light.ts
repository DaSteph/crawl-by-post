/**
 * Light and torches: every burning light source has a secret counter that
 * ticks down once per completed player action and goes out at zero. In
 * combat it ticks once per round instead, and a counter that runs out there
 * (on the GM's turn that ends the round) goes out at the start of a random
 * player turn after that, so darkness falls without warning. A
 * character is lit when a burning light source is in their room or corridor
 * segment; the GM can override any area's light state.
 *
 * Players only ever see the flame level. The exact counter is the GM's.
 */
import type { Dungeon } from '../dungeon/model.ts';
import type { CommandResult, Deps, EngineEvent, PlayerSlot, SessionState } from './index.ts';
import type { Edge } from './challenges.ts';
import { logged } from './turns.ts';

export const FLAME_LEVELS = ['bright', 'flickering', 'guttering'] as const;
export type FlameLevel = (typeof FLAME_LEVELS)[number];

/** A new torch burns for 1d20 + this many player actions. */
export const TORCH_BASE = 10;
export const MAX_LIGHT_COUNTER = 99;

/** Counters above this burn bright, so every new torch (11 or more) starts bright. */
const BRIGHT_ABOVE = 10;
/** Counters above this (and up to `BRIGHT_ABOVE`) flicker; the last few gutter. */
const FLICKERING_ABOVE = 3;

/**
 * A burning light source. It belongs to the room of the character carrying it.
 * `outIn` is set once its counter ran out in combat: it burns on (at 0) until
 * that many player turns have started, then goes out.
 */
export type LightSource = { id: number; kind: 'torch'; counter: number; outIn?: number };

/** The GM's ruling on an area's light, overriding whatever is carried there. */
export type AreaLight = 'lit' | 'dark';

export type LightTorch = { type: 'lightTorch'; by: string };
export type SetLightCounter = { type: 'setLightCounter'; by: string; id: number; counter: number };
/** `light` null removes the GM's override, so carried light counts again. */
export type SetAreaLight = { type: 'setAreaLight'; by: string; areaId: string; light: AreaLight | null; dungeon: Dungeon };

export type LightEntry = { kind: 'torchLit'; seat: number } | { kind: 'torchOut'; seat: number };

export function flameLevel(counter: number): FlameLevel {
	if (counter > BRIGHT_ABOVE) return 'bright';
	if (counter > FLICKERING_ABOVE) return 'flickering';
	return 'guttering';
}

/** Light sources burning right now, with the seat carrying each. */
export function burningLights(state: SessionState): { seat: number; light: LightSource }[] {
	return state.players.flatMap((p) => (p.lights ?? []).map((light) => ({ seat: p.seat, light })));
}

/** True when the area has light: the GM's override if there is one, otherwise a carried light source. */
export function isLit(state: SessionState, areaId: string): boolean {
	const override = state.areaLight?.[areaId];
	if (override) return override === 'lit';
	return state.players.some((p) => p.position?.area === areaId && (p.lights?.length ?? 0) > 0);
}

/** True when the character stands in an area without light. */
export function inDarkness(state: SessionState, seat: number): boolean {
	const area = state.players.find((p) => p.seat === seat)?.position?.area;
	return area !== undefined && !isLit(state, area);
}

/**
 * The advantage the GM's forms preset for a character: disadvantage on their
 * own challenges in darkness, advantage for monsters attacking them there.
 */
export function darknessPresets(dark: boolean): { challenge: Edge; monsterAttack: Edge } {
	return dark ? { challenge: 'disadvantage', monsterAttack: 'advantage' } : { challenge: null, monsterAttack: null };
}

function withLights(state: SessionState, seat: number, lights: LightSource[]): SessionState {
	return { ...state, players: state.players.map((p) => (p.seat === seat ? { ...p, lights } : p)) };
}

export function lightTorch(state: SessionState, command: LightTorch, deps: Deps): CommandResult {
	const player = state.players.find((p) => p.secret === command.by);
	if (!player) return { ok: false, reason: 'Only players can light a torch.' };
	if (!player.character) return { ok: false, reason: 'Import your character first.' };
	// Also keeps a double tap from burning two torches at once.
	if (player.lights?.length) return { ok: false, reason: 'You already carry a burning light.' };

	const id = (state.lastLightId ?? 0) + 1;
	const light: LightSource = { id, kind: 'torch', counter: deps.dice(20) + TORCH_BASE };
	const next = { ...withLights(state, player.seat, [light]), lastLightId: id };
	return {
		ok: true,
		state: next,
		events: [
			logged({ at: deps.now().toISOString(), kind: 'torchLit', seat: player.seat }),
			{ type: 'lightLit', seat: player.seat, id }
		]
	};
}

/** Puts out a light source: it leaves its carrier, with a log entry everyone sees. */
function extinguish(state: SessionState, seat: number, id: number, at: string): { state: SessionState; events: EngineEvent[] } {
	const player = state.players.find((p) => p.seat === seat)!;
	return {
		state: withLights(state, seat, (player.lights ?? []).filter((l) => l.id !== id)),
		events: [logged({ at, kind: 'torchOut', seat }), { type: 'torchExtinguished', seat, id }]
	};
}

export function setLightCounter(state: SessionState, command: SetLightCounter, deps: Deps): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can change a light’s counter.' };
	const found = burningLights(state).find((b) => b.light.id === command.id);
	if (!found) return { ok: false, reason: 'That light has gone out already.' };
	const { counter } = command;
	if (!Number.isInteger(counter) || counter < 0 || counter > MAX_LIGHT_COUNTER) {
		return { ok: false, reason: `The counter must be a whole number from 0 to ${MAX_LIGHT_COUNTER}.` };
	}

	const { seat, light } = found;
	// Zero is the GM putting the light out (wind, water, a ruling).
	if (counter === 0) {
		const out = extinguish(state, seat, light.id, deps.now().toISOString());
		return { ok: true, state: out.state, events: out.events };
	}
	const lights = state.players.find((p) => p.seat === seat)!.lights!;
	// A new counter also calls off a light that ran out in combat.
	const next = withLights(state, seat, lights.map((l) => (l.id === light.id ? { id: l.id, kind: l.kind, counter } : l)));
	const events: EngineEvent[] = [{ type: 'lightCounterSet', id: light.id }];
	const level = flameLevel(counter);
	if (level !== flameLevel(light.counter)) events.push({ type: 'torchLevelChanged', seat, id: light.id, level });
	return { ok: true, state: next, events };
}

export function setAreaLight(state: SessionState, command: SetAreaLight): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can rule on an area’s light.' };
	if (!command.dungeon.areas.some((a) => a.id === command.areaId)) return { ok: false, reason: 'No such area.' };
	if (command.light !== null && command.light !== 'lit' && command.light !== 'dark') {
		return { ok: false, reason: 'Pick lit, dark or carried light.' };
	}
	const areaLight = { ...state.areaLight };
	if (command.light) areaLight[command.areaId] = command.light;
	else delete areaLight[command.areaId];
	return {
		ok: true,
		state: { ...state, areaLight },
		events: [{ type: 'areaLightSet', areaId: command.areaId, light: command.light }]
	};
}

function withLight(state: SessionState, seat: number, light: LightSource): SessionState {
	const player: PlayerSlot = state.players.find((p) => p.seat === seat)!;
	return withLights(state, seat, player.lights!.map((l) => (l.id === light.id ? light : l)));
}

/**
 * Burns every light source down by one tick. At zero a light goes out, except
 * in combat, where it goes out at the start of a random player turn to come.
 */
function tick(state: SessionState, deps: Deps, at: string): { state: SessionState; events: EngineEvent[] } {
	const combat = Boolean(state.crawl?.combat);
	const events: EngineEvent[] = [];
	let next = state;
	for (const { seat, light } of burningLights(state)) {
		// Already burnt down: it waits for its player turn.
		if (light.outIn !== undefined) continue;
		const counter = light.counter - 1;
		if (counter <= 0 && combat) {
			const outIn = deps.dice(state.crawl!.order.length);
			next = withLight(next, seat, { ...light, counter: 0, outIn });
			events.push({ type: 'lightRanOut', seat, id: light.id, outIn });
			continue;
		}
		if (counter <= 0) {
			const out = extinguish(next, seat, light.id, at);
			next = out.state;
			events.push(...out.events);
			continue;
		}
		next = withLight(next, seat, { ...light, counter });
		const level = flameLevel(counter);
		if (level !== flameLevel(light.counter)) events.push({ type: 'torchLevelChanged', seat, id: light.id, level });
	}
	return { state: next, events };
}

/** A player turn starts: lights that ran out in combat come one turn closer to going out. */
function playerTurnStarted(state: SessionState, at: string): { state: SessionState; events: EngineEvent[] } {
	const events: EngineEvent[] = [];
	let next = state;
	for (const { seat, light } of burningLights(state)) {
		if (light.outIn === undefined) continue;
		if (light.outIn <= 1) {
			const out = extinguish(next, seat, light.id, at);
			next = out.state;
			events.push(...out.events);
			continue;
		}
		next = withLight(next, seat, { ...light, outIn: light.outIn - 1 });
	}
	return { state: next, events };
}

/**
 * Runs after every successful command. In crawl mode each completed player
 * action (an action post, a skipped turn, a turn the GM played) burns every
 * light source down by one; GM turns, passes and accept or damage turns
 * complete no player action. In combat, each completed round burns them down
 * by one instead. Every player turn that starts brings a light that ran out
 * in combat closer to going out.
 */
export function burnLights(result: CommandResult, deps: Deps): CommandResult {
	if (!result.ok) return result;
	const tickOn = result.state.crawl?.combat ? 'roundCompleted' : 'playerActionCompleted';
	const turnStarts = (e: EngineEvent) => e.type === 'spotlightChanged' && e.spotlight.kind === 'player';
	if (!result.events.some((e) => e.type === tickOn || turnStarts(e))) return result;
	const at = deps.now().toISOString();
	let state = result.state;
	const events = [...result.events];
	// In order: a round that completes on the GM's turn comes before the next player turn starts.
	for (const e of result.events) {
		const step = e.type === tickOn ? tick(state, deps, at) : turnStarts(e) ? playerTurnStarted(state, at) : null;
		if (!step) continue;
		state = step.state;
		events.push(...step.events);
	}
	return { ok: true, state, events };
}
