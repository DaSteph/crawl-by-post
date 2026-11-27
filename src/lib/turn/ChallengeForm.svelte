<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { ABILITIES } from '#lib/character/model.ts';
	import { DC_PICKS, DEFAULT_DC, MAX_DC, MAX_STAKES_LENGTH, MIN_DC } from '#lib/engine/challenges.ts';
	import { formatDice } from '#lib/engine/dice.ts';
	import type { Sheet } from '#lib/engine/index.ts';
	import type { MapMonsterToken } from '#lib/engine/map.ts';
	import { darknessPresets } from '#lib/engine/light.ts';
	import { text } from '#lib/text.ts';

	let {
		sheet,
		preConsent,
		monsters,
		dark,
		error
	}: {
		/** The character who just acted and gets the challenge. */
		sheet: Sheet;
		preConsent: boolean;
		/** Monsters on the map an attack can target (the GM's view). */
		monsters: MapMonsterToken[];
		/** True when the character stands in darkness: disadvantage is preset. */
		dark: boolean;
		error: string | null;
	} = $props();

	const t = text.challenge;
	const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

	let type = $state<'test' | 'attack'>('test');
	let busy = $state(false);
	const weapons = $derived(sheet.character.weapons);
	/** The monster attacked, or '' for something without a placed token. */
	// Preset once when the form opens: the first monster still standing.
	let target = $state(untrack(() => monsters.find((m) => m.condition !== 'down')?.id ?? ''));
	const targetMonster = $derived(type === 'attack' ? monsters.find((m) => m.id === target) : undefined);
	// Preset once when the form opens; the GM changes it with one tap.
	const edgePreset = untrack(() => darknessPresets(dark).challenge);
</script>

<form
	method="POST"
	action="?/challenge"
	class="challenge"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<p class="muted small">
		{preConsent ? t.preConsented(sheet.character.name) : t.intro(sheet.character.name)}
	</p>

	<fieldset class="pills">
		<legend>{t.typeLabel}</legend>
		<label><input type="radio" bind:group={type} value="test" /><span>{t.test}</span></label>
		<label><input type="radio" bind:group={type} value="attack" /><span>{t.attack}</span></label>
	</fieldset>

	{#if type === 'test'}
		<fieldset class="pills">
			<legend>{t.abilityLabel}</legend>
			{#each ABILITIES as ability, i (ability)}
				<label>
					<input type="radio" name="check" value="test:{ability}" checked={i === 1} required />
					<span>{ability} <span class="mod">{signed(sheet.character.abilities[ability].modifier)}</span></span>
				</label>
			{/each}
		</fieldset>
	{:else if weapons.length}
		<fieldset class="pills">
			<legend>{t.weaponLabel}</legend>
			{#each weapons as weapon, i (i)}
				<label>
					<input type="radio" name="check" value="attack:{i}" checked={i === 0} required />
					<span>{weapon.name} <span class="mod">{signed(weapon.attackBonus)} · {formatDice(weapon.damage)}</span></span>
				</label>
			{/each}
		</fieldset>
	{:else}
		<p class="small">{t.noWeapons}</p>
	{/if}

	{#if type === 'attack' && monsters.length}
		<fieldset class="pills">
			<legend>{t.targetLabel}</legend>
			{#each monsters as m (m.id)}
				<label>
					<input type="radio" name="target" value={m.id} bind:group={target} />
					<span>{m.id} {m.name} <span class="mod">{text.monsters.ac} {m.gm?.ac} · {text.monsters.conditions[m.condition]}</span></span>
				</label>
			{/each}
			<label><input type="radio" name="target" value="" bind:group={target} /><span>{t.otherTarget}</span></label>
		</fieldset>
	{/if}

	{#if targetMonster?.gm}
		<p class="small"><strong>{t.dcFromAc(targetMonster.gm.ac)}</strong></p>
	{/if}
	{#if !targetMonster}
	<fieldset class="pills">
		<legend>{t.dcLabel}</legend>
		{#each DC_PICKS as dc (dc)}
			<label><input type="radio" name="dc" value={dc} checked={dc === DEFAULT_DC} /><span>{dc}</span></label>
		{/each}
		<label class="custom">
			<span class="sr">{t.customDc}</span>
			<input type="number" name="customDc" min={MIN_DC} max={MAX_DC} step="1" inputmode="numeric" placeholder={t.customDc} />
		</label>
		{#if type === 'attack'}<p class="muted small full">{t.dcHintAttack}</p>{/if}
	</fieldset>
	{/if}

	<fieldset class="pills">
		<legend>{t.edgeLabel}</legend>
		<label><input type="radio" name="edge" value="" checked={edgePreset === null} /><span>{t.edges.none}</span></label>
		<label><input type="radio" name="edge" value="advantage" checked={edgePreset === 'advantage'} /><span>{t.edges.advantage}</span></label>
		<label
			><input type="radio" name="edge" value="disadvantage" checked={edgePreset === 'disadvantage'} /><span
				>{t.edges.disadvantage}</span
			></label
		>
		{#if dark}<p class="muted small full">{text.light.darkPreset(sheet.character.name)}</p>{/if}
	</fieldset>

	<label class="stakes">
		<span class="legend">{t.stakesLabel}</span>
		<input type="text" name="stakes" maxlength={MAX_STAKES_LENGTH} placeholder={t.stakesPlaceholder} />
	</label>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
	<button class="button" disabled={busy || (type === 'attack' && !weapons.length)}>
		{preConsent ? t.submitRoll : t.submit}
	</button>
</form>

<style>
	.challenge {
		display: grid;
		gap: 12px;
	}
	p {
		margin: 0;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend,
	.legend {
		display: block;
		margin-bottom: 4px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pills legend {
		width: 100%;
	}
	.pills label:not(.custom) {
		position: relative;
	}
	.pills label:not(.custom) input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.pills label:not(.custom) span:first-of-type {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: var(--tap);
		min-width: var(--tap);
		justify-content: center;
		padding: 0 12px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-weight: 600;
	}
	.pills input:checked + span {
		background: var(--ink);
		color: var(--paper);
	}
	.pills input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.mod {
		font-weight: 400;
		font-size: 0.8rem;
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
	}
	.custom input {
		width: 7.5em;
		min-height: var(--tap);
		padding: 0 10px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		background: var(--surface);
	}
	.full {
		width: 100%;
	}
	.stakes {
		display: grid;
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
