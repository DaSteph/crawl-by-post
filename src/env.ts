import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string, e.g. postgres://user:pass@host:5432/crawl',
		// Optional here so the build (which runs the app) works without a database;
		// the server fails at start-up if it is missing.
		schema: (value) => value
	},
	PUBLIC_SOURCE_URL: {
		public: true,
		description:
			'Where network users can get the source code (AGPL-3.0 section 13). Linked from every page.',
		schema: (value) => value || 'https://github.com/DaSteph/crawl-by-post'
	}
});
