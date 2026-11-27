/**
 * Turn timers on pg-boss: the engine's `turnTimerStarted` / `turnTimerStopped`
 * events become scheduled and cancelled jobs, written in the same transaction
 * as the session state. When a job comes due, the worker hands it back to the
 * engine as a `turnTimerFired` command.
 *
 * Job ids are derived from session, clock and kind, so cancelling needs no
 * bookkeeping. The engine ignores jobs for a clock that is no longer current,
 * so a cancellation that never happened is harmless.
 */
import { createHash } from 'node:crypto';
import { PgBoss, type Db } from 'pg-boss';
import type { PoolClient } from 'pg';
import type { EngineEvent } from '#lib/engine/index.ts';
import { DATABASE_URL } from '$app/env/private';

const QUEUE = 'turn-timer';

type Kind = 'reminder' | 'timeout';
export type TurnTimerJob = { sessionId: string; clock: number; kind: Kind };

let boss: PgBoss | undefined;

function started(): PgBoss {
	if (!boss) throw new Error('The job queue has not been started.');
	return boss;
}

/** A stable uuid for one timer, so it can be cancelled from its parts alone. */
function jobId(sessionId: string, clock: number, kind: Kind): string {
	const h = createHash('sha256').update(`${sessionId}:${clock}:${kind}`).digest('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Lets pg-boss write inside the caller's open transaction. */
function inTransaction(client: PoolClient): Db {
	return { executeSql: (text, values) => client.query(text, values) };
}

/** Schedules and cancels the timers a command's events ask for, inside its transaction. */
export async function applyTimerEvents(client: PoolClient, sessionId: string, events: EngineEvent[]): Promise<void> {
	const db = inTransaction(client);
	for (const event of events) {
		if (event.type === 'turnTimerStopped') {
			const ids = (['reminder', 'timeout'] as const).map((kind) => jobId(sessionId, event.clock, kind));
			await started().cancel(QUEUE, ids, { db });
		}
		if (event.type === 'turnTimerStarted') {
			const timers: [Kind, string | null][] = [
				['reminder', event.reminderAt],
				['timeout', event.timeoutAt]
			];
			for (const [kind, at] of timers) {
				if (!at) continue;
				const data: TurnTimerJob = { sessionId, clock: event.clock, kind };
				await started().send(QUEUE, data, { id: jobId(sessionId, event.clock, kind), startAfter: new Date(at), db });
			}
		}
	}
}

/** Starts pg-boss in this process and runs `fire` for every timer that comes due. */
export async function startJobs(fire: (job: TurnTimerJob) => Promise<void>): Promise<void> {
	if (!DATABASE_URL) throw new Error('DATABASE_URL is not set.');
	boss = new PgBoss({ connectionString: DATABASE_URL });
	boss.on('error', (e) => console.error('Job queue error:', e));
	await boss.start();
	await boss.createQueue(QUEUE);
	await boss.work<TurnTimerJob>(QUEUE, async (jobs) => {
		for (const job of jobs) await fire(job.data);
	});
}
