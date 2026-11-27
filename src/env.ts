import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string, e.g. postgres://user:pass@host:5432/crawl',
		// Optional here so the build (which runs the app) works without a database;
		// the server fails at start-up if it is missing.
		schema: (value) => value
	},
	DUNGEONS_DIR: {
		description: 'Directory with the dungeon files (*.yaml, *.yml, *.json) GMs can pick from.',
		schema: (value) => value || './dungeons'
	},
	PUBLIC_VAPID_KEY: {
		public: true,
		description:
			'VAPID public key for web push. Generate a key pair with `npx web-push generate-vapid-keys`. Without it, push is off.',
		schema: (value) => value
	},
	VAPID_PRIVATE_KEY: {
		description: 'VAPID private key matching PUBLIC_VAPID_KEY.',
		schema: (value) => value
	},
	VAPID_SUBJECT: {
		description:
			'Contact for push services, as a mailto: or https: URL. Defaults to PUBLIC_SOURCE_URL.',
		schema: (value) => value
	},
	PUBLIC_SOURCE_URL: {
		public: true,
		description:
			'Where network users can get the source code (AGPL-3.0 section 13). Linked from every page.',
		schema: (value) => value || 'https://github.com/DaSteph/crawl-by-post'
	}
});
