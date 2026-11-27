<script lang="ts">
	import { enhance } from '$app/forms';
	import type { MapMonsterToken } from '#lib/engine/map.ts';
	import type { Sheet } from '#lib/engine/index.ts';
	import { formatDice } from '#lib/engine/dice.ts';
	import { MAX_HP } from '#lib/engine/monsters.ts';
	import { darknessPresets } from '#lib/engine/light.ts';
	import { text } from '#lib/text.ts';

	let {
		monsters,
		sheets,
		gmTurn,
		defaultSeat,
		darkSeats,
		moving,
		onmove,
		error,
		errorFor
	}: {
		/** The GM's view of the monsters on the map. */
		monsters: MapMonsterToken[];
		/** Characters a monster can attack. */
		sheets: Sheet[];
		/** Monsters only attack in the GM's turn. */
		gmTurn: boolean;
		/** The preset target: the player who just acted. */
		defaultSeat: number | null;
		/** Characters standing in darkness: attacks against them preset advantage. */
		darkSeats: number[];
		/** The monster whose move is being picked on the map. */
		moving: string | null;
		onmove: (id: string | null) => void;
		error: string | null;
		/** The monster the error is about, if any. */
		errorFor: string | null;
	} = $props();

	const t = text.monsters;
	let busy = $state(false);

	/** Edge value of the form ('' for neither) preset for an attack on `seat`. */
	const presetFor = (seat: number | undefined) =>
		darknessPresets(seat !== undefined && darkSeats.includes(seat)).monsterAttack ?? '';
	/** Target and edge per monster, once the GM has picked something. */
	let picks = $state<Record<string, { seat: number; edge: string }>>({});
	function pick(id: string) {
		const seat = picks[id]?.seat ?? defaultSeat ?? sheets[0]?.seat;
		return picks[id] ?? { seat, edge: presetFor(seat) };
	}
	const submit = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<div class="panel">
	{#if monsters.length === 0}
		<p class="muted small">{t.none}</p>
	{/if}
	{#if error && !errorFor}
		<p class="error" role="alert">{error}</p>
	{/if}
	<ul>
		{#each monsters as m (m.id)}
			{@const gm = m.gm!}
			<li>
				<details open={errorFor === m.id || moving === m.id}>
					<summary>
						<span><span class="disc" aria-hidden="true">{m.id}</span> {m.name}</span>
						<span class="muted small"
							>{t.hp} {gm.hp}/{gm.maxHp} · {t.ac} {gm.ac} · {t.conditions[m.condition]}</span
						>
					</summary>
					<div class="body">
						<form method="POST" action="?/monsterHp" class="row" use:enhance={submit}>
							<input type="hidden" name="id" value={m.id} />
							<label>
								<span class="legend">{t.hp}</span>
								<input type="number" name="hp" min="0" max={MAX_HP} step="1" inputmode="numeric" required value={gm.hp} />
							</label>
							<label>
								<span class="legend">{t.maxHp}</span>
								<input type="number" name="maxHp" min="1" max={MAX_HP} step="1" inputmode="numeric" required value={gm.maxHp} />
							</label>
							<button class="button secondary" disabled={busy}>{t.saveHp}</button>
						</form>

						<div class="row">
							{#if moving === m.id}
								<span class="small" role="status">{t.moving(m.id)}</span>
								<button type="button" class="button secondary" onclick={() => onmove(null)}>{t.cancelMove}</button>
							{:else}
								<button type="button" class="button secondary" onclick={() => onmove(m.id)}>{t.move}</button>
							{/if}
							<form method="POST" action="?/removeMonster" use:enhance={submit}>
								<input type="hidden" name="id" value={m.id} />
								<button class="button secondary" disabled={busy}>{t.remove}</button>
							</form>
						</div>

						{#if gm.attacks.length === 0}
							<p class="muted small">{t.noAttacks}</p>
						{:else}
							<form method="POST" action="?/monsterAttack" class="attack" use:enhance={submit}>
								<input type="hidden" name="id" value={m.id} />
								<fieldset class="pills">
									<legend>{t.attackOption}</legend>
									{#each gm.attacks as option, i (i)}
										<label>
											<input type="radio" name="option" value={i} checked={i === 0} required />
											<span
												>{option
													.map((a) =>
														t.attackLine(a.count, a.name, a.bonus, a.damage ? formatDice(a.damage) : null, a.effect)
													)
													.join(' + ')}</span
											>
										</label>
									{/each}
								</fieldset>
								<fieldset class="pills">
									<legend>{t.attackTarget}</legend>
									{#each sheets as s (s.seat)}
										<label>
											<input
												type="radio"
												name="seat"
												value={s.seat}
												checked={s.seat === pick(m.id).seat}
												onchange={() => (picks[m.id] = { seat: s.seat, edge: presetFor(s.seat) })}
												required
											/>
											<span>{s.character.name} <span class="mod">{t.ac} {s.character.ac}</span></span>
										</label>
									{/each}
								</fieldset>
								<fieldset class="pills">
									<legend>{text.challenge.edgeLabel}</legend>
									{#each ['', 'advantage', 'disadvantage'] as const as edge (edge)}
										<label
											><input
												type="radio"
												name="edge"
												value={edge}
												checked={pick(m.id).edge === edge}
												onchange={() => (picks[m.id] = { ...pick(m.id), edge })}
											/><span>{text.challenge.edges[edge || 'none']}</span></label
										>
									{/each}
									{#if darkSeats.includes(pick(m.id).seat)}
										{@const target = sheets.find((s) => s.seat === pick(m.id).seat)}
										{#if target}<p class="muted small full">{text.light.monsterDarkPreset(target.character.name)}</p>{/if}
									{/if}
								</fieldset>
								<p class="muted small">{gmTurn ? t.attackHint : t.attackNotNow}</p>
								<button class="button" disabled={busy || !gmTurn || sheets.length === 0}>{t.attackRoll}</button>
							</form>
						{/if}
						{#if error && errorFor === m.id}
							<p class="error" role="alert">{error}</p>
						{/if}
					</div>
				</details>
			</li>
		{/each}
	</ul>
</div>

<style>
	.panel {
		display: grid;
		gap: 8px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	p {
		margin: 0;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
		min-height: var(--tap);
		padding-block: 8px;
		cursor: pointer;
		font-weight: 600;
	}
	.disc {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--monster);
		color: var(--monster-text);
		box-shadow: 0 0 0 var(--monster-outline-width) var(--monster-outline);
		font-size: 0.65rem;
		font-weight: 700;
		vertical-align: middle;
	}
	.body {
		display: grid;
		gap: 12px;
		padding-bottom: 12px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px 12px;
	}
	.attack {
		display: grid;
		gap: 10px;
		padding: 10px 12px;
		border: 1.5px solid var(--ink);
		border-radius: var(--radius);
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
	.pills label {
		position: relative;
	}
	.pills input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.pills span:first-of-type {
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
	.full {
		width: 100%;
	}
	.mod {
		font-weight: 400;
		font-size: 0.8rem;
		opacity: 0.85;
	}
	input[type='number'] {
		width: 5.5em;
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
