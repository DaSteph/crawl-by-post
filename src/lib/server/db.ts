import pg from 'pg';
import { DATABASE_URL } from '$app/env/private';

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
	if (!pool) {
		if (!DATABASE_URL) throw new Error('DATABASE_URL is not set.');
		pool = new pg.Pool({ connectionString: DATABASE_URL });
	}
	return pool;
}

/** Idempotent schema setup, run once at server start. */
export async function migrate(): Promise<void> {
	await db().query(`
		CREATE TABLE IF NOT EXISTS sessions (
			id         text PRIMARY KEY,
			state      jsonb NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE IF NOT EXISTS events (
			id         bigserial PRIMARY KEY,
			session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			type       text NOT NULL,
			payload    jsonb NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE INDEX IF NOT EXISTS events_session_id ON events (session_id, id);
	`);
}
