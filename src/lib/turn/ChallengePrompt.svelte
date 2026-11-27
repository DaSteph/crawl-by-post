<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Challenge, WeaponRef } from '#lib/engine/challenges.ts';
	import { formatDice } from '#lib/engine/dice.ts';
	import { text } from '#lib/text.ts';
	import { describeCheck } from './describe.ts';

	let {
		pending,
		mine,
		name,
		error
	}: {
		/** The challenge waiting for an answer, or the weapon whose damage is due after a hit. */
		pending: { kind: 'challenge'; challenge: Challenge } | { kind: 'damage'; weapon: WeaponRef };
		/** True for the player who has to answer; everyone else just sees what's going on. */
		mine: boolean;
		name: string;
		error: string | null;
	} = $props();

	const t = text.challenge;
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<section class="prompt" class:mine aria-live="polite">
	{#if pending.kind === 'challenge'}
		{@const c = pending.challenge}
		<strong>{mine ? t.yourChallenge : t.waiting(name)}</strong>
		<p class="check">
			{#if c.check.type === 'committedRoll'}
				{describeCheck(c.check)}
			{:else}
				{describeCheck(c.check)} · {text.challenge.dcLabel} {c.dc}{#if c.edge} · {t.edgeNote[c.edge]}{/if}
			{/if}
		</p>
		{#if c.stakes}<p class="stakes">{c.stakes}</p>{/if}
		{#if mine}
			<form method="POST" action="?/answer" class="buttons" use:enhance={submit}>
				<button class="button secondary" name="answer" value="decline" disabled={busy}>{t.decline}</button>
				<button class="button" name="answer" value="accept" disabled={busy}>{t.accept}</button>
			</form>
			<p class="muted small">{c.check.type === 'committedRoll' ? text.wandering.rollHint : t.acceptHint}</p>
		{/if}
	{:else}
		<strong>{mine ? t.hit : t.waitingDamage(name)}</strong>
		{#if mine}
			<form method="POST" action="?/damage" class="buttons" use:enhance={submit}>
				<button class="button" disabled={busy}>{t.rollDamage(formatDice(pending.weapon.damage))}</button>
			</form>
		{/if}
	{/if}
	{#if mine && error}
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
	.prompt.mine {
		border-style: solid;
	}
	p {
		margin: 0;
	}
	.check {
		font-weight: 600;
	}
	.stakes {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
		font-style: italic;
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
