<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Spotlight } from '#lib/engine/turns.ts';
	import { MAX_POST_LENGTH } from '#lib/engine/turns.ts';
	import { text } from '#lib/text.ts';

	let {
		spotlight,
		name,
		hours,
		error
	}: {
		/** The timed-out player's turn: an action, a challenge to answer, or damage to roll. */
		spotlight: Exclude<Spotlight, { kind: 'gm' }>;
		name: string;
		hours: number;
		error: string | null;
	} = $props();

	const t = text.timeout;
	let busy = $state(false);
	let writing = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<section class="prompt" aria-live="polite">
	<strong>{t.title(name)}</strong>
	<p class="muted small">{t.intro}</p>
	<form method="POST" action="?/resolveTimeout" class="stack" use:enhance={submit}>
		{#if spotlight.kind === 'player' && writing}
			<label for="play-as"><strong>{t.playAsLabel(name)}</strong></label>
			<textarea id="play-as" name="text" rows="3" maxlength={MAX_POST_LENGTH} required placeholder={t.playAsPlaceholder}></textarea>
			<p class="muted small">{t.playAsNote}</p>
			<div class="buttons">
				<button type="button" class="button secondary" onclick={() => (writing = false)} disabled={busy}>{t.cancel}</button>
				<button class="button" name="resolution" value="playAs" disabled={busy}>{t.postAs(name)}</button>
			</div>
		{:else}
			<div class="buttons">
				<button class="button secondary" name="resolution" value="skip" disabled={busy}>{t.skip}</button>
				<button class="button secondary" name="resolution" value="wait" disabled={busy}>{t.wait(hours)}</button>
				{#if spotlight.kind === 'player'}
					<button type="button" class="button" onclick={() => (writing = true)} disabled={busy}>{t.playAs(name)}</button>
				{:else}
					<button class="button" name="resolution" value="playAs" disabled={busy}>
						{spotlight.kind === 'challenge' ? t.rollFor(name) : t.rollDamageFor(name)}
					</button>
				{/if}
			</div>
		{/if}
	</form>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	.prompt {
		display: grid;
		gap: 6px;
		padding: 10px 12px;
		border: 2px solid var(--ink);
		border-radius: var(--radius);
	}
	p {
		margin: 0;
	}
	.stack {
		display: grid;
		gap: 6px;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	textarea {
		width: 100%;
		font: inherit;
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
		background: var(--surface);
		color: inherit;
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		font-weight: 700;
	}
</style>
