<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyLink from '#lib/CopyLink.svelte';
	import { MAX_PLAYERS } from '#lib/engine/index.ts';
	import DungeonMap from '#lib/map/DungeonMap.svelte';
	import { text } from '#lib/text.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const visitor = $derived(data.visitor);
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
			<span class="token {visitor.tokenColour}">P{visitor.seat}</span>
			{text.session.youArePlayer(visitor.seat)} ({text.colours[visitor.tokenColour]})
		</p>
	{/if}
</header>

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
	.mood {
		border-left: 3px solid var(--ink);
		padding-left: 10px;
		font-style: italic;
	}
</style>
