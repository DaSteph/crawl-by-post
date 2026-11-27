<script lang="ts">
	import { enhance } from '$app/forms';
	import { FLAME_LEVELS, MAX_LIGHT_COUNTER, type FlameLevel } from '#lib/engine/light.ts';
	import type { MapLight, MapToken } from '#lib/engine/map.ts';
	import { text } from '#lib/text.ts';

	let {
		lights,
		tokens,
		nameOf,
		me,
		canLight,
		error,
		errorFor
	}: {
		/** Burning light sources; counters are set only in the GM's view. */
		lights: MapLight[];
		/** Tokens on the map, for who stands in darkness. */
		tokens: MapToken[];
		nameOf: (seat: number) => string;
		/** The viewer's seat, or 'gm'. */
		me: number | 'gm';
		/** True for a player with a character and no burning light. */
		canLight: boolean;
		error: string | null;
		/** The light the error is about, if any. */
		errorFor: number | null;
	} = $props();

	const t = text.light;
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	/** Three bars for bright, two for flickering, one for guttering. */
	const bars = (level: FlameLevel) => FLAME_LEVELS.length - FLAME_LEVELS.indexOf(level);
	const dark = $derived(tokens.filter((tk) => tk.dark));
</script>

<div class="tracker">
	<ul class="chips" aria-label={t.title}>
		{#each lights as light (light.id)}
			{@const level = t.levels[light.level]}
			<li class="chip">
				<svg viewBox="-8 -9 16 15" aria-hidden="true" class="flame">
					<path d="M0 -7 C 5 -2, 4 4, 0 4 C -4 4, -5 -1, -1 -3 C -0.5 -1, 1 -1, 0 -7 Z" />
				</svg>
				<span>{light.seat === me ? t.yourTorch(level) : t.torchOf(nameOf(light.seat), level)}</span>
				<span class="bars" aria-hidden="true">
					{#each [1, 2, 3] as n (n)}<i class:on={n <= bars(light.level)}></i>{/each}
				</span>
			</li>
		{/each}
		{#each dark as token (token.seat)}
			<li class="chip dark">{token.seat === me ? t.youInDarkness : t.inDarkness(nameOf(token.seat))}</li>
		{/each}
		{#if lights.length === 0 && dark.length === 0}
			<li class="muted small">{t.none}</li>
		{/if}
	</ul>

	{#if canLight}
		<form method="POST" action="?/lightTorch" class="light" use:enhance={submit}>
			<button class="button secondary" disabled={busy}>{t.lightTorch}</button>
			<span class="muted small">{t.lightHint}</span>
		</form>
	{/if}

	{#if me === 'gm' && lights.length}
		<details open={errorFor !== null}>
			<summary><span>{t.counters}</span></summary>
			<p class="muted small">{t.countersHint}</p>
			<ul class="counters">
				{#each lights as light (light.id)}
					<li>
						<form method="POST" action="?/lightCounter" class="row" use:enhance={submit}>
							<input type="hidden" name="id" value={light.id} />
							<label for="counter-{light.id}">{t.counterLabel(nameOf(light.seat))}</label>
							<input
								id="counter-{light.id}"
								name="counter"
								type="number"
								inputmode="numeric"
								min="0"
								max={MAX_LIGHT_COUNTER}
								step="1"
								required
								value={light.counter}
							/>
							<span class="muted small">{t.levels[light.level]}</span>
							<button class="button secondary" disabled={busy}>{t.save}</button>
						</form>
						{#if light.outIn !== null}
							<p class="small">{t.goingOut(light.outIn)}</p>
						{/if}
						{#if error && errorFor === light.id}
							<p class="error" role="alert">{error}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if error && errorFor === null}
		<p class="error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.tracker {
		display: grid;
		gap: 8px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	p {
		margin: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-size: 0.85rem;
	}
	.chip.dark {
		border-style: dashed;
		color: var(--ink-2);
	}
	.flame {
		width: 14px;
		height: 14px;
	}
	.flame path {
		fill: var(--ink);
	}
	.bars {
		display: inline-flex;
		gap: 2px;
		align-items: flex-end;
	}
	.bars i {
		display: block;
		width: 4px;
		border: 1px solid var(--ink);
	}
	.bars i:nth-child(1) {
		height: 6px;
	}
	.bars i:nth-child(2) {
		height: 9px;
	}
	.bars i:nth-child(3) {
		height: 12px;
	}
	.bars i.on {
		background: var(--ink);
	}
	.light {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
	}
	summary {
		min-height: var(--tap);
		padding-block: 10px;
		cursor: pointer;
		font-weight: 600;
	}
	.counters {
		display: grid;
		gap: 6px;
		margin-top: 6px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
	}
	input[type='number'] {
		width: 5em;
		min-height: var(--tap);
		padding: 8px 10px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.small {
		font-size: 0.85rem;
	}
	.error {
		font-weight: 700;
	}
</style>
