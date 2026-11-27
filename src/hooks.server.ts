import type { ServerInit } from '@sveltejs/kit/hooks';
import { migrate } from '#lib/server/db.ts';
import { startJobs } from '#lib/server/jobs.ts';
import { fireTurnTimer } from '#lib/server/sessions.ts';

export const init: ServerInit = async () => {
	await migrate();
	await startJobs(fireTurnTimer);
};
