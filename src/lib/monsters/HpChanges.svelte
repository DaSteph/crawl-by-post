<script lang="ts">
	import { enhance } from '$app/forms';
	import type { MapMonsterToken } from '#lib/engine/map.ts';
	import type { Sheet } from '#lib/engine/index.ts';
	import { conditionOf, MAX_HP, type HpChange } from '#lib/engine/monsters.ts';
	import { text } from '#lib/text.ts';

	let {
		changes,
		monsters,
		sheets,
		error
	}: {
		/** Damage waiting for the GM's confirmation. */
		changes: HpChange[];
		monsters: MapMonsterToken[];
		sheets: Sheet[];
		error: string | null;
	} = $props();

	const t = text.hp;
	let busy = $state(false);
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};

	/** Who takes the damage, and their HP now. */
	function describe(change: HpChange) {
		if (change.target.kind === 'monster') {
			const id = change.target.id;
			const m = monsters.find((x) => x.id === id);
			return m?.gm ? { name: t.monster(m.id, m.name), hp: m.gm.hp, maxHp: m.gm.maxHp, monster: true } : null;
		}
		const seat = change.target.seat;
		const s = sheets.find((x) => x.seat === seat);
		return s ? { name: s.character.name, hp: s.hp, maxHp: s.character.maxHp, monster: false } : null;
	}
</script>

<section class="changes" aria-live="polite">
	<strong>{t.title}</strong>
	<p class="muted small">{t.intro}</p>
	<ul>
		{#each changes as change (change.id)}
			{@const who = describe(change)}
			{#if who}
				{@const to = Math.max(0, who.hp - change.amount)}
				<li>
					<form method="POST" action="?/hpChange" use:enhance={submit}>
						<input type="hidden" name="id" value={change.id} />
						<div class="what">
							<span class="name">{who.name}</span>
							<span class="muted small"
								>{t.preview(
									who.hp,
									to,
									who.monster
										? text.monsters.conditions[conditionOf(to, who.maxHp)]
										: to === 0
											? text.character.dyingToken
											: null
								)}</span
							>
						</div>
						<div class="row">
							<label>
								<span aria-hidden="true">−</span>
								<input
									type="number"
									name="amount"
									min="0"
									max={MAX_HP}
									step="1"
									inputmode="numeric"
									value={change.amount}
									aria-label={t.amount}
								/>
							</label>
							<button class="button secondary" name="ruling" value="dismiss" disabled={busy}>{t.dismiss}</button>
							<button class="button" name="ruling" value="confirm" disabled={busy}>{t.confirm}</button>
						</div>
					</form>
				</li>
			{/if}
		{/each}
	</ul>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	.changes {
		display: grid;
		gap: 6px;
		padding: 10px 12px;
		border: 2px solid var(--ink);
		border-radius: var(--radius);
	}
	p {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	li + li {
		border-top: 1px dashed var(--ink-2);
		padding-top: 8px;
	}
	form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}
	.what {
		display: grid;
	}
	.name {
		font-weight: 600;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 700;
	}
	input[type='number'] {
		width: 4.5em;
		min-height: var(--tap);
		box-sizing: border-box;
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
