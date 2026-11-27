<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { PUBLIC_SOURCE_URL } from '$app/env/public';
	import { text } from '#lib/text.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		// Installability (and later web push) only; the worker caches nothing.
		if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
	});
</script>

<svelte:head>
	<link rel="icon" href="/icon.svg" type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#f7f6f1" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#24272c" media="(prefers-color-scheme: dark)" />
</svelte:head>

<main>
	{@render children()}
</main>

<!-- AGPL-3.0 section 13: network users must be offered the source. -->
<footer class="muted">
	<a href={PUBLIC_SOURCE_URL} rel="noopener">{text.sourceLink}</a> · {text.license}
</footer>

<style>
	main {
		flex: 1;
		width: 100%;
		max-width: 40rem;
		margin-inline: auto;
	}
	footer {
		margin-top: 32px;
		text-align: center;
		font-size: 0.85rem;
	}
</style>
