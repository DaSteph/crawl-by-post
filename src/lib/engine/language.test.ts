import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDungeon } from '../dungeon/parse.ts';
import { applyCommand, type Command, type Deps, type SessionState } from './index.ts';
import { mapView } from './map.ts';

// Example dungeon (dungeons/example.yaml): languages [en, de], r1 is the start room,
// r2 holds the goblins.
const parsed = parseDungeon(readFileSync('dungeons/example.yaml', 'utf8'), 'example');
if (!parsed.ok) throw new Error('the example dungeon must parse');
const dungeon = parsed.dungeon;

const deps: Deps = { dice: () => 3, now: () => new Date('2026-11-27T12:00:00Z') };

function run(state: SessionState | null, command: Command) {
	const result = applyCommand(state, command, deps);
	if (!result.ok) throw new Error(result.reason);
	return result;
}

const created = () => run(null, { type: 'createSession', sessionId: 's1', name: 'Chapel', gmSecret: 'gm', dungeon }).state;
const setLanguage = (language: string, by = 'gm'): Command => ({ type: 'setLanguage', by, language, dungeon });

describe('session language', () => {
	it('shows content in the file’s default language until the GM picks one', () => {
		const view = mapView(created(), dungeon, 'gm');
		expect(view.language).toBe('en');
		expect(view.languages).toEqual(['en', 'de']);
		expect(view.dungeonName).toBe('The Drowned Chapel');
	});

	it('switches names, mood texts and notes to the chosen language', () => {
		const result = run(created(), setLanguage('de'));
		expect(result.events).toEqual([{ type: 'languageChanged', language: 'de' }]);
		const view = mapView(result.state, dungeon, 'gm');
		expect(view.language).toBe('de');
		expect(view.dungeonName).toBe('Die versunkene Kapelle');
		const r1 = view.areas.find((a) => a.id === 'r1')!;
		expect(r1.name).toBe('Eingangshalle');
		expect(r1.mood).toContain('Kalte Luft');
		expect(view.areas.find((a) => a.id === 'r2')!.monsters[0].name).toBe('Goblin');
		expect(view.wandering[0].name).toBe('Riesenratte');
	});

	it('falls back to the default language for text that has no translation', () => {
		const state = run(created(), setLanguage('de')).state;
		// r1's notes are a plain string, which counts as English.
		const r1 = mapView(state, dungeon, 'gm').areas.find((a) => a.id === 'r1')!;
		expect(r1.notes).toContain('loose flagstone');
	});

	it('tells players the language but not the list to choose from', () => {
		let state = run(created(), setLanguage('de')).state;
		state = run(state, { type: 'addPlayerSlot', by: 'gm', secret: 'p1' }).state;
		const view = mapView(state, dungeon, 'player', 1);
		expect(view.language).toBe('de');
		expect(view.languages).toEqual([]);
		expect(view.areas[0].name).toBe('Eingangshalle');
	});

	it('names monsters placed afterwards in the chosen language', () => {
		const state = run(created(), setLanguage('de')).state;
		const placed = run(state, { type: 'placeMonster', by: 'gm', areaId: 'r3', index: 0, dungeon }).state;
		expect(placed.monsters![0].name).toBe('Skelett');
	});

	it('only lets the GM change it, and only to a language the file has', () => {
		const state = created();
		const notGm = applyCommand(state, setLanguage('de', 'p1'), deps);
		expect(notGm).toEqual({ ok: false, reason: 'Only the GM can change the language.' });
		const unknown = applyCommand(state, setLanguage('fr'), deps);
		expect(unknown.ok).toBe(false);
	});

	it('changes nothing when the language is already the current one', () => {
		expect(run(created(), setLanguage('en')).events).toEqual([]);
	});

	it('falls back to the default when the file no longer has the chosen language', () => {
		const state = run(created(), setLanguage('de')).state;
		const englishOnly = { ...dungeon, languages: ['en'] };
		expect(mapView(state, englishOnly, 'gm').language).toBe('en');
	});
});
