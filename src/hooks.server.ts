import type { ServerInit } from '@sveltejs/kit/hooks';
import { migrate } from '#lib/server/db.ts';

export const init: ServerInit = async () => {
	await migrate();
};
