// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		interface PageData {
			/** Path of the page's own web manifest, if it differs from the default one. */
			manifest?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
