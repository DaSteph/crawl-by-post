import { fail } from '@sveltejs/kit';
import { createSession } from '#lib/server/sessions.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, url }) => {
		const name = String((await request.formData()).get('name') ?? '');
		const result = await createSession(name);
		if (!result.ok) return fail(400, { name, error: result.reason });

		// Returned once from the action and never stored client-side: the
		// "save this link" screen is the only place it is shown.
		return {
			created: {
				name: name.trim(),
				path: `/session/${result.sessionId}/${result.gmSecret}`,
				link: `${url.origin}/session/${result.sessionId}/${result.gmSecret}`
			}
		};
	}
};
