/**
 * Dungeon files live on disk in DUNGEONS_DIR, not in the database. They are
 * parsed on demand and cached until the file's modification time changes.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { DUNGEONS_DIR } from '$app/env/private';
import { formatError, parseDungeon } from '#lib/dungeon/parse.ts';
import type { Dungeon } from '#lib/dungeon/model.ts';
import { localize } from '#lib/dungeon/model.ts';

const EXTENSIONS = ['.yaml', '.yml', '.json'];
const ID = /^[a-z0-9][a-z0-9_-]*$/i;

export type DungeonLoad =
	| { ok: true; dungeon: Dungeon }
	| { ok: false; reason: 'missing' }
	| { ok: false; reason: 'invalid'; errors: string[] };

export type DungeonListing =
	| { id: string; ok: true; name: string }
	| { id: string; ok: false; errors: string[] };

const cache = new Map<string, { mtimeMs: number; result: DungeonLoad }>();

async function findFile(id: string): Promise<string | null> {
	if (!ID.test(id)) return null;
	for (const ext of EXTENSIONS) {
		const path = join(DUNGEONS_DIR, id + ext);
		try {
			if ((await stat(path)).isFile()) return path;
		} catch {
			// try the next extension
		}
	}
	return null;
}

export async function loadDungeon(id: string): Promise<DungeonLoad> {
	const path = await findFile(id);
	if (!path) return { ok: false, reason: 'missing' };
	const { mtimeMs } = await stat(path);
	const cached = cache.get(path);
	if (cached && cached.mtimeMs === mtimeMs) return cached.result;

	const parsed = parseDungeon(await readFile(path, 'utf8'), id);
	const result: DungeonLoad = parsed.ok
		? { ok: true, dungeon: parsed.dungeon }
		: { ok: false, reason: 'invalid', errors: parsed.errors.map(formatError) };
	cache.set(path, { mtimeMs, result });
	return result;
}

/** Every dungeon file in the directory, valid or not, sorted by id. */
export async function listDungeons(): Promise<DungeonListing[]> {
	let names: string[];
	try {
		names = await readdir(DUNGEONS_DIR);
	} catch {
		return [];
	}
	const ids = [
		...new Set(
			names
				.filter((n) => EXTENSIONS.includes(extname(n).toLowerCase()))
				.map((n) => n.slice(0, -extname(n).length))
				.filter((id) => ID.test(id))
		)
	].sort();
	return Promise.all(
		ids.map(async (id): Promise<DungeonListing> => {
			const result = await loadDungeon(id);
			if (result.ok) {
				const fallback = result.dungeon.languages[0];
				return { id, ok: true, name: localize(result.dungeon.name, fallback, fallback) };
			}
			return { id, ok: false, errors: result.reason === 'invalid' ? result.errors : ['file not found'] };
		})
	);
}
