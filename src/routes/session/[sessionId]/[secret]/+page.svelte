<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { DANGER_LEVELS } from '#lib/engine/turns.ts';
	import Compose from '#lib/turn/Compose.svelte';
	import Log from '#lib/turn/Log.svelte';
	import CopyLink from '#lib/CopyLink.svelte';
	import CharacterCard from '#lib/character/CharacterCard.svelte';
	import { MAX_INVENTORY_LENGTH, MAX_PLAYERS } from '#lib/engine/index.ts';
	import DungeonMap from '#lib/map/DungeonMap.svelte';
	import { text } from '#lib/text.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const visitor = $derived(data.visitor);
	const ownSheet = $derived(visitor.role === 'player' ? (data.sheets[0] ?? null) : null);
	const sheetBySeat = $derived(new Map(data.sheets.map((s) => [s.seat, s])));
	let importing = $state(false);
	let savingInventory = $state(false);
	let startingCrawl = $state(false);

	const me = $derived(visitor.role === 'gm' ? 'gm' : visitor.role === 'player' ? visitor.seat : null);
	const crawl = $derived(data.crawl);
	const holder = $derived(crawl ? (crawl.spotlight.kind === 'gm' ? 'gm' : crawl.spotlight.seat) : null);
	const nameOf = (seat: number) => data.people.find((p) => p.seat === seat)?.name ?? text.session.player(seat);
	const turnLine = $derived.by(() => {
		if (holder === null) return null;
		if (holder === me) return me === 'gm' ? text.crawl.yourTurnGm : text.crawl.yourTurn;
		if (holder === 'gm') return text.crawl.gmTurn;
		return me === 'gm' ? text.crawl.waitingFor(nameOf(holder)) : text.crawl.playerTurn(nameOf(holder));
	});

	// No live updates: refresh when the app comes back into view.
	onMount(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible') invalidateAll();
		};
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});
</script>

