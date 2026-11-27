<script lang="ts">
	import { enhance } from '$app/forms';
	import type { WanderingCheck } from '#lib/engine/wandering.ts';
	import { text } from '#lib/text.ts';

	let {
		check,
		players,
		defaultSeat,
		preConsentSeat,
		error
	}: {
		check: WanderingCheck;
		/** Players in spotlight order who can roll the check. */
		players: { seat: number; name: string }[];
		/** The next player in the spotlight order, or null outside the GM's turn (no setting then). */
		defaultSeat: number | null;
		/** The player who just acted with pre-consent: their check rolls right away. */
		preConsentSeat: number | null;
		error: string | null;
	} = $props();

	const t = text.wandering;
	let busy = $state(false);
	// Follows the default until the GM picks someone else.
	let picked = $state<number | null>(null);
	const seat = $derived(picked ?? defaultSeat);
	const nameOf = (s: number | null) => players.find((p) => p.seat === s)?.name ?? '';
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			picked = null;
		};
	};
</script>

<section class="prompt" class:due={check === 'due'} aria-live="polite">
	<strong>{check === 'due' ? t.due : t.postponed}</strong>
	<form method="POST" action="?/wanderingCheck" class="stack" use:enhance={submit}>
		{#if defaultSeat !== null}
			<p class="muted small">{check === 'due' ? t.dueIntro(nameOf(seat)) : t.postponedIntro}</p>
			{#if players.length > 1}
				<fieldset class="who">
					<legend class="small"><strong>{t.whoLabel}</strong></legend>
					{#each players as p (p.seat)}
						<label class="choice">
							<input type="radio" name="seat" value={p.seat} checked={p.seat === seat} onchange={() => (picked = p.seat)} />
							<span>{p.name}{#if p.seat === defaultSeat} <span class="muted small">· {t.next}</span>{/if}</span>
						</label>
					{/each}
				</fieldset>
			{:else}
				<input type="hidden" name="seat" value={seat} />
			{/if}
		{:else}
			<p class="muted small">{t.notYourTurn}</p>
		{/if}
		<div class="buttons">
			<button class="button secondary" name="decision" value="skip" disabled={busy}>{t.skip}</button>
			{#if check === 'due'}
				<button class="button secondary" name="decision" value="postpone" disabled={busy}>{t.postpone}</button>
			{/if}
			{#if defaultSeat !== null}
				<button class="button" name="decision" value="set" disabled={busy}>
					{seat === preConsentSeat ? t.setRoll(nameOf(seat)) : t.set(nameOf(seat))}
				</button>
			{/if}
		</div>
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
		border: 2px dashed var(--ink);
		border-radius: var(--radius);
	}
	.prompt.due {
		border-style: solid;
	}
	p {
		margin: 0;
	}
	.stack {
		display: grid;
		gap: 6px;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.who legend {
		padding: 0;
		margin-bottom: 4px;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		font-weight: 700;
	}
</style>
