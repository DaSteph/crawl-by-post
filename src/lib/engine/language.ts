/**
 * The session language: which of the dungeon file's languages its prose (names,
 * mood texts, notes) shows in. The GM picks it; UI text is not affected.
 */
import type { Dungeon } from '../dungeon/model.ts';
import type { CommandResult, SessionState } from './index.ts';

export type SetLanguage = { type: 'setLanguage'; by: string; language: string; dungeon: Dungeon };

/**
 * The language content shows in: the GM's choice while the dungeon file still has
 * it, otherwise the file's default language.
 */
export function sessionLanguage(state: SessionState, dungeon: Dungeon): string {
	const chosen = state.language;
	return chosen && dungeon.languages.includes(chosen) ? chosen : dungeon.languages[0];
}

export function setLanguage(state: SessionState, command: SetLanguage): CommandResult {
	if (command.by !== state.gmSecret) return { ok: false, reason: 'Only the GM can change the language.' };
	const { language, dungeon } = command;
	if (!dungeon.languages.includes(language)) {
		return { ok: false, reason: `The dungeon has no text in "${language}". Pick one of: ${dungeon.languages.join(', ')}.` };
	}
	if (sessionLanguage(state, dungeon) === language) return { ok: true, state, events: [] };
	return {
		ok: true,
		state: { ...state, language },
		events: [{ type: 'languageChanged', language }]
	};
}