<svelte:head>
	<title>{visitor.sessionName} · {text.appName}</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<header class="stack">
	<h1>{visitor.sessionName}</h1>
	{#if visitor.role === 'gm'}
		<p class="role"><span class="badge">GM</span> {text.session.youAreGm}</p>
	{:else if visitor.role === 'player'}
		<p class="role">
			<span class="token {visitor.tokenColour}">{ownSheet?.initials ?? `P${visitor.seat}`}</span>
			{text.session.youArePlayer(visitor.seat)} ({text.colours[visitor.tokenColour]})
		</p>
	{/if}
</header>

<section class="turn" class:mine={holder !== null && holder === me} aria-live="polite">
	{#if crawl && turnLine}
		<strong>{turnLine}</strong>
		<span class="muted small">{text.crawl.status(text.crawl.dangers[crawl.danger], crawl.round)}</span>
	{:else}
		<strong>{text.crawl.notStarted}</strong>
		{#if visitor.role === 'player'}<span class="muted small">{text.crawl.notStartedPlayer}</span>{/if}
	{/if}
</section>

{#snippet crawlForm()}
	<form
		method="POST"
		action="?/startCrawl"
		class="stack-sm"
		use:enhance={() => {
			startingCrawl = true;
			return async ({ update }) => {
				await update();
				startingCrawl = false;
			};
		}}
	>
		<fieldset class="stack-sm">
			<legend><strong>{text.crawl.dangerLabel}</strong></legend>
			{#each DANGER_LEVELS as danger (danger)}
				<label class="choice">
					<input type="radio" name="danger" value={danger} required checked={danger === (crawl?.danger ?? 'risky')} />
					<span>{text.crawl.dangers[danger]} <span class="muted small">· {text.crawl.dangerHints[danger]}</span></span>
				</label>
			{/each}
		</fieldset>
		{#if form?.crawlError}
			<p class="error" role="alert">{form.crawlError}</p>
		{/if}
		<button class="button" disabled={startingCrawl}>{text.crawl.start}</button>
	</form>
{/snippet}

{#if visitor.role === 'gm' && !crawl}
	<section class="card stack">
		<h2>{text.crawl.startTitle}</h2>
		<p class="muted">{text.crawl.startIntro}</p>
		{@render crawlForm()}
	</section>
{/if}

<section class="card map-card stack" aria-label={text.map.areas}>
	{#if data.map.ok}
		<h2>{data.map.view.dungeonName}</h2>
		<DungeonMap view={data.map.view} />
		{#if visitor.role === 'gm'}
			<p class="muted small">{text.map.gmHint}</p>
		{/if}
	{:else if data.map.errors}
		<p class="error">{text.map.gmErrors}</p>
		<ul class="file-errors">
			{#each data.map.errors as error, i (i)}
				<li>{error}</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{text.map.unavailable}</p>
	{/if}
</section>

{#if me !== null}
	<section class="card stack">
		<Log log={data.log} people={data.people} />
		<Compose sessionId={page.params.sessionId!} {me} {holder} serverError={form?.postError ?? null} />
	</section>
{/if}

{#if visitor.role === 'gm' && crawl}
	<section class="card">
		<details>
			<summary><span>{text.crawl.restartTitle}</span><span class="muted small">{text.crawl.restartHint}</span></summary>
			{@render crawlForm()}
		</details>
	</section>
{/if}

{#if visitor.role === 'player'}
	<section class="card stack" aria-label={text.character.importTitle}>
		{#if ownSheet}
			<details open>
				<summary><span>{ownSheet.character.name}</span><span class="muted small">{text.character.hp} {ownSheet.hp}/{ownSheet.character.maxHp} · {text.character.ac} {ownSheet.character.ac}</span></summary>
				<CharacterCard sheet={ownSheet} />
			</details>
			<form
				method="POST"
				action="?/saveInventory"
				class="stack-sm"
				use:enhance={() => {
					savingInventory = true;
					return async ({ update }) => {
						await update({ reset: false });
						savingInventory = false;
					};
				}}
			>
				<label for="inventory"><strong>{text.character.inventory}</strong></label>
				<p class="muted small" id="inventory-hint">{text.character.inventoryHint}</p>
				<textarea
					id="inventory"
					name="inventory"
					rows="5"
					maxlength={MAX_INVENTORY_LENGTH}
					aria-describedby="inventory-hint">{ownSheet.inventory}</textarea
				>
				{#if form?.inventoryError}
					<p class="error" role="alert">{form.inventoryError}</p>
				{/if}
				<div class="row">
					<button class="button" disabled={savingInventory}>{text.character.inventorySave}</button>
					{#if form?.inventorySaved}<span class="muted small" role="status">{text.character.inventorySaved}</span>{/if}
				</div>
			</form>
		{:else}
			<h2>{text.character.importTitle}</h2>
			<p class="muted">{text.character.importIntro}</p>
			<form
				method="POST"
				action="?/importCharacter"
				enctype="multipart/form-data"
				class="stack-sm"
				use:enhance={() => {
					importing = true;
					return async ({ update }) => {
						await update();
						importing = false;
					};
				}}
			>
				<label for="export">{text.character.fileLabel}</label>
				<input id="export" name="export" type="file" accept=".json,application/json" required />
				{#if form?.importErrors}
					<div role="alert" class="stack-sm">
						<p class="error">{text.character.importFailed}</p>
						<ul class="file-errors">
							{#each form.importErrors as e, i (i)}
								<li>{e}</li>
							{/each}
						</ul>
					</div>
				{/if}
				<button class="button" disabled={importing}>{text.character.importSubmit}</button>
			</form>
		{/if}
	</section>
{/if}

{#if visitor.role === 'gm' && data.map.ok}
	<section class="card stack">
		<h2>{text.map.areas}</h2>
		<ul class="stack-sm">
			{#each data.map.view.areas as area (area.id)}
				<li>
					<details>
						<summary>
							<span>{area.name ?? text.map.corridor(area.id)}</span>
							<span class="muted small">{area.id} · {area.revealed ? text.map.revealed : text.map.hidden}</span>
						</summary>
						<dl>
							{#if area.mood}
								<dt>{text.map.mood}</dt>
								<dd class="mood">{area.mood}</dd>
							{/if}
							{#if area.notes}
								<dt>{text.map.notes}</dt>
								<dd>{area.notes}</dd>
							{/if}
							{#if area.monsters.length}
								<dt>{text.map.monsters}</dt>
								<dd>
									{area.monsters.map((m) => `${m.count} × ${m.name} (${m.label})`).join(', ')}
								</dd>
							{/if}
						</dl>
					</details>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.players}
	<section class="card stack">
		<h2>{text.session.players}</h2>
		{#if data.players.length === 0}
			<p class="muted">{text.session.noPlayers}</p>
		{:else}
			<p class="muted">{text.session.linkHint}</p>
			<ul class="stack">
				{#each data.players as player (player.seat)}
					<li class="stack-sm">
						<span class="role">
							<span class="token {player.tokenColour}">P{player.seat}</span>
							{text.session.player(player.seat)} ({text.colours[player.tokenColour]})
						</span>
						<CopyLink link={player.link} label={text.session.player(player.seat)} />
						{#if sheetBySeat.get(player.seat)}
							{@const sheet = sheetBySeat.get(player.seat)!}
							<details>
								<summary><span>{sheet.character.name}</span><span class="muted small">{text.character.hp} {sheet.hp}/{sheet.character.maxHp} · {text.character.ac} {sheet.character.ac}</span></summary>
								<CharacterCard {sheet} />
								{#if sheet.inventory}
									<p class="small"><strong>{text.character.inventory}:</strong> <span class="pre">{sheet.inventory}</span></p>
								{/if}
							</details>
						{:else}
							<p class="muted small">{text.character.noCharacter}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		{#if data.players.length < MAX_PLAYERS}
			<form method="POST" action="?/addPlayer" use:enhance>
				<button class="button">{text.session.addPlayer}</button>
			</form>
		{:else}
			<p class="muted">{text.session.tableFull}</p>
		{/if}
	</section>
{/if}

<style>
	.stack {
		display: grid;
		gap: 12px;
	}
	.stack-sm {
		display: grid;
		gap: 6px;
	}
	header {
		margin-bottom: 24px;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.role {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		padding: 0 6px;
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.error {
		font-weight: 700;
	}
	section + section {
		margin-top: 16px;
	}
	.map-card {
		padding: 12px;
	}
	.small {
		font-size: 0.85rem;
	}
	.file-errors {
		padding-left: 18px;
		list-style: disc;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		min-height: var(--tap);
		padding-block: 10px;
		cursor: pointer;
		font-weight: 600;
	}
	dl {
		margin: 0 0 12px;
	}
	dt {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
		margin-top: 8px;
	}
	dd {
		margin: 2px 0 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
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
	.pre {
		white-space: pre-wrap;
	}
	.turn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		padding: 10px 14px;
		border: 2px solid var(--ink);
		border-radius: 14px;
	}
	.turn.mine {
		background: var(--ink);
		color: var(--paper);
	}
	.turn.mine .muted {
		color: inherit;
		opacity: 0.8;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	.choice {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--tap);
	}
	.choice input {
		width: 20px;
		height: 20px;
		accent-color: var(--ink);
		flex: none;
	}
	.mood {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
		font-style: italic;
	}
</style>
