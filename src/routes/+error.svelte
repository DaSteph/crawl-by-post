<script lang="ts">
	import { page } from '$app/state';
	import { text } from '#lib/text.ts';
</script>

<svelte:head>
	<title>{text.appName}</title>
</svelte:head>

<section class="card">
	{#if page.status === 404}
		<h1>{text.errors.badLinkTitle}</h1>
		<p>{text.errors.badLink}</p>
	{:else}
		<h1>{text.errors.genericTitle}</h1>
	{/if}
	<a class="button secondary" href="/">{text.errors.home}</a>
</section>

<style>
	section {
		display: grid;
		gap: 12px;
		justify-items: start;
	}
	h1,
	p {
		margin: 0;
	}
</style>
