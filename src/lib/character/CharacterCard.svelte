<script lang="ts">
	import { formatDice } from '#lib/engine/dice.ts';
	import type { Sheet } from '#lib/engine/index.ts';
	import { text } from '#lib/text.ts';
	import { ABILITIES } from './model.ts';

	let { sheet }: { sheet: Sheet } = $props();
	const c = $derived(sheet.character);
	const t = text.character;

	const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
</script>

<article class="card-body">
	<header class="head">
		<span class="token {sheet.tokenColour}" aria-hidden="true">{sheet.initials}</span>
		<div>
			<h3>{c.name}</h3>
			<p class="muted small">
				{t.summary(c.ancestry, c.className, c.level)}{c.title ? ` · ${c.title}` : ''}
			</p>
		</div>
	</header>

	<dl class="vitals">
		<div>
			<dt>{t.hp}</dt>
			<dd><strong>{sheet.hp}</strong> / {c.maxHp}</dd>
		</div>
		<div>
			<dt>{t.ac}</dt>
			<dd><strong>{c.ac}</strong></dd>
		</div>
	</dl>

	<h4>{t.abilities}</h4>
	<dl class="abilities">
		{#each ABILITIES as ability (ability)}
			<div>
				<dt>{ability}</dt>
				<dd><strong>{signed(c.abilities[ability].modifier)}</strong> <span class="muted">({c.abilities[ability].score})</span></dd>
			</div>
		{/each}
	</dl>

	{#if c.weapons.length || c.otherAttacks.length}
		<h4>{t.weapons}</h4>
		<ul class="lines">
			{#each c.weapons as w, i (i)}
				<li>
					<strong>{w.name}</strong>
					<span class="muted small">
						{t.weaponLine(signed(w.attackBonus), w.range ? t.ranges[w.range] : null, formatDice(w.damage), w.properties)}
					</span>
				</li>
			{/each}
			{#each c.otherAttacks as line, i (i)}
				<li class="small">{line}</li>
			{/each}
		</ul>
	{/if}

	{#if c.spells.length || c.spellcasting !== null}
		<h4>{t.spells}</h4>
		{#if c.spellcasting !== null}
			<p class="small muted">{t.spellcasting(signed(c.spellcasting))}</p>
		{/if}
		<p>{c.spells.join(', ')}</p>
	{/if}

	{#if c.gear.length}
		<h4>{t.gear}</h4>
		<p>{c.gear.map((g) => (g.quantity > 1 ? `${g.name} ×${g.quantity}` : g.name)).join(', ')}</p>
	{/if}

	{#if c.treasures.length}
		<h4>{t.treasures}</h4>
		<ul class="lines">
			{#each c.treasures as tr, i (i)}
				<li>
					<strong>{tr.name}</strong>
					{#if tr.description}<span class="muted small">{tr.description}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if c.languages.length}
		<h4>{t.languages}</h4>
		<p>{c.languages.join(', ')}</p>
	{/if}

	<p class="muted small">{t.readOnly}</p>
</article>

<style>
	.card-body {
		display: grid;
		gap: 8px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	h3,
	h4,
	p {
		margin: 0;
	}
	h4 {
		margin-top: 8px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}
	.small {
		font-size: 0.85rem;
	}
	dl {
		margin: 0;
	}
	dt {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--ink-2);
	}
	dd {
		margin: 0;
	}
	.vitals {
		display: flex;
		gap: 24px;
		font-size: 1.1rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
		gap: 8px;
	}
	.abilities div {
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
		padding: 6px 8px;
		text-align: center;
	}
	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.lines li {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		align-items: baseline;
	}
</style>
