<script lang="ts">
	import { enhance } from '$app/forms';
	import CopyLink from '#lib/CopyLink.svelte';
	import { text } from '#lib/text.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
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
		{#if form && 'error' in form}
			<p class="error" role="alert">{form.error}</p>
		{/if}
		<button class="button">{text.start.submit}</button>
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
</style>
