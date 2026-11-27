<script lang="ts">
	import { text } from '#lib/text.ts';

	let { link, label }: { link: string; label: string } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard can be unavailable (e.g. non-HTTPS); the field stays selectable.
		}
	}
</script>

<div class="copy">
	<input type="url" readonly value={link} aria-label={label} onfocus={(e) => e.currentTarget.select()} />
	<button type="button" class="button secondary" onclick={copy}>
		{copied ? text.saveLink.copied : text.saveLink.copy}
	</button>
</div>

<style>
	.copy {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.copy input {
		flex: 1 1 14rem;
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
	}
</style>
