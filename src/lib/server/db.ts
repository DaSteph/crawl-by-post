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
		-- One row per device and participant link. A device can hold several links
		-- (e.g. a GM testing a player link), so the endpoint alone is not the key.
		CREATE TABLE IF NOT EXISTS push_subscriptions (
			session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			secret     text NOT NULL,
			endpoint   text NOT NULL,
			keys       jsonb NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (session_id, secret, endpoint)
		);
		CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint ON push_subscriptions (endpoint);
	`);
}
