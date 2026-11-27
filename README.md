# crawl-by-post

Asynchronous OSR dungeon crawls in short, phone-sized turns. A mobile-first PWA built with SvelteKit and Postgres.

## Development

Requires Node 22.17+ (see `.nvmrc`) and Docker for the local database.

```sh
docker compose -f compose.dev.yaml up -d   # Postgres on localhost:5432
cp .env.example .env
npm install
npm run dev
```

- `npm test` runs the tests (Vitest): game engine, dungeon file parser, map geometry, Shadowdarklings importer.
- `npm run check` type-checks the project.

The database schema is created automatically on server start. Turn reminders and timeouts are jobs in [pg-boss](https://github.com/timgit/pg-boss), which runs inside the app process and keeps its tables in the `pgboss` schema of the same database. Run one app process per database: every process works the job queue.

For push notifications locally, generate VAPID keys (`npx web-push generate-vapid-keys`) and put them into `.env`. Browsers allow push on `http://localhost`; on a phone you need HTTPS (e.g. the deployed stack or a tunnel). On iPhone and iPad, push only works from the home screen app.

## Dungeon files

GMs pick a dungeon when they create a session. Dungeons are hand-written YAML or JSON files in the directory `DUNGEONS_DIR` (default `./dungeons`), one file per dungeon; the file name is the dungeon's id. They are read from disk, not stored in the database, so a fix to a file shows up on the next page load. The format is described in `.scratch/crawl-by-post-mvp/dungeon-format.md`, and `dungeons/example.yaml` is a complete example.

## Container image

Every push to `main` (and every `v*` tag) builds and publishes `ghcr.io/dasteph/crawl-by-post`, after type checks and tests pass. Tags: `latest` and `main` for the default branch, `sha-<short>`, and `<version>`/`<major>.<minor>` for `v*` tags.

Runtime environment:

| Variable            | Required | Description                                                                                     |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | Postgres connection string                                                                       |
| `ORIGIN`            | yes      | Public URL, e.g. `https://crawl.example.org` (needed by SvelteKit's form CSRF check)            |
| `DUNGEONS_DIR`      | no       | Directory with the dungeon files, default `./dungeons`. The image ships the example there; mount a volume over `/app/dungeons` for your own |
| `PUBLIC_VAPID_KEY`  | for push | VAPID public key for web push. Generate a pair once with `npx web-push generate-vapid-keys` and keep it: a new pair invalidates every device's subscription. Without it, push is off |
| `VAPID_PRIVATE_KEY` | for push | The matching VAPID private key                                                                   |
| `VAPID_SUBJECT`     | no       | Contact for push services, a `mailto:` or `https:` URL. Defaults to `PUBLIC_SOURCE_URL`          |
| `PUBLIC_SOURCE_URL` | no       | Source code link shown on every page (AGPL-3.0 §13). Defaults to this GitHub repository        |
| `PORT`              | no       | Listen port, default `3000`                                                                      |

Behind a reverse proxy you can use `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` instead of `ORIGIN` (see the [adapter-node docs](https://svelte.dev/docs/kit/adapter-node)).

## License

Copyright (C) 2026 DaSteph

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE) for the full text.
