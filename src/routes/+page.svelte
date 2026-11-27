<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyLink from '#lib/CopyLink.svelte';
	import { text } from '#lib/text.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const valid = $derived(data.dungeons.filter((d) => d.ok));
	const invalid = $derived(data.dungeons.filter((d) => !d.ok));
</script>

<svelte:head>
	<title>{text.appName}</title>
</svelte:head>

{#if form && 'created' in form && form.created}
	<section class="card stack">
		<h1>{text.saveLink.title}</h1>
		<p>{text.saveLink.intro} <strong>{form.created.name}</strong>:</p>
		<CopyLink link={form.created.link} label={text.saveLink.title} />
		<p class="warning">{text.saveLink.warning}</p>
		<a class="button" href={form.created.path}>{text.saveLink.open}</a>
	</section>
{:else}
	<header class="stack">
		<h1>{text.appName}</h1>
		<p class="muted">{text.tagline}</p>
	</header>

	<form method="POST" use:enhance class="card stack">
		<h2>{text.start.title}</h2>
		<label class="stack-sm">
			<span>{text.start.nameLabel}</span>
			<input
				type="text"
				name="name"
				required
				maxlength="80"
				placeholder={text.start.namePlaceholder}
				value={form && 'name' in form ? form.name : ''}
			/>
		</label>
		<label class="stack-sm">
			<span>{text.start.dungeonLabel}</span>
			{#if valid.length}
				<select name="dungeon" required>
					{#if valid.length > 1}
						<option value="" disabled selected={!(form && 'dungeon' in form)}>{text.start.dungeonPlaceholder}</option>
					{/if}
					{#each valid as dungeon (dungeon.id)}
						<option value={dungeon.id} selected={form && 'dungeon' in form && form.dungeon === dungeon.id}>
							{dungeon.ok ? dungeon.name : dungeon.id}
						</option>
					{/each}
				</select>
			{:else}
				<span class="muted">{text.start.noDungeons}</span>
			{/if}
		</label>
		{#if invalid.length}
			<details class="small">
				<summary>{text.start.invalidDungeons} {invalid.map((d) => d.id).join(', ')}</summary>
				{#each invalid as dungeon (dungeon.id)}
					<p><strong>{dungeon.id}</strong></p>
					<ul class="errors">
						{#each dungeon.ok ? [] : dungeon.errors as error, i (i)}
							<li>{error}</li>
						{/each}
					</ul>
				{/each}
			</details>
		{/if}
		{#if form && 'error' in form}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		<button class="button" disabled={!valid.length}>{text.start.submit}</button>
		<p class="muted small">{text.start.noAccount}</p>
	</form>
{/if}

<style>
	.stack {
		display: grid;
		gap: 12px;
	}
	.stack-sm {
		display: grid;
		gap: 4px;
	}
	header {
		margin-bottom: 24px;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	.warning {
		border-left: 4px solid var(--ink);
		padding-left: 12px;
		font-weight: 600;
	}
	.error {
		font-weight: 700;
	}
	.small {
		font-size: 0.85rem;
	}
	select {
		width: 100%;
		min-height: var(--tap);
		padding: 8px 10px;
		background: var(--surface);
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		font: inherit;
		color: inherit;
	}
	summary {
		cursor: pointer;
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}
	.errors {
		margin: 4px 0 12px;
		padding-left: 18px;
		font-family: ui-monospace, monospace;
		overflow-wrap: anywhere;
	}
</style>
