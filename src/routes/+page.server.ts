import { fail } from '@sveltejs/kit';
import { listDungeons } from '#lib/server/dungeons.ts';
import { createSession } from '#lib/server/sessions.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ dungeons: await listDungeons() });

export const actions: Actions = {
	default: async ({ request, url }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '');
		const dungeon = String(data.get('dungeon') ?? '');
		const result = await createSession(name, dungeon);
		if (!result.ok) return fail(400, { name, dungeon, error: result.reason });

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
