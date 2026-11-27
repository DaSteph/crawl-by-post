<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { MAX_POST_LENGTH, POST_LIMITS } from '#lib/engine/turns.ts';
	import { text } from '#lib/text.ts';

	let {
		sessionId,
		me,
		holder,
		acting,
		serverError
	}: {
		sessionId: string;
		/** The visitor: the GM or a seat. */
		me: 'gm' | number;
		/** Who holds the spotlight, or null outside a crawl. */
		holder: 'gm' | number | null;
		/** True when the visitor's turn is a post (not accepting a challenge or rolling damage). */
		acting: boolean;
		serverError: string | null;
	} = $props();

	const myTurn = $derived(acting);
	let preConsent = $state(false);
	const limits = $derived(me === 'gm' ? POST_LIMITS.gm : POST_LIMITS.player);
	// The secret stays out of the key; the draft is per session and seat.
	const draftKey = $derived(`draft:${sessionId}:${me}`);

	let draft = $state('');
	let posting = $state(false);
	let clientError = $state<string | null>(null);
	// A server error belongs to the last submit; a new keystroke clears both.
	let showServerError = $state(true);

	onMount(() => {
		try {
			draft = localStorage.getItem(draftKey) ?? '';
		} catch {
			// Storage can be unavailable (private mode); the draft just isn't kept.
		}
	});

	function save(value: string) {
		try {
			if (value) localStorage.setItem(draftKey, value);
			else localStorage.removeItem(draftKey);
		} catch {
			// See onMount.
		}
	}

	function oninput() {
		clientError = null;
		showServerError = false;
		save(draft);
	}

	/** Adds text to the draft (e.g. a mood text on reveal). It stays an editable draft. */
	export function insert(value: string) {
		draft = draft.trim() ? `${draft.trimEnd()}\n\n${value}` : value;
		save(draft);
		clientError = null;
		showServerError = false;
		textarea?.focus();
	}

	let textarea: HTMLTextAreaElement | undefined = $state();

	const length = $derived(draft.trim().length);
	const over = $derived(length > limits.over);
	const placeholder = $derived(
		!myTurn ? text.compose.placeholderChat : me === 'gm' ? text.compose.placeholderGm : text.compose.placeholderTurn
	);
</script>

<form
	method="POST"
	action="?/post"
	class="compose"
	use:enhance={({ submitter, cancel }) => {
		if (!navigator.onLine) {
			clientError = text.compose.offline;
			cancel();
			return;
		}
		const isPass = submitter?.getAttribute('formaction') === '?/pass';
		posting = true;
		clientError = null;
		showServerError = true;
		return async ({ result, update }) => {
			posting = false;
			if (result.type === 'error') {
				clientError = navigator.onLine ? text.compose.failed : text.compose.offline;
				return;
			}
			if (result.type === 'success' && !isPass) {
				draft = '';
				save('');
				preConsent = false;
			}
			await update({ reset: false });
		};
	}}
>
	{#if holder !== null && holder !== me}
		<p class="warning small" id="compose-hint">{text.compose.outOfTurn}</p>
	{/if}
	<textarea
		name="text"
		rows="3"
		maxlength={MAX_POST_LENGTH}
		aria-label={text.compose.label}
		aria-describedby={holder !== null && holder !== me ? 'compose-hint' : undefined}
		{placeholder}
		bind:value={draft}
		bind:this={textarea}
		{oninput}
	></textarea>
	{#if myTurn && me !== 'gm'}
		<label class="consent">
			<input type="checkbox" name="preConsent" bind:checked={preConsent} aria-describedby="consent-hint" />
			<span>{text.challenge.preConsent} <span class="hint" id="consent-hint">· {text.challenge.preConsentHint}</span></span>
		</label>
	{/if}
	<div class="row">
		{#if length >= limits.show}
			<span class="count" class:over aria-live="polite">
				{text.compose.count(length, limits.over)}{#if over}<span class="sr">. {text.compose.tooLong}</span>{/if}
			</span>
		{:else}
			<span></span>
		{/if}
		<div class="buttons">
			{#if myTurn && me === 'gm'}
				<button class="button secondary" formaction="?/pass" disabled={posting}>{text.compose.pass}</button>
				<button class="button" name="as" value="action" disabled={posting || length === 0}>
					{text.compose.postResponse}
				</button>
			{:else if myTurn}
				<button class="button" name="as" value="action" disabled={posting || length === 0}>
					{text.compose.postTurn}
				</button>
			{:else}
				<button class="button" name="as" value="chat" disabled={posting || length === 0}>
					{text.compose.postChat}
				</button>
			{/if}
		</div>
	</div>
	{#if over}
		<p class="small over" aria-hidden="true">{text.compose.tooLong}</p>
	{/if}
	{#if clientError}
		<p class="error" role="alert">{clientError}</p>
	{:else if serverError && showServerError}
		<p class="error" role="alert">{serverError}</p>
	{/if}
</form>

<style>
	.compose {
		display: grid;
		gap: 8px;
	}
	p {
		margin: 0;
	}
	textarea {
		width: 100%;
		min-height: 72px;
		resize: vertical;
		padding: 8px 10px;
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		background: var(--paper);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.buttons {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-left: auto;
	}
	.count {
		font-size: 0.8rem;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.over {
		color: var(--over);
		font-weight: 700;
	}
	.consent {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
		font-size: 0.9rem;
	}
	.consent input {
		width: 20px;
		height: 20px;
		flex: none;
		accent-color: var(--ink);
	}
	.hint {
		color: var(--ink-2);
		font-size: 0.8rem;
	}
	.warning {
		font-style: italic;
		color: var(--ink-2);
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		font-weight: 700;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
